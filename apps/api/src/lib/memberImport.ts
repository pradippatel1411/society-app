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
import type { CommitteeRole } from '../db/types'

export type ImportResult = {
  success: boolean
  rowsParsed: number
  flatsInserted: number
  flatsUpdated: number
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
 * Parses Excel and imports members into the database.
 * Idempotent: re-running with the same Excel updates existing flats
 * instead of creating duplicates.
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
      parseErrors: parsed.errors,
      importErrors: [],
    }
  }

  let inserted = 0
  let updated = 0
  const importErrors: Array<{ row: number; message: string }> = []

  for (const row of parsed.rows) {
    try {
      const flatId = await upsertFlat(ctx, row, () => {
        inserted++
      }, () => {
        updated++
      })

      const mobiles = [row.mobile1, ...(row.mobile2 ? [row.mobile2] : [])]
      for (let mIdx = 0; mIdx < mobiles.length; mIdx++) {
        const mobile = mobiles[mIdx]
        const userId = await upsertUser(ctx, row, mobile, mIdx === 0)
        if (userId === null) {
          importErrors.push({
            row: row.rowIndex,
            message: `Mobile ${mobile} is reserved for a non-society user`,
          })
          continue
        }

        await linkUserToFlat(ctx, flatId, userId, row, mIdx === 0)
        await ensureMemberRole(ctx, userId)

        // Committee role only for primary mobile
        if (mIdx === 0 && row.committeeRole) {
          await ensureCommitteeRole(ctx, userId, row.committeeRole)
        }
      }
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
    parseErrors: parsed.errors,
    importErrors,
  }
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

async function upsertFlat(
  ctx: ImportContext,
  row: ExcelMemberRow,
  onInsert: () => void,
  onUpdate: () => void
): Promise<number> {
  const residencyType =
    row.type === 'Owner' ? 'owner' : row.type === 'Tenant' ? 'tenant' : 'hybrid'

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
    await ctx.db
      .update(flats)
      .set({ ownerName: row.ownerName, residencyType })
      .where(eq(flats.id, existing.id))
    onUpdate()
    return existing.id
  }

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
 */
async function upsertUser(
  ctx: ImportContext,
  row: ExcelMemberRow,
  mobile: string,
  isPrimary: boolean
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
    return existing.id
  }

  const [created] = await ctx.db
    .insert(users)
    .values({
      mobile,
      name: isPrimary ? row.ownerName : null,
      userType: 'society_user',
      superAdminId: ctx.superAdminId,
    })
    .returning()
  return created.id
}

async function linkUserToFlat(
  ctx: ImportContext,
  flatId: number,
  userId: number,
  row: ExcelMemberRow,
  isPrimary: boolean
) {
  const relation =
    row.type === 'Owner' ? 'owner' : row.type === 'Tenant' ? 'tenant' : 'owner'

  await ctx.db
    .insert(flatMembers)
    .values({ flatId, userId, relation, isPrimary })
    .onConflictDoNothing()
}

async function ensureMemberRole(ctx: ImportContext, userId: number) {
  await ctx.db
    .insert(societyRoles)
    .values({
      societyId: ctx.societyId,
      userId,
      role: 'member',
      assignedBy: ctx.assignedByUserId,
    })
    .onConflictDoNothing()
}

async function ensureCommitteeRole(
  ctx: ImportContext,
  userId: number,
  role: CommitteeRole
) {
  await ctx.db
    .insert(societyRoles)
    .values({
      societyId: ctx.societyId,
      userId,
      role,
      assignedBy: ctx.assignedByUserId,
    })
    .onConflictDoNothing()
}