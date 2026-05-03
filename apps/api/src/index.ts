import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getDb } from './db/client'
import { superAdmins, users, societies } from './db/schema'

type Bindings = {
  DATABASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors({
  origin: ['http://localhost:5173'],
  credentials: true,
}))

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Society API is running',
    timestamp: new Date().toISOString(),
  })
})

// Test DB connection
app.get('/db-test', async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL)
    const [admins, allUsers, allSocieties] = await Promise.all([
      db.select().from(superAdmins).limit(5),
      db.select().from(users).limit(5),
      db.select().from(societies).limit(5),
    ])
    return c.json({
      status: 'ok',
      message: 'All tables reachable!',
      counts: {
        superAdmins: admins.length,
        users: allUsers.length,
        societies: allSocieties.length,
      },
    })
  } catch (error) {
    return c.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

export default app