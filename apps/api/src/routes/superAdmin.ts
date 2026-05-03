import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  superAdmins,
  societies,
  users,
  societyRoles,
} from '../db/schema'
import { importMembersFromExcel } from '../lib/memberImport'
import { requireAuth, requireUserType } from '../lib/middleware'
import { validateSlug, generateSlug } from '../lib/slug'

type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
}

type Variables = {
  user: {
    userId: number
    mobile: string
    userType: 'product_owner' | 'super_admin' | 'society_user'
    superAdminId?: number | null
  }
}

const superAdmin = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// All routes below require super_admin JWT
superAdmin.use('/*', requireAuth)
superAdmin.use('/*', requireUserType('super_admin'))

// Helper: get the current super admin's id from JWT
function getSuperAdminId(c: { get: (key: 'user') => Variables['user'] }): number | null {
  const user = c.get('user')
  return user.superAdminId ?? null
}

// ────────────────────────────────────────────────────────────
// GET /super-admin/me  →  current super admin's profile
// ────────────────────────────────────────────────────────────
superAdmin.get('/me', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const db = getDb(c.env.DATABASE_URL)
  const [admin] = await db
    .select()
    .from(superAdmins)
    .where(eq(superAdmins.id, adminId))
    .limit(1)

  if (!admin) return c.json({ error: 'Not found' }, 404)
  return c.json({ superAdmin: admin })
})

// ────────────────────────────────────────────────────────────
// PATCH /super-admin/me  →  update own branding
// ────────────────────────────────────────────────────────────
const updateBrandingSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  brandColor: z.string().optional(),
  logoUrl: z.string().url().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
})

superAdmin.patch('/me', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = updateBrandingSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const db = getDb(c.env.DATABASE_URL)
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.brandColor !== undefined)
    updates.brandColor = parsed.data.brandColor
  if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl
  if (parsed.data.contactEmail !== undefined)
    updates.contactEmail = parsed.data.contactEmail

  const [updated] = await db
    .update(superAdmins)
    .set(updates)
    .where(eq(superAdmins.id, adminId))
    .returning()

  return c.json({ success: true, superAdmin: updated })
})

// ────────────────────────────────────────────────────────────
// GET /super-admin/societies  →  list societies under this super admin
// ────────────────────────────────────────────────────────────
superAdmin.get('/societies', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const db = getDb(c.env.DATABASE_URL)
  const rows = await db
    .select()
    .from(societies)
    .where(eq(societies.superAdminId, adminId))
    .orderBy(desc(societies.createdAt))

  return c.json({ societies: rows })
})

// ────────────────────────────────────────────────────────────
// POST /super-admin/societies  →  create a new society
// ────────────────────────────────────────────────────────────
const createSocietySchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().optional(),
  address: z.string().optional(),
  totalFlats: z.number().int().min(0).optional(),
  planAmount: z.number().int().min(0).optional(),
  planStartDate: z.string().optional(),
  planEndDate: z.string().optional(),
})

superAdmin.post('/societies', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = createSocietySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const data = parsed.data
  const slug = data.slug ? data.slug : generateSlug(data.name)
  const slugError = validateSlug(slug)
  if (slugError) return c.json({ error: slugError }, 400)

  const db = getDb(c.env.DATABASE_URL)

  // Check slug uniqueness within this super admin
  const existing = await db
    .select()
    .from(societies)
    .where(
      and(
        eq(societies.superAdminId, adminId),
        eq(societies.slug, slug)
      )
    )
    .limit(1)

  if (existing.length > 0) {
    return c.json(
      { error: `Society slug "${slug}" already exists` },
      409
    )
  }

  const [created] = await db
    .insert(societies)
    .values({
      superAdminId: adminId,
      slug,
      name: data.name,
      address: data.address ?? null,
      totalFlats: data.totalFlats ?? 0,
      planAmount: data.planAmount ?? 0,
      planStartDate: data.planStartDate ? new Date(data.planStartDate) : null,
      planEndDate: data.planEndDate ? new Date(data.planEndDate) : null,
      status: 'active',
    })
    .returning()

  return c.json({ success: true, society: created })
})

// ────────────────────────────────────────────────────────────
// GET /super-admin/societies/:id  →  one society details
// ────────────────────────────────────────────────────────────
superAdmin.get('/societies/:id', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const db = getDb(c.env.DATABASE_URL)
  const [society] = await db
    .select()
    .from(societies)
    .where(
      and(eq(societies.id, id), eq(societies.superAdminId, adminId))
    )
    .limit(1)

  if (!society) return c.json({ error: 'Not found' }, 404)
  return c.json({ society })
})

// ────────────────────────────────────────────────────────────
// PATCH /super-admin/societies/:id  →  update society
// ────────────────────────────────────────────────────────────
const updateSocietySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().optional(),
  totalFlats: z.number().int().min(0).optional(),
  planAmount: z.number().int().min(0).optional(),
  planEndDate: z.string().optional(),
  status: z.enum(['active', 'suspended', 'expired', 'pending']).optional(),
})

superAdmin.patch('/societies/:id', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = updateSocietySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const db = getDb(c.env.DATABASE_URL)

  // Verify the society belongs to this super admin
  const [existing] = await db
    .select()
    .from(societies)
    .where(
      and(eq(societies.id, id), eq(societies.superAdminId, adminId))
    )
    .limit(1)

  if (!existing) return c.json({ error: 'Not found' }, 404)

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.address !== undefined) updates.address = parsed.data.address
  if (parsed.data.totalFlats !== undefined)
    updates.totalFlats = parsed.data.totalFlats
  if (parsed.data.planAmount !== undefined)
    updates.planAmount = parsed.data.planAmount
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.planEndDate !== undefined) {
    updates.planEndDate = new Date(parsed.data.planEndDate)
  }

  const [updated] = await db
    .update(societies)
    .set(updates)
    .where(eq(societies.id, id))
    .returning()

  return c.json({ success: true, society: updated })
})

// ────────────────────────────────────────────────────────────
// POST /super-admin/societies/:id/chairman  →  assign a chairman
// (Bootstraps a society — the chairman is the first user who can
// then upload member Excel etc.)
// ────────────────────────────────────────────────────────────
const assignChairmanSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/),
  name: z.string().min(2).max(200),
})

superAdmin.post('/societies/:id/chairman', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = assignChairmanSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const db = getDb(c.env.DATABASE_URL)

  // Verify the society belongs to this super admin
  const [society] = await db
    .select()
    .from(societies)
    .where(
      and(eq(societies.id, id), eq(societies.superAdminId, adminId))
    )
    .limit(1)
  if (!society) return c.json({ error: 'Society not found' }, 404)

  // Find or create the user
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.mobile, parsed.data.mobile))
    .limit(1)

  let userId: number
  if (existingUser) {
    if (existingUser.userType !== 'society_user') {
      return c.json(
        {
          error: `Mobile is registered as ${existingUser.userType}; cannot reassign`,
        },
        409
      )
    }
    userId = existingUser.id
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        mobile: parsed.data.mobile,
        name: parsed.data.name,
        userType: 'society_user',
        superAdminId: adminId,
      })
      .returning()
    userId = newUser.id
  }

  // Create chairman role (also create member role for completeness)
  await db
    .insert(societyRoles)
    .values({
      societyId: id,
      userId,
      role: 'chairman',
      assignedBy: c.get('user').userId,
    })
    .onConflictDoNothing()

  await db
    .insert(societyRoles)
    .values({
      societyId: id,
      userId,
      role: 'member',
      assignedBy: c.get('user').userId,
    })
    .onConflictDoNothing()

  return c.json({
    success: true,
    chairmanUserId: userId,
    message: `Chairman assigned to ${society.name}`,
  })
})


// ────────────────────────────────────────────────────────────
// POST /super-admin/societies/:id/upload-members
// Super admin can upload Excel for any of their societies
// (used for initial bootstrap or any time)
// ────────────────────────────────────────────────────────────
superAdmin.post('/societies/:id/upload-members', async (c) => {
  const adminId = getSuperAdminId(c)
  if (!adminId) return c.json({ error: 'Invalid super admin context' }, 400)

  const societyId = parseInt(c.req.param('id'), 10)
  if (isNaN(societyId)) return c.json({ error: 'Invalid society id' }, 400)

  const db = getDb(c.env.DATABASE_URL)

  // Verify society belongs to this super admin
  const [societyRow] = await db
    .select()
    .from(societies)
    .where(and(eq(societies.id, societyId), eq(societies.superAdminId, adminId)))
    .limit(1)
  if (!societyRow) return c.json({ error: 'Society not found' }, 404)

  const buffer = await c.req.arrayBuffer()
  if (!buffer || buffer.byteLength === 0) {
    return c.json({ error: 'Empty file' }, 400)
  }
  if (buffer.byteLength > 5 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 5 MB)' }, 400)
  }

  const result = await importMembersFromExcel(buffer, {
    db,
    societyId,
    superAdminId: adminId,
    assignedByUserId: c.get('user').userId,
  })

  return c.json(result, result.success ? 200 : 400)
})

export default superAdmin