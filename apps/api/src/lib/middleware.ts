import { createMiddleware } from 'hono/factory'
import { verifyJwt, type JwtPayload } from './jwt'
import type { UserType } from '../db/types'

type Bindings = {
  JWT_SECRET: string
}

type Variables = {
  user: JwtPayload
}

/**
 * Verifies JWT from Authorization header.
 * Attaches the decoded user payload to c.var.user.
 */
export const requireAuth = createMiddleware<{
  Bindings: Bindings
  Variables: Variables
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return c.json({ error: 'Empty token' }, 401)
  }

  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  c.set('user', payload)
  await next()
})

/**
 * Requires the user's userType to match one of the allowed types.
 * Use AFTER requireAuth.
 */
export function requireUserType(...allowed: UserType[]) {
  return createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
    async (c, next) => {
      const user = c.get('user')
      if (!user) {
        return c.json({ error: 'Not authenticated' }, 401)
      }
      if (!allowed.includes(user.userType as UserType)) {
        return c.json({ error: 'Forbidden — insufficient permissions' }, 403)
      }
      await next()
    }
  )
}