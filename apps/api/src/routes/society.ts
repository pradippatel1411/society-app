import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  societies,
  flats,
  flatMembers,
  users,
  societyRoles,
  superAdmins,
} from '../db/schema'
import { requireAuth, requireUserType } from '../lib/middleware'
import { importMembersFromExcel } from '../lib/memberImport'
import { COMMITTEE_ROLES } from '../db/types'

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

  // Group roles by society
  const societyIds = [
    ...new Set((user.societyRoles ?? []).map((r) => r.societyId)),
  ]

  if (societyIds.length === 0) {
    return c.json({ user: { id: user.userId, mobile: user.mobile }, societies: [] })
  }

  const mySocieties = await db
    .select()
    .from(societies)
    .where(inArray(societies.id, societyIds))

  const result = mySocieties.map((s) => ({
    ...s,
    myRoles: (user.societyRoles ?? [])
      .filter((r) => r.societyId === s.id)
      .map((r) => r.role),
  }))

  return c.json({
    user: { id: user.userId, mobile: user.mobile },
    societies: result,
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

export default society