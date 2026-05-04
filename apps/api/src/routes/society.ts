import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  societies,
  flats,
  flatMembers,
  users,
  societyRoles,
  maintenanceMaster,
  flatPaymentTrack,
  payments,
} from '../db/schema'
import { requireAuth, requireUserType } from '../lib/middleware'
import { importMembersFromExcel } from '../lib/memberImport'
import {
  COMMITTEE_ROLES,
  FREQUENCY_CYCLES,
  type SocietyRole,
  type MaintenanceFrequency,
} from '../db/types'

type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
}

type Variables = {
  user: {
    userId: number
    mobile: string
    userType: 'product_owner' | 'super_admin' | 'society_user'
    societyRoles?: Array<{
      societyId: number
      role: 'chairman' | 'secretary' | 'cashier' | 'committee' | 'member'
    }>
  }
}

const society = new Hono<{ Bindings: Bindings; Variables: Variables }>()

society.use('/*', requireAuth)
society.use('/*', requireUserType('society_user'))

/**
 * Verifies the logged-in user has a committee role
 * (chairman/secretary/cashier/committee) in the requested society.
 * Returns the societyId on success, or null if denied.
 */
function getAuthorizedSocietyId(
  c: { get: (k: 'user') => Variables['user']; req: { param: (k: string) => string } },
  requiredRoles: readonly string[] = COMMITTEE_ROLES
): number | null {
  const user = c.get('user')
  const societyId = parseInt(c.req.param('id'), 10)
  if (isNaN(societyId)) return null

  const role = user.societyRoles?.find(
    (r) => r.societyId === societyId && requiredRoles.includes(r.role)
  )
  return role ? societyId : null
}

// ────────────────────────────────────────────────────────────
// GET /society/me  →  current user's view: which societies + roles
// ────────────────────────────────────────────────────────────
society.get('/me', async (c) => {
  const user = c.get('user')
  const db = getDb(c.env.DATABASE_URL)

  // Fetch the full user record
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1)
  if (!userRow) return c.json({ error: 'User not found' }, 404)

  // Find this user's flats with society info (only what they need)
  const myFlats = await db
    .select({
      flatId: flatMembers.flatId,
      relation: flatMembers.relation,
      isPrimary: flatMembers.isPrimary,
      block: flats.block,
      flatNo: flats.flatNo,
      residencyType: flats.residencyType,
      societyId: flats.societyId,
      societyName: societies.name,
      societySlug: societies.slug,
    })
    .from(flatMembers)
    .innerJoin(flats, eq(flatMembers.flatId, flats.id))
    .innerJoin(societies, eq(flats.societyId, societies.id))
    .where(eq(flatMembers.userId, user.userId))

  // Roles per society (just role names — no society config bloat)
  const roleRows = await db
    .select({
      societyId: societyRoles.societyId,
      role: societyRoles.role,
    })
    .from(societyRoles)
    .where(
      and(
        eq(societyRoles.userId, user.userId),
        eq(societyRoles.isActive, true)
      )
    )

  // Group by society for clean output
  const societyMap = new Map<
    number,
    {
      id: number
      slug: string
      name: string
      role: string
      isCommittee: boolean
      flats: Array<{
        flatId: number
        block: string
        flatNo: string
        label: string
        relation: string
        isPrimary: boolean
        residencyType: string
      }>
    }
  >()

  for (const flat of myFlats) {
    if (!societyMap.has(flat.societyId)) {
      const role = roleRows.find((r) => r.societyId === flat.societyId)
      societyMap.set(flat.societyId, {
        id: flat.societyId,
        slug: flat.societySlug,
        name: flat.societyName,
        role: role?.role ?? 'member',
        isCommittee:
          role !== undefined &&
          ['chairman', 'secretary', 'cashier', 'committee'].includes(role.role),
        flats: [],
      })
    }
    societyMap.get(flat.societyId)!.flats.push({
      flatId: flat.flatId,
      block: flat.block,
      flatNo: flat.flatNo,
      label: `${flat.block}-${flat.flatNo}`,
      relation: flat.relation,
      isPrimary: flat.isPrimary,
      residencyType: flat.residencyType,
    })
  }

  return c.json({
    user: {
      id: userRow.id,
      mobile: userRow.mobile,
      name: userRow.name,
      email: userRow.email,
    },
    societies: Array.from(societyMap.values()),
  })
})

// ────────────────────────────────────────────────────────────
// POST /society/:id/upload-members
// Chairman/Secretary uploads member Excel
// ────────────────────────────────────────────────────────────
society.post('/:id/upload-members', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman', 'secretary'])
  if (!societyId) {
    return c.json({ error: 'Forbidden — chairman/secretary access required' }, 403)
  }

  const buffer = await c.req.arrayBuffer()
  if (!buffer || buffer.byteLength === 0) {
    return c.json({ error: 'Empty file' }, 400)
  }
  if (buffer.byteLength > 5 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 5 MB)' }, 400)
  }

  const db = getDb(c.env.DATABASE_URL)
  const [societyRow] = await db
    .select()
    .from(societies)
    .where(eq(societies.id, societyId))
    .limit(1)
  if (!societyRow) return c.json({ error: 'Society not found' }, 404)

  const result = await importMembersFromExcel(buffer, {
    db,
    societyId,
    superAdminId: societyRow.superAdminId,
    assignedByUserId: c.get('user').userId,
  })

  return c.json(result, result.success ? 200 : 400)
})

// ────────────────────────────────────────────────────────────
// GET /society/:id/members  →  list all members of a society
// ────────────────────────────────────────────────────────────
society.get('/:id/members', async (c) => {
  const societyId = getAuthorizedSocietyId(c)
  if (!societyId) {
    return c.json({ error: 'Forbidden — committee access required' }, 403)
  }

  const db = getDb(c.env.DATABASE_URL)

  const flatList = await db
    .select()
    .from(flats)
    .where(eq(flats.societyId, societyId))

  // Sort by block, then flatNo (natural sort)
  flatList.sort((a, b) => {
    if (a.block !== b.block) return a.block.localeCompare(b.block)
    return a.flatNo.localeCompare(b.flatNo, undefined, { numeric: true })
  })

  // Fetch members for each flat
  const flatIds = flatList.map((f) => f.id)
  if (flatIds.length === 0) {
    return c.json({ flats: [] })
  }

  const memberships = await db
    .select({
      flatId: flatMembers.flatId,
      userId: flatMembers.userId,
      relation: flatMembers.relation,
      isPrimary: flatMembers.isPrimary,
      mobile: users.mobile,
      name: users.name,
    })
    .from(flatMembers)
    .innerJoin(users, eq(flatMembers.userId, users.id))
    .where(inArray(flatMembers.flatId, flatIds))

  const result = flatList.map((f) => ({
    id: f.id,
    block: f.block,
    flatNo: f.flatNo,
    label: `${f.block}-${f.flatNo}`,
    ownerName: f.ownerName,
    residencyType: f.residencyType,
    members: memberships
      .filter((m) => m.flatId === f.id)
      .map((m) => ({
        userId: m.userId,
        mobile: m.mobile,
        name: m.name,
        relation: m.relation,
        isPrimary: m.isPrimary,
      })),
  }))

  return c.json({ flats: result })
})

// ────────────────────────────────────────────────────────────
// GET /society/:id/blocks  →  block-wise count
// ────────────────────────────────────────────────────────────
society.get('/:id/blocks', async (c) => {
  const societyId = getAuthorizedSocietyId(c)
  if (!societyId) {
    return c.json({ error: 'Forbidden — committee access required' }, 403)
  }

  const db = getDb(c.env.DATABASE_URL)
  const flatList = await db
    .select()
    .from(flats)
    .where(eq(flats.societyId, societyId))

  const grouped = new Map<string, number>()
  for (const f of flatList) {
    grouped.set(f.block, (grouped.get(f.block) ?? 0) + 1)
  }

  const blocks = Array.from(grouped.entries())
    .map(([block, count]) => ({ block, flatCount: count }))
    .sort((a, b) => a.block.localeCompare(b.block))

  return c.json({ blocks, totalFlats: flatList.length })
})

// ────────────────────────────────────────────────────────────
// POST /society/:id/flats
// Add a single new flat with optional 1-2 members
// ────────────────────────────────────────────────────────────
const addFlatSchema = z.object({
  block: z.string().min(1).max(20),
  flatNo: z.string().min(1).max(20),
  ownerName: z.string().min(1).max(200),
  residencyType: z.enum(['owner', 'tenant']).default('owner'),
  mobile1: z.string().regex(/^\d{10}$/),
  mobile2: z.string().regex(/^\d{10}$/).optional().nullable(),
  committeeRole: z
    .enum(['chairman', 'secretary', 'cashier', 'committee'])
    .optional()
    .nullable(),
})

society.post('/:id/flats', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman', 'secretary'])
  if (!societyId) {
    return c.json(
      { error: 'Forbidden — chairman/secretary access required' },
      403
    )
  }

  const body = await c.req.json().catch(() => null)
  const parsed = addFlatSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const data = parsed.data
  if (data.mobile2 && data.mobile1 === data.mobile2) {
    return c.json({ error: 'Mobile 1 and Mobile 2 cannot be the same' }, 400)
  }

  const db = getDb(c.env.DATABASE_URL)

  // Get super_admin_id for new user creation
  const [societyRow] = await db
    .select()
    .from(societies)
    .where(eq(societies.id, societyId))
    .limit(1)
  if (!societyRow) return c.json({ error: 'Society not found' }, 404)

  const block = data.block.toUpperCase()

  // Check flat doesn't already exist
  const [existing] = await db
    .select()
    .from(flats)
    .where(
      and(
        eq(flats.societyId, societyId),
        eq(flats.block, block),
        eq(flats.flatNo, data.flatNo)
      )
    )
    .limit(1)
  if (existing) {
    return c.json(
      { error: `Flat ${block}-${data.flatNo} already exists in this society` },
      409
    )
  }

  // Check committee role uniqueness for singletons
  if (
    data.committeeRole &&
    ['chairman', 'secretary', 'cashier'].includes(data.committeeRole)
  ) {
    const occupied = await db
      .select()
      .from(societyRoles)
      .where(
        and(
          eq(societyRoles.societyId, societyId),
          eq(societyRoles.role, data.committeeRole),
          eq(societyRoles.isActive, true)
        )
      )
      .limit(1)
    if (occupied.length > 0) {
      return c.json(
        {
          error: `A ${data.committeeRole} already exists in this society. Demote them first.`,
        },
        409
      )
    }
  }

  // Create the flat
  const [newFlat] = await db
    .insert(flats)
    .values({
      societyId,
      block,
      flatNo: data.flatNo,
      ownerName: data.ownerName,
      residencyType: data.residencyType,
    })
    .returning()

  // Helper to upsert a user + link to flat + assign role
  const assignedById = c.get('user').userId
  const upsertUserAndLink = async (
    mobile: string,
    isPrimary: boolean,
    name: string | null
  ) => {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.mobile, mobile))
      .limit(1)

    let userId: number
    if (existingUser) {
      if (
        existingUser.userType !== 'society_user' &&
        existingUser.userType !== 'super_admin'
      ) {
        return null // skip with error
      }
      userId = existingUser.id
    } else {
      const [created] = await db
        .insert(users)
        .values({
          mobile,
          name,
          userType: 'society_user',
          superAdminId: societyRow.superAdminId,
        })
        .returning()
      userId = created.id
    }

    const relation = data.residencyType === 'tenant' ? 'tenant' : 'owner'

    await db
      .insert(flatMembers)
      .values({ flatId: newFlat.id, userId, relation, isPrimary })
      .onConflictDoNothing()

    // Assign role: committee if primary + role specified, else member
    const role: SocietyRole =
      isPrimary && data.committeeRole ? data.committeeRole : 'member'

    const [existingRole] = await db
      .select()
      .from(societyRoles)
      .where(
        and(
          eq(societyRoles.societyId, societyId),
          eq(societyRoles.userId, userId)
        )
      )
      .limit(1)

    if (!existingRole) {
      await db.insert(societyRoles).values({
        societyId,
        userId,
        role,
        assignedBy: assignedById,
      })
    } else if (role !== 'member' && existingRole.role === 'member') {
      await db
        .update(societyRoles)
        .set({ role, assignedBy: assignedById })
        .where(eq(societyRoles.id, existingRole.id))
    }
    return userId
  }

  await upsertUserAndLink(data.mobile1, true, data.ownerName)
  if (data.mobile2) {
    await upsertUserAndLink(data.mobile2, false, null)
  }

  // Update society's totalFlats
  const allFlats = await db
    .select()
    .from(flats)
    .where(eq(flats.societyId, societyId))
  await db
    .update(societies)
    .set({ totalFlats: allFlats.length, updatedAt: new Date() })
    .where(eq(societies.id, societyId))

  return c.json({ success: true, flat: newFlat })
})

// ────────────────────────────────────────────────────────────
// PATCH /society/:id/flats/:flatId
// Edit flat details (owner name, residency type)
// ────────────────────────────────────────────────────────────
const editFlatSchema = z.object({
  ownerName: z.string().min(1).max(200).optional(),
  residencyType: z.enum(['owner', 'tenant']).optional(),
})

society.patch('/:id/flats/:flatId', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman', 'secretary'])
  if (!societyId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const flatId = parseInt(c.req.param('flatId'), 10)
  if (isNaN(flatId)) return c.json({ error: 'Invalid flat id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = editFlatSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const db = getDb(c.env.DATABASE_URL)

  // Verify flat belongs to this society
  const [flat] = await db
    .select()
    .from(flats)
    .where(and(eq(flats.id, flatId), eq(flats.societyId, societyId)))
    .limit(1)
  if (!flat) return c.json({ error: 'Flat not found' }, 404)

  const updates: Record<string, unknown> = {}
  if (parsed.data.ownerName !== undefined) updates.ownerName = parsed.data.ownerName
  if (parsed.data.residencyType !== undefined)
    updates.residencyType = parsed.data.residencyType

  const [updated] = await db
    .update(flats)
    .set(updates)
    .where(eq(flats.id, flatId))
    .returning()

  return c.json({ success: true, flat: updated })
})

// ────────────────────────────────────────────────────────────
// POST /society/:id/flats/:flatId/members
// Add an additional mobile (e.g., second mobile) to an existing flat
// ────────────────────────────────────────────────────────────
const addMemberSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/),
  name: z.string().min(1).max(200).optional(),
  relation: z.enum(['owner', 'tenant', 'family']).default('family'),
})

society.post('/:id/flats/:flatId/members', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman', 'secretary'])
  if (!societyId) return c.json({ error: 'Forbidden' }, 403)

  const flatId = parseInt(c.req.param('flatId'), 10)
  if (isNaN(flatId)) return c.json({ error: 'Invalid flat id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = addMemberSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const db = getDb(c.env.DATABASE_URL)

  // Verify flat
  const [flat] = await db
    .select()
    .from(flats)
    .where(and(eq(flats.id, flatId), eq(flats.societyId, societyId)))
    .limit(1)
  if (!flat) return c.json({ error: 'Flat not found' }, 404)

  // Get society for super_admin_id
  const [societyRow] = await db
    .select()
    .from(societies)
    .where(eq(societies.id, societyId))
    .limit(1)
  if (!societyRow) return c.json({ error: 'Society not found' }, 404)

  // Limit to 2 members per flat
  const existingMembers = await db
    .select()
    .from(flatMembers)
    .where(eq(flatMembers.flatId, flatId))
  if (existingMembers.length >= 2) {
    return c.json(
      { error: 'This flat already has 2 members (the maximum allowed)' },
      409
    )
  }

  // Find or create user
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.mobile, parsed.data.mobile))
    .limit(1)

  let userId: number
  if (existingUser) {
    if (
      existingUser.userType !== 'society_user' &&
      existingUser.userType !== 'super_admin'
    ) {
      return c.json(
        {
          error: `Mobile ${parsed.data.mobile} is reserved for ${existingUser.userType}`,
        },
        409
      )
    }
    userId = existingUser.id
  } else {
    const [created] = await db
      .insert(users)
      .values({
        mobile: parsed.data.mobile,
        name: parsed.data.name ?? null,
        userType: 'society_user',
        superAdminId: societyRow.superAdminId,
      })
      .returning()
    userId = created.id
  }

  // Link to flat
  const [existingLink] = await db
    .select()
    .from(flatMembers)
    .where(
      and(eq(flatMembers.flatId, flatId), eq(flatMembers.userId, userId))
    )
    .limit(1)
  if (existingLink) {
    return c.json({ error: 'This member is already linked to this flat' }, 409)
  }

  await db.insert(flatMembers).values({
    flatId,
    userId,
    relation: parsed.data.relation,
    isPrimary: false,
  })

  // Ensure 'member' role
  await db
    .insert(societyRoles)
    .values({
      societyId,
      userId,
      role: 'member',
      assignedBy: c.get('user').userId,
    })
    .onConflictDoNothing()

  return c.json({ success: true, userId })
})

// ────────────────────────────────────────────────────────────
// DELETE /society/:id/flats/:flatId/members/:userId
// Remove a member from a flat (does NOT delete the user globally)
// ────────────────────────────────────────────────────────────
society.delete('/:id/flats/:flatId/members/:userId', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman', 'secretary'])
  if (!societyId) return c.json({ error: 'Forbidden' }, 403)

  const flatId = parseInt(c.req.param('flatId'), 10)
  const userId = parseInt(c.req.param('userId'), 10)
  if (isNaN(flatId) || isNaN(userId)) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const db = getDb(c.env.DATABASE_URL)

  // Verify flat
  const [flat] = await db
    .select()
    .from(flats)
    .where(and(eq(flats.id, flatId), eq(flats.societyId, societyId)))
    .limit(1)
  if (!flat) return c.json({ error: 'Flat not found' }, 404)

  // Remove the flat_members link
  await db
    .delete(flatMembers)
    .where(
      and(
        eq(flatMembers.flatId, flatId),
        eq(flatMembers.userId, userId)
      )
    )

  // Check if the user has any other flats in this society
  const otherFlats = await db
    .select()
    .from(flatMembers)
    .innerJoin(flats, eq(flatMembers.flatId, flats.id))
    .where(
      and(eq(flatMembers.userId, userId), eq(flats.societyId, societyId))
    )

  // If no other flats, also remove their society_role
  if (otherFlats.length === 0) {
    await db
      .delete(societyRoles)
      .where(
        and(
          eq(societyRoles.societyId, societyId),
          eq(societyRoles.userId, userId)
        )
      )
  }

  return c.json({ success: true })
})

// ────────────────────────────────────────────────────────────
// PATCH /society/:id/members/:userId/role
// Change a user's committee role (promote/demote)
// Only chairman can do this
// ────────────────────────────────────────────────────────────
const changeRoleSchema = z.object({
  role: z.enum(['chairman', 'secretary', 'cashier', 'committee', 'member']),
})

society.patch('/:id/members/:userId/role', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman'])
  if (!societyId) {
    return c.json({ error: 'Forbidden — chairman access required' }, 403)
  }

  const userId = parseInt(c.req.param('userId'), 10)
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = changeRoleSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const db = getDb(c.env.DATABASE_URL)

  // Find the existing role row
  const [existing] = await db
    .select()
    .from(societyRoles)
    .where(
      and(
        eq(societyRoles.societyId, societyId),
        eq(societyRoles.userId, userId)
      )
    )
    .limit(1)
  if (!existing) {
    return c.json({ error: 'Member not found in this society' }, 404)
  }

  const newRole = parsed.data.role

  // Singleton roles: ensure no one else holds them
  if (['chairman', 'secretary', 'cashier'].includes(newRole)) {
    const [conflict] = await db
      .select()
      .from(societyRoles)
      .where(
        and(
          eq(societyRoles.societyId, societyId),
          eq(societyRoles.role, newRole),
          eq(societyRoles.isActive, true)
        )
      )
      .limit(1)
    if (conflict && conflict.userId !== userId) {
      return c.json(
        {
          error: `Another user is already ${newRole}. Demote them first.`,
        },
        409
      )
    }
  }

  // Special check: chairman cannot demote themselves (avoid lockout)
  if (
    existing.role === 'chairman' &&
    newRole !== 'chairman' &&
    userId === c.get('user').userId
  ) {
    return c.json(
      {
        error:
          'Chairman cannot demote themselves. Promote another chairman first.',
      },
      400
    )
  }

  const [updated] = await db
    .update(societyRoles)
    .set({ role: newRole, assignedBy: c.get('user').userId })
    .where(eq(societyRoles.id, existing.id))
    .returning()

  return c.json({ success: true, role: updated })
})

// ────────────────────────────────────────────────────────────
// DELETE /society/:id/flats/:flatId
// Remove an entire flat from the society
// (Cascades: removes flat_members, dues, and orphaned society_roles)
// ────────────────────────────────────────────────────────────
society.delete('/:id/flats/:flatId', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman'])
  if (!societyId) {
    return c.json({ error: 'Forbidden — chairman access required' }, 403)
  }

  const flatId = parseInt(c.req.param('flatId'), 10)
  if (isNaN(flatId)) return c.json({ error: 'Invalid flat id' }, 400)

  const db = getDb(c.env.DATABASE_URL)

  // Verify flat belongs to this society
  const [flat] = await db
    .select()
    .from(flats)
    .where(and(eq(flats.id, flatId), eq(flats.societyId, societyId)))
    .limit(1)
  if (!flat) return c.json({ error: 'Flat not found' }, 404)

  // Get the user IDs linked to this flat (so we can clean up roles after)
  const linkedMembers = await db
    .select()
    .from(flatMembers)
    .where(eq(flatMembers.flatId, flatId))
  const userIds = linkedMembers.map((m) => m.userId)

  // Delete the flat (cascades to flat_members, dues)
  await db.delete(flats).where(eq(flats.id, flatId))

  // For each user, check if they have any other flats in this society
  // If not, remove their society_role
  for (const userId of userIds) {
    const otherFlats = await db
      .select()
      .from(flatMembers)
      .innerJoin(flats, eq(flatMembers.flatId, flats.id))
      .where(
        and(eq(flatMembers.userId, userId), eq(flats.societyId, societyId))
      )

    if (otherFlats.length === 0) {
      await db
        .delete(societyRoles)
        .where(
          and(
            eq(societyRoles.societyId, societyId),
            eq(societyRoles.userId, userId)
          )
        )
    }
  }

  // Update society's totalFlats
  const remaining = await db
    .select()
    .from(flats)
    .where(eq(flats.societyId, societyId))
  await db
    .update(societies)
    .set({ totalFlats: remaining.length, updatedAt: new Date() })
    .where(eq(societies.id, societyId))

  return c.json({ success: true })
})

// ════════════════════════════════════════════════════════════
// MAINTENANCE MASTER (per Financial Year)
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// GET /society/:id/maintenance-master
// List all FY masters for this society (active + closed)
// ────────────────────────────────────────────────────────────
society.get('/:id/maintenance-master', async (c) => {
  const societyId = getAuthorizedSocietyId(c)
  if (!societyId) return c.json({ error: 'Forbidden' }, 403)

  const db = getDb(c.env.DATABASE_URL)
  const rows = await db
    .select()
    .from(maintenanceMaster)
    .where(eq(maintenanceMaster.societyId, societyId))
    .orderBy(desc(maintenanceMaster.fyStartDate))

  return c.json({ masters: rows })
})

// ────────────────────────────────────────────────────────────
// GET /society/:id/maintenance-master/:masterId
// Single FY master with summary (paid/unpaid counts, totals)
// ────────────────────────────────────────────────────────────
society.get('/:id/maintenance-master/:masterId', async (c) => {
  const societyId = getAuthorizedSocietyId(c)
  if (!societyId) return c.json({ error: 'Forbidden' }, 403)

  const masterId = parseInt(c.req.param('masterId'), 10)
  if (isNaN(masterId)) return c.json({ error: 'Invalid master id' }, 400)

  const db = getDb(c.env.DATABASE_URL)
  const [master] = await db
    .select()
    .from(maintenanceMaster)
    .where(
      and(
        eq(maintenanceMaster.id, masterId),
        eq(maintenanceMaster.societyId, societyId)
      )
    )
    .limit(1)
  if (!master) return c.json({ error: 'Master not found' }, 404)

  // Summary across all flat tracks
  const tracks = await db
    .select()
    .from(flatPaymentTrack)
    .where(eq(flatPaymentTrack.maintenanceMasterId, masterId))

  const summary = {
    totalFlats: tracks.length,
    paid: tracks.filter((t) => t.status === 'paid').length,
    unpaid: tracks.filter((t) => t.status === 'unpaid').length,
    notStarted: tracks.filter((t) => t.frequency === null).length,
    totalCollected: tracks.reduce((sum, t) => sum + t.paidAmount, 0),
  }

  return c.json({ master, summary })
})

// ────────────────────────────────────────────────────────────
// POST /society/:id/maintenance-master
// Chairman creates a new FY master and the system eagerly creates
// one flat_payment_track row per flat (with frequency = null until
// the flat's first payment).
// ────────────────────────────────────────────────────────────
const createMasterSchema = z
  .object({
    fyLabel: z.string().min(2).max(50),
    fyStartDate: z.string(), // YYYY-MM-DD
    fyEndDate: z.string(),

    // Owner amounts — provide for each enabled frequency only
    ownerMonthly: z.number().int().min(1).optional().nullable(),
    ownerQuarterly: z.number().int().min(1).optional().nullable(),
    ownerHalfYearly: z.number().int().min(1).optional().nullable(),
    ownerYearly: z.number().int().min(1).optional().nullable(),

    // Tenant amounts — provide for each enabled frequency only
    tenantMonthly: z.number().int().min(1).optional().nullable(),
    tenantQuarterly: z.number().int().min(1).optional().nullable(),
    tenantHalfYearly: z.number().int().min(1).optional().nullable(),
    tenantYearly: z.number().int().min(1).optional().nullable(),

    // Penalty (informational — chairman handles offline)
    penaltyPerDayOwner: z.number().int().min(0).optional(),
    penaltyPerDayTenant: z.number().int().min(0).optional(),
  })
  .refine(
    (d) => {
      // At least one frequency must be enabled (both owner and tenant amounts present)
      const hasMonthly = d.ownerMonthly != null && d.tenantMonthly != null
      const hasQuarterly = d.ownerQuarterly != null && d.tenantQuarterly != null
      const hasHalf = d.ownerHalfYearly != null && d.tenantHalfYearly != null
      const hasYearly = d.ownerYearly != null && d.tenantYearly != null
      return hasMonthly || hasQuarterly || hasHalf || hasYearly
    },
    {
      message:
        'Enable at least one frequency by providing both owner and tenant amounts for it',
    }
  )
  .refine(
    (d) => {
      // For each frequency, if one of (owner, tenant) is given the other must be too
      const checks: [
        keyof typeof d & string,
        keyof typeof d & string,
        string
      ][] = [
        ['ownerMonthly', 'tenantMonthly', 'monthly'],
        ['ownerQuarterly', 'tenantQuarterly', 'quarterly'],
        ['ownerHalfYearly', 'tenantHalfYearly', 'half_yearly'],
        ['ownerYearly', 'tenantYearly', 'yearly'],
      ]
      for (const [oKey, tKey] of checks) {
        const oVal = d[oKey]
        const tVal = d[tKey]
        if ((oVal == null) !== (tVal == null)) return false
      }
      return true
    },
    {
      message:
        'For each enabled frequency, both owner and tenant amounts must be provided',
    }
  )

society.post('/:id/maintenance-master', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman', 'secretary'])
  if (!societyId) {
    return c.json(
      { error: 'Forbidden — chairman/secretary access required' },
      403
    )
  }

  const body = await c.req.json().catch(() => null)
  const parsed = createMasterSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const data = parsed.data
  const fyStartDate = new Date(data.fyStartDate)
  const fyEndDate = new Date(data.fyEndDate)
  if (fyEndDate <= fyStartDate) {
    return c.json({ error: 'FY end date must be after FY start date' }, 400)
  }

  const db = getDb(c.env.DATABASE_URL)

  // Check for duplicate fy_label in this society
  const [existing] = await db
    .select()
    .from(maintenanceMaster)
    .where(
      and(
        eq(maintenanceMaster.societyId, societyId),
        eq(maintenanceMaster.fyLabel, data.fyLabel)
      )
    )
    .limit(1)
  if (existing) {
    return c.json(
      { error: `An FY master with label "${data.fyLabel}" already exists` },
      409
    )
  }

  // Get all flats — needed to eagerly create tracks
  const allFlats = await db
    .select()
    .from(flats)
    .where(eq(flats.societyId, societyId))
  if (allFlats.length === 0) {
    return c.json({ error: 'No flats in this society yet' }, 400)
  }

  // Create the master row
  const [master] = await db
    .insert(maintenanceMaster)
    .values({
      societyId,
      fyLabel: data.fyLabel,
      fyStartDate,
      fyEndDate,
      ownerMonthly: data.ownerMonthly ?? null,
      ownerQuarterly: data.ownerQuarterly ?? null,
      ownerHalfYearly: data.ownerHalfYearly ?? null,
      ownerYearly: data.ownerYearly ?? null,
      tenantMonthly: data.tenantMonthly ?? null,
      tenantQuarterly: data.tenantQuarterly ?? null,
      tenantHalfYearly: data.tenantHalfYearly ?? null,
      tenantYearly: data.tenantYearly ?? null,
      penaltyPerDayOwner: data.penaltyPerDayOwner ?? 0,
      penaltyPerDayTenant: data.penaltyPerDayTenant ?? 0,
      status: 'active',
    })
    .returning()

  // Eagerly create flat_payment_track for every flat (frequency = null
  // until that flat's first payment)
  const trackRows = allFlats.map((f) => ({
    maintenanceMasterId: master.id,
    flatId: f.id,
    frequency: null as MaintenanceFrequency | null,
    totalAmount: null,
    paidAmount: 0,
    status: 'unpaid' as const,
  }))
  await db.insert(flatPaymentTrack).values(trackRows)

  return c.json({
    success: true,
    master,
    tracksCreated: trackRows.length,
  })
})

// ────────────────────────────────────────────────────────────
// PATCH /society/:id/maintenance-master/:masterId/close
// Chairman closes an FY master (no more payments accepted)
// ────────────────────────────────────────────────────────────
society.patch('/:id/maintenance-master/:masterId/close', async (c) => {
  const societyId = getAuthorizedSocietyId(c, ['chairman'])
  if (!societyId) {
    return c.json({ error: 'Forbidden — chairman access required' }, 403)
  }

  const masterId = parseInt(c.req.param('masterId'), 10)
  if (isNaN(masterId)) return c.json({ error: 'Invalid master id' }, 400)

  const db = getDb(c.env.DATABASE_URL)
  const [master] = await db
    .select()
    .from(maintenanceMaster)
    .where(
      and(
        eq(maintenanceMaster.id, masterId),
        eq(maintenanceMaster.societyId, societyId)
      )
    )
    .limit(1)
  if (!master) return c.json({ error: 'Master not found' }, 404)

  const [updated] = await db
    .update(maintenanceMaster)
    .set({ status: 'closed' })
    .where(eq(maintenanceMaster.id, masterId))
    .returning()

  return c.json({ success: true, master: updated })
})

// ────────────────────────────────────────────────────────────
// GET /society/:id/maintenance-master/:masterId/tracks
// List all flat tracks for a master with status (chairman dashboard)
// ────────────────────────────────────────────────────────────
society.get('/:id/maintenance-master/:masterId/tracks', async (c) => {
  const societyId = getAuthorizedSocietyId(c)
  if (!societyId) return c.json({ error: 'Forbidden' }, 403)

  const masterId = parseInt(c.req.param('masterId'), 10)
  if (isNaN(masterId)) return c.json({ error: 'Invalid master id' }, 400)

  const db = getDb(c.env.DATABASE_URL)

  const [master] = await db
    .select()
    .from(maintenanceMaster)
    .where(
      and(
        eq(maintenanceMaster.id, masterId),
        eq(maintenanceMaster.societyId, societyId)
      )
    )
    .limit(1)
  if (!master) return c.json({ error: 'Master not found' }, 404)

  const rows = await db
    .select({
      trackId: flatPaymentTrack.id,
      flatId: flats.id,
      block: flats.block,
      flatNo: flats.flatNo,
      ownerName: flats.ownerName,
      residencyType: flats.residencyType,
      frequency: flatPaymentTrack.frequency,
      totalAmount: flatPaymentTrack.totalAmount,
      paidAmount: flatPaymentTrack.paidAmount,
      status: flatPaymentTrack.status,
      updatedAt: flatPaymentTrack.updatedAt,
    })
    .from(flatPaymentTrack)
    .innerJoin(flats, eq(flatPaymentTrack.flatId, flats.id))
    .where(eq(flatPaymentTrack.maintenanceMasterId, masterId))

  // Sort: unpaid first, then by block + flat number
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'unpaid' ? -1 : 1
    if (a.block !== b.block) return a.block.localeCompare(b.block)
    return a.flatNo.localeCompare(b.flatNo, undefined, { numeric: true })
  })

  return c.json({ tracks: rows })
})

// ════════════════════════════════════════════════════════════
// PAYMENT RECORDING (manual mode — chairman/secretary/cashier)
// Razorpay self-pay flow will be added in a future step.
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// POST /society/:id/maintenance-master/:masterId/payments
// Committee records a manual payment (cash/cheque/upi-screenshot).
// Locks frequency for the flat on first payment for this FY.
// ────────────────────────────────────────────────────────────
const recordPaymentSchema = z.object({
  flatId: z.number().int().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly']),
  amount: z.number().int().min(1),
  mode: z.enum(['upi', 'cash', 'cheque', 'manual']),
  gatewayTxnId: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

society.post('/:id/maintenance-master/:masterId/payments', async (c) => {
  const societyId = getAuthorizedSocietyId(c, [
    'chairman',
    'secretary',
    'cashier',
  ])
  if (!societyId) {
    return c.json(
      { error: 'Forbidden — committee access required' },
      403
    )
  }

  const masterId = parseInt(c.req.param('masterId'), 10)
  if (isNaN(masterId)) return c.json({ error: 'Invalid master id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = recordPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }
  const data = parsed.data
  const db = getDb(c.env.DATABASE_URL)

  // Verify master exists and is active
  const [master] = await db
    .select()
    .from(maintenanceMaster)
    .where(
      and(
        eq(maintenanceMaster.id, masterId),
        eq(maintenanceMaster.societyId, societyId)
      )
    )
    .limit(1)
  if (!master) return c.json({ error: 'Master not found' }, 404)
  if (master.status !== 'active') {
    return c.json({ error: 'This FY is closed; cannot record payments' }, 400)
  }

  // Verify flat is in this society
  const [flat] = await db
    .select()
    .from(flats)
    .where(and(eq(flats.id, data.flatId), eq(flats.societyId, societyId)))
    .limit(1)
  if (!flat) return c.json({ error: 'Flat not found in this society' }, 404)

  // Determine the frequency amount from master based on residency
  const freqAmount = pickFrequencyAmount(master, flat.residencyType, data.frequency)
  if (freqAmount == null) {
    return c.json(
      {
        error: `Frequency "${data.frequency}" is not enabled for ${flat.residencyType}s in this FY`,
      },
      400
    )
  }

  // Amount must be a positive multiple of freqAmount
  if (data.amount <= 0 || data.amount % freqAmount !== 0) {
    return c.json(
      {
        error: `Amount must be a multiple of ₹${freqAmount} (the ${data.frequency} amount). For ${data.frequency}: pay ₹${freqAmount} or ₹${freqAmount * 2} or ₹${freqAmount * 3}, etc.`,
      },
      400
    )
  }

  // Get or create the flat_payment_track
  const [existingTrack] = await db
    .select()
    .from(flatPaymentTrack)
    .where(
      and(
        eq(flatPaymentTrack.maintenanceMasterId, masterId),
        eq(flatPaymentTrack.flatId, data.flatId)
      )
    )
    .limit(1)

  let trackId: number
  let lockedFrequency: MaintenanceFrequency
  let totalAmount: number
  let currentPaid: number

  if (!existingTrack) {
    // Should not happen normally (we eagerly create) but handle defensively
    const cycles = FREQUENCY_CYCLES[data.frequency]
    totalAmount = freqAmount * cycles
    const [created] = await db
      .insert(flatPaymentTrack)
      .values({
        maintenanceMasterId: masterId,
        flatId: data.flatId,
        frequency: data.frequency,
        totalAmount,
        paidAmount: 0,
        status: 'unpaid',
      })
      .returning()
    trackId = created.id
    lockedFrequency = data.frequency
    currentPaid = 0
  } else {
    if (existingTrack.frequency === null) {
      // First payment for this flat — lock frequency
      const cycles = FREQUENCY_CYCLES[data.frequency]
      totalAmount = freqAmount * cycles
      lockedFrequency = data.frequency
      await db
        .update(flatPaymentTrack)
        .set({
          frequency: data.frequency,
          totalAmount,
          updatedAt: new Date(),
        })
        .where(eq(flatPaymentTrack.id, existingTrack.id))
      trackId = existingTrack.id
      currentPaid = existingTrack.paidAmount
    } else {
      if (existingTrack.frequency !== data.frequency) {
        return c.json(
          {
            error: `This flat's frequency is locked to "${existingTrack.frequency}" for this FY. Cannot change to "${data.frequency}".`,
          },
          400
        )
      }
      lockedFrequency = existingTrack.frequency
      totalAmount = existingTrack.totalAmount ?? freqAmount * FREQUENCY_CYCLES[lockedFrequency]
      trackId = existingTrack.id
      currentPaid = existingTrack.paidAmount
    }

    if (existingTrack.status === 'paid') {
      return c.json(
        { error: 'This flat is already fully paid for this FY' },
        400
      )
    }
  }

  // Cannot exceed outstanding
  const outstanding = totalAmount - currentPaid
  if (data.amount > outstanding) {
    return c.json(
      {
        error: `Cannot pay ₹${data.amount}. Only ₹${outstanding} is outstanding for this FY.`,
      },
      400
    )
  }

  // Insert payment row
  const [payment] = await db
    .insert(payments)
    .values({
      maintenanceMasterId: masterId,
      flatId: data.flatId,
      paidByUserId: c.get('user').userId,
      frequency: lockedFrequency,
      amount: data.amount,
      mode: data.mode,
      gateway: null,
      gatewayTxnId: data.gatewayTxnId ?? null,
      status: 'success',
      notes: data.notes ?? null,
    })
    .returning()

  // Update track
  const newPaid = currentPaid + data.amount
  const newStatus = newPaid >= totalAmount ? 'paid' : 'unpaid'
  await db
    .update(flatPaymentTrack)
    .set({
      paidAmount: newPaid,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(flatPaymentTrack.id, trackId))

  return c.json({
    success: true,
    payment,
    track: {
      id: trackId,
      frequency: lockedFrequency,
      totalAmount,
      paidAmount: newPaid,
      status: newStatus,
      outstanding: totalAmount - newPaid,
    },
  })
})

// Helper used by record-payment route
function pickFrequencyAmount(
  master: typeof maintenanceMaster.$inferSelect,
  residency: 'owner' | 'tenant',
  freq: MaintenanceFrequency
): number | null {
  if (residency === 'owner') {
    if (freq === 'monthly') return master.ownerMonthly
    if (freq === 'quarterly') return master.ownerQuarterly
    if (freq === 'half_yearly') return master.ownerHalfYearly
    if (freq === 'yearly') return master.ownerYearly
  } else {
    if (freq === 'monthly') return master.tenantMonthly
    if (freq === 'quarterly') return master.tenantQuarterly
    if (freq === 'half_yearly') return master.tenantHalfYearly
    if (freq === 'yearly') return master.tenantYearly
  }
  return null
}

export default society
