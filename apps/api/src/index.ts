import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// Allow our React frontend to call this API
app.use('/*', cors({
  origin: ['http://localhost:5173'],
  credentials: true,
}))

// Health check route
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Society API is running',
    timestamp: new Date().toISOString(),
  })
})

// Test route
app.get('/hello/:name', (c) => {
  const name = c.req.param('name')
  return c.json({ message: `Hello, ${name}!` })
})

export default app