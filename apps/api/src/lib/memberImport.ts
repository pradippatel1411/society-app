import { eq, and } from 'drizzle-orm'
import type { Database } from '../db/client'
import {
  flats,
  flatMembers,
  users,
  societyRoles,
  societies,
} from '../db/schema'
import { parseExcel, type ExcelMemberRow } from './excel'
import type { SocietyRole } from '../db/types'

export type ImportResult = {
  success: boolean
  rowsParsed: number
  flatsInserted: number
  flatsUpdated: number
  membersAdded: number
  parseErrors: ReturnType<typeof parseExcel>['errors']
  importErrors: Array<{ row: number; message: string }>
}

export type ImportContext = {
  db: Database
  societyId: number
  superAdminId: number
  assignedByUserId: number
}

/**
 * Parses Excel and imports flats + members into the database.
 *
 * One row in Excel = one flat + (optionally) one primary contact mobile.
 * Additional members can be added per-flat through the UI (Add Member to Flat).
 *
 * Bulk-aware behavior:
 *   - For each row in the Excel:
 *     - The flat is upserted (insert if new, update if exists)
 *     - If Mobile is provided: a user record is upserted, linked to the flat
 *       as primary, and given a society role.
 *     - If Mobile is blank: only the flat row is created/updated. No user,
 *       no flat_members link, no society_roles row. Vacant flats are valid.
 *   - On flat update, blank cells in the Excel preserve existing DB values
 *     (don't erase manually-set ownerName with re-uploaded blanks).
 *
 * Re-uploadable: chairman/secretary can edit the Excel and re-upload. Existing
 * flats are updated; existing members stay linked. Use individual member CRUD
 * endpoints to remove members or add additional (non-primary) ones.
 */
export async function importMembersFromExcel(
  buffer: ArrayBuffer,
  ctx: ImportContext
): Promise<ImportResult> {
  const parsed = parseExcel(buffer)

  if (parsed.errors.length > 0 && parsed.rows.length === 0) {
    return {
      success: false,
      rowsParsed: 0,
      flatsInserted: 0,
      flatsUpdated: 0,
      membersAdded: 0,
      parseErrors: parsed.errors,
      importErrors: [],
    }
  }

  let inserted = 0
  let updated = 0
  let membersAdded = 0
  const importErrors: Array<{ row: number; message: string }> = []

  for (const row of parsed.rows) {
    try {
      const flatId = await upsertFlat(
        ctx,
        row,
        () => {
          inserted++
        },
        () => {
          updated++
        }
      )

      // Vacant flats: no mobile means no member work to do.
      if (!row.mobile) continue

      const userId = await upsertUser(ctx, row, row.mobile)
      if (userId === null) {
        importErrors.push({
          row: row.rowIndex,
          message: `Mobile ${row.mobile} is reserved for a non-society user`,
        })
        continue
      }

      const wasLinked = await linkUserToFlat(ctx, flatId, userId, row)
      if (wasLinked) membersAdded++

      // Determine the role: committee role if specified, otherwise 'member'
      const userRole: SocietyRole = row.committeeRole
        ? row.committeeRole
        : 'member'
      await ensureSocietyRole(ctx, userId, userRole)
    } catch (err) {
      importErrors.push({
        row: row.rowIndex,
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  // Recompute totalFlats
  const allFlats = await ctx.db
    .select()
    .from(flats)
    .where(eq(flats.societyId, ctx.societyId))
  await ctx.db
    .update(societies)
    .set({ totalFlats: allFlats.length, updatedAt: new Date() })
    .where(eq(societies.id, ctx.societyId))

  return {
    success: true,
    rowsParsed: parsed.rows.length,
    flatsInserted: inserted,
    flatsUpdated: updated,
    membersAdded,
    parseErrors: parsed.errors,
    importErrors,
  }
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

/**
 * Insert or update a flat. On update, blank cells in the Excel row
 * do NOT overwrite existing DB values (preserves manually-set names).
 */
async function upsertFlat(
  ctx: ImportContext,
  row: ExcelMemberRow,
  onInsert: () => void,
  onUpdate: () => void
): Promise<number> {
  const residencyType = row.type === 'Tenant' ? 'tenant' : 'owner'

  const [existing] = await ctx.db
    .select()
    .from(flats)
    .where(
      and(
        eq(flats.societyId, ctx.societyId),
        eq(flats.block, row.block),
        eq(flats.flatNo, row.flatNo)
      )
    )
    .limit(1)

  if (existing) {
    // Update only fields that have non-blank values in the Excel row.
    // residencyType always has a value (defaults to 'owner') so always update it.
    const updateValues: {
      residencyType: 'owner' | 'tenant'
      ownerName?: string | null
    } = { residencyType }
    if (row.ownerName) {
      updateValues.ownerName = row.ownerName
    }
    await ctx.db
      .update(flats)
      .set(updateValues)
      .where(eq(flats.id, existing.id))
    onUpdate()
    return existing.id
  }

  // New flat — insert (ownerName null if blank in Excel)
  const [created] = await ctx.db
    .insert(flats)
    .values({
      societyId: ctx.societyId,
      block: row.block,
      flatNo: row.flatNo,
      ownerName: row.ownerName,
      residencyType,
    })
    .returning()
  onInsert()
  return created.id
}

/**
 * Returns the userId, or null if mobile is reserved for non-society users.
 *
 * For existing users, doesn't overwrite an existing name — only fills in
 * a name if the user previously had none.
 */
async function upsertUser(
  ctx: ImportContext,
  row: ExcelMemberRow,
  mobile: string
): Promise<number | null> {
  const [existing] = await ctx.db
    .select()
    .from(users)
    .where(eq(users.mobile, mobile))
    .limit(1)

  if (existing) {
    if (
      existing.userType !== 'society_user' &&
      existing.userType !== 'super_admin'
    ) {
      return null
    }
    // Fill in name if the user has none and Excel provides one
    if (row.ownerName && !existing.name) {
      await ctx.db
        .update(users)
        .set({ name: row.ownerName })
        .where(eq(users.id, existing.id))
    }
    return existing.id
  }

  const [created] = await ctx.db
    .insert(users)
    .values({
      mobile,
      name: row.ownerName,
      userType: 'society_user',
      superAdminId: ctx.superAdminId,
    })
    .returning()
  return created.id
}

/**
 * Link a user to a flat as the primary member.
 * Returns true if a new link was created, false if the link already existed.
 */
async function linkUserToFlat(
  ctx: ImportContext,
  flatId: number,
  userId: number,
  row: ExcelMemberRow
): Promise<boolean> {
  const relation = row.type === 'Tenant' ? 'tenant' : 'owner'

  // Check if already linked
  const [existingLink] = await ctx.db
    .select()
    .from(flatMembers)
    .where(
      and(eq(flatMembers.flatId, flatId), eq(flatMembers.userId, userId))
    )
    .limit(1)

  if (existingLink) return false

  await ctx.db
    .insert(flatMembers)
    .values({ flatId, userId, relation, isPrimary: true })
  return true
}

/**
 * Ensure the user has at least 'member' role in the society. If a committee
 * role is being assigned, upgrade. Never downgrade an existing committee role
 * to 'member' through Excel re-upload.
 */
async function ensureSocietyRole(
  ctx: ImportContext,
  userId: number,
  role: SocietyRole
) {
  const existing = await ctx.db
    .select()
    .from(societyRoles)
    .where(
      and(
        eq(societyRoles.societyId, ctx.societyId),
        eq(societyRoles.userId, userId)
      )
    )
    .limit(1)

  if (existing.length === 0) {
    await ctx.db.insert(societyRoles).values({
      societyId: ctx.societyId,
      userId,
      role,
      assignedBy: ctx.assignedByUserId,
    })
    return
  }

  const currentRole = existing[0].role
  const isCurrentCommittee = currentRole !== 'member'
  const isNewCommittee = role !== 'member'

  if (isNewCommittee && !isCurrentCommittee) {
    await ctx.db
      .update(societyRoles)
      .set({ role, assignedBy: ctx.assignedByUserId })
      .where(eq(societyRoles.id, existing[0].id))
  }
}
