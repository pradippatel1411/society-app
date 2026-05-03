import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { superAdmins, societies, users } from '../db/schema'
import { requireAuth, requireUserType } from '../lib/middleware'
import { validateSlug, generateSlug } from '../lib/slug'

type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
}

const owner = new Hono<{ Bindings: Bindings }>()

// All routes here require a valid product_owner JWT
owner.use('/*', requireAuth)
owner.use('/*', requireUserType('product_owner'))

// ────────────────────────────────────────────────────────────
// POST /owner/super-admins  →  create a new super admin
// ────────────────────────────────────────────────────────────
const createSuperAdminSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().optional(), // auto-generated if not provided
  contactMobile: z.string().regex(/^\d{10}$/, 'Must be 10 digits'),
  contactEmail: z.string().email().optional().nullable(),
  brandColor: z.string().optional(),
  planAmount: z.number().int().min(0).optional(),
  planStartDate: z.string().optional(), // ISO date string
  planEndDate: z.string().optional(),
})

owner.post('/super-admins', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSuperAdminSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const data = parsed.data
  const slug = data.slug ? data.slug : generateSlug(data.name)

  const slugError = validateSlug(slug)
  if (slugError) return c.json({ error: slugError }, 400)

  const db = getDb(c.env.DATABASE_URL)

  // Check slug uniqueness
  const existing = await db
    .select()
    .from(superAdmins)
    .where(eq(superAdmins.slug, slug))
    .limit(1)
  if (existing.length > 0) {
    return c.json({ error: `Slug "${slug}" is already taken` }, 409)
  }

  // Check mobile uniqueness in users table
  const mobileTaken = await db
    .select()
    .from(users)
    .where(eq(users.mobile, data.contactMobile))
    .limit(1)
  if (mobileTaken.length > 0) {
    return c.json(
      { error: `Mobile ${data.contactMobile} is already registered` },
      409
    )
  }

  // Create super_admin row
  const [createdAdmin] = await db
    .insert(superAdmins)
    .values({
      slug,
      name: data.name,
      contactMobile: data.contactMobile,
      contactEmail: data.contactEmail ?? null,
      brandColor: data.brandColor ?? '#1e40af',
      planAmount: data.planAmount ?? 0,
      planStartDate: data.planStartDate ? new Date(data.planStartDate) : null,
      planEndDate: data.planEndDate ? new Date(data.planEndDate) : null,
      status: 'active',
    })
    .returning()

  // Create the corresponding user record (so they can log in)
  const [createdUser] = await db
    .insert(users)
    .values({
      mobile: data.contactMobile,
      name: data.name,
      email: data.contactEmail ?? null,
      userType: 'super_admin',
      superAdminId: createdAdmin.id,
    })
    .returning()

  return c.json({
    success: true,
    superAdmin: createdAdmin,
    user: { id: createdUser.id, mobile: createdUser.mobile },
  })
})

// ────────────────────────────────────────────────────────────
// GET /owner/super-admins  →  list all super admins
// ────────────────────────────────────────────────────────────
owner.get('/super-admins', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const rows = await db
    .select()
    .from(superAdmins)
    .orderBy(desc(superAdmins.createdAt))
  return c.json({ superAdmins: rows })
})

// ────────────────────────────────────────────────────────────
// GET /owner/super-admins/:id  →  get one super admin + their societies
// ────────────────────────────────────────────────────────────
owner.get('/super-admins/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const db = getDb(c.env.DATABASE_URL)
  const [admin] = await db
    .select()
    .from(superAdmins)
    .where(eq(superAdmins.id, id))
    .limit(1)
  if (!admin) return c.json({ error: 'Not found' }, 404)

  const adminSocieties = await db
    .select()
    .from(societies)
    .where(eq(societies.superAdminId, id))

  return c.json({ superAdmin: admin, societies: adminSocieties })
})

// ────────────────────────────────────────────────────────────
// PATCH /owner/super-admins/:id  →  update or suspend
// ────────────────────────────────────────────────────────────
const updateSuperAdminSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  brandColor: z.string().optional(),
  status: z.enum(['active', 'suspended', 'expired', 'pending']).optional(),
  planAmount: z.number().int().min(0).optional(),
  planEndDate: z.string().optional(), // ISO date string
})

owner.patch('/super-admins/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = updateSuperAdminSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const db = getDb(c.env.DATABASE_URL)
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.brandColor !== undefined) updates.brandColor = parsed.data.brandColor
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.planAmount !== undefined) updates.planAmount = parsed.data.planAmount
  if (parsed.data.planEndDate !== undefined) {
    updates.planEndDate = new Date(parsed.data.planEndDate)
  }

  const [updated] = await db
    .update(superAdmins)
    .set(updates)
    .where(eq(superAdmins.id, id))
    .returning()

  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true, superAdmin: updated })
})

// ────────────────────────────────────────────────────────────
// POST /owner/societies  →  create society under a super admin
// ────────────────────────────────────────────────────────────
const createSocietySchema = z.object({
  superAdminId: z.number().int().positive(),
  name: z.string().min(2).max(200),
  slug: z.string().optional(),
  address: z.string().optional(),
  totalFlats: z.number().int().min(0).optional(),
  planAmount: z.number().int().min(0).optional(),
  planStartDate: z.string().optional(),
  planEndDate: z.string().optional(),
})

owner.post('/societies', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSocietySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const data = parsed.data
  const slug = data.slug ? data.slug : generateSlug(data.name)
  const slugError = validateSlug(slug)
  if (slugError) return c.json({ error: slugError }, 400)

  const db = getDb(c.env.DATABASE_URL)

  // Verify the super_admin exists
  const [admin] = await db
    .select()
    .from(superAdmins)
    .where(eq(superAdmins.id, data.superAdminId))
    .limit(1)
  if (!admin) return c.json({ error: 'Super admin not found' }, 404)

  // Check slug uniqueness within this super admin
  const existing = await db
    .select()
    .from(societies)
    .where(eq(societies.superAdminId, data.superAdminId))
  const conflict = existing.find((s) => s.slug === slug)
  if (conflict) {
    return c.json(
      {
        error: `Society slug "${slug}" already exists under this super admin`,
      },
      409
    )
  }

  const [created] = await db
    .insert(societies)
    .values({
      superAdminId: data.superAdminId,
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
// GET /owner/societies  →  list all societies (across super admins)
// ────────────────────────────────────────────────────────────
owner.get('/societies', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const rows = await db.select().from(societies).orderBy(desc(societies.createdAt))
  return c.json({ societies: rows })
})

export default owner