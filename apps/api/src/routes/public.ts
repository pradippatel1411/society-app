import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../db/client'
import { superAdmins, societies } from '../db/schema'

type Bindings = {
  DATABASE_URL: string
}

const publicRoutes = new Hono<{ Bindings: Bindings }>()

// ────────────────────────────────────────────────────────────
// GET /public/branding/:superAdminSlug
//   → super admin name, logo, brand color (no auth needed)
// ────────────────────────────────────────────────────────────
publicRoutes.get('/branding/:superAdminSlug', async (c) => {
  const slug = c.req.param('superAdminSlug')
  const db = getDb(c.env.DATABASE_URL)

  const [admin] = await db
    .select({
      id: superAdmins.id,
      slug: superAdmins.slug,
      name: superAdmins.name,
      logoUrl: superAdmins.logoUrl,
      brandColor: superAdmins.brandColor,
      status: superAdmins.status,
    })
    .from(superAdmins)
    .where(eq(superAdmins.slug, slug))
    .limit(1)

  if (!admin) {
    return c.json({ error: 'Not found' }, 404)
  }

  if (admin.status !== 'active') {
    return c.json({ error: 'This portal is not active' }, 403)
  }

  return c.json({ superAdmin: admin })
})

// ────────────────────────────────────────────────────────────
// GET /public/branding/:superAdminSlug/:societySlug
//   → super admin + society info (no auth needed)
// ────────────────────────────────────────────────────────────
publicRoutes.get(
  '/branding/:superAdminSlug/:societySlug',
  async (c) => {
    const superAdminSlug = c.req.param('superAdminSlug')
    const societySlug = c.req.param('societySlug')
    const db = getDb(c.env.DATABASE_URL)

    const [admin] = await db
      .select()
      .from(superAdmins)
      .where(eq(superAdmins.slug, superAdminSlug))
      .limit(1)

    if (!admin || admin.status !== 'active') {
      return c.json({ error: 'Portal not found' }, 404)
    }

    const [society] = await db
      .select()
      .from(societies)
      .where(
        and(
          eq(societies.superAdminId, admin.id),
          eq(societies.slug, societySlug)
        )
      )
      .limit(1)

    if (!society || society.status !== 'active') {
      return c.json({ error: 'Society not found' }, 404)
    }

    return c.json({
      superAdmin: {
        id: admin.id,
        slug: admin.slug,
        name: admin.name,
        logoUrl: admin.logoUrl,
        brandColor: admin.brandColor,
      },
      society: {
        id: society.id,
        slug: society.slug,
        name: society.name,
        address: society.address,
        totalFlats: society.totalFlats,
      },
    })
  }
)

export default publicRoutes