import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import {
  generateOtp,
  createOtp,
  findActiveOtp,
  markOtpUsed,
  incrementOtpAttempts,
  countRecentOtps,
  getResendCooldownRemaining,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_PER_HOUR,
  OTP_VALIDITY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '../lib/otp'
import { sendOtpSms } from '../lib/sms'
import { signJwt } from '../lib/jwt'

type Bindings = {
  DATABASE_URL: string
  OWNER_MOBILE: string
  JWT_SECRET: string
  DEV_FIXED_OTP: string
}

const auth = new Hono<{ Bindings: Bindings }>()

// ────────────────────────────────────────────────────────────
// POST /auth/sendOTP
// ────────────────────────────────────────────────────────────
const sendOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Mobile must be 10 digits'),
  scope: z.enum(['owner', 'super_admin', 'society']),
  scopeRef: z.string().optional(),
})

auth.post('/sendOTP', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = sendOtpSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const { mobile, scope, scopeRef } = parsed.data
  const db = getDb(c.env.DATABASE_URL)

  // Cooldown check (prevents rapid resends)
  const cooldownRemaining = await getResendCooldownRemaining(db, { mobile, scope })
  if (cooldownRemaining > 0) {
    return c.json(
      {
        error: `Please wait ${cooldownRemaining} seconds before requesting another OTP.`,
        cooldownSecondsRemaining: cooldownRemaining,
      },
      429
    )
  }

  // Hourly rate limit (prevents abuse)
  const recent = await countRecentOtps(db, mobile)
  if (recent >= OTP_RATE_LIMIT_PER_HOUR) {
    return c.json(
      {
        error:
          'Too many OTP requests for this number. Try again in an hour or contact your admin.',
      },
      429
    )
  }

  // Scope-specific authorization
  if (scope === 'owner') {
    // Hardcoded mobile check (defense in depth)
    if (mobile !== c.env.OWNER_MOBILE) {
      // Generic error — don't leak that this is the owner endpoint
      return c.json({ error: 'Mobile not authorized for this portal.' }, 403)
    }

    // DB check: must exist as product_owner
    const ownerRow = await db
      .select()
      .from(users)
      .where(and(eq(users.mobile, mobile), eq(users.userType, 'product_owner')))
      .limit(1)

    if (ownerRow.length === 0) {
      return c.json({ error: 'Mobile not authorized for this portal.' }, 403)
    }
  } else {
    // super_admin and society scopes — implemented in next step
    return c.json({ error: 'This scope is not yet implemented.' }, 501)
  }

  // Generate + store OTP
  const code = generateOtp(c.env.DEV_FIXED_OTP)
  await createOtp(db, { mobile, code, scope, scopeRef })

  // Send (or log in dev)
  const isDev = !!c.env.DEV_FIXED_OTP && c.env.DEV_FIXED_OTP.length > 0
  await sendOtpSms({ mobile, code, isDev })

  return c.json({
    success: true,
    expiresInMinutes: OTP_VALIDITY_MINUTES,
    nextResendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    devMode: isDev,
  })
})

// ────────────────────────────────────────────────────────────
// POST /auth/verifyOTP
// ────────────────────────────────────────────────────────────
const verifyOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/),
  otp: z.string().regex(/^\d{6}$/),
  scope: z.enum(['owner', 'super_admin', 'society']),
})

auth.post('/verifyOTP', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = verifyOtpSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const { mobile, otp, scope } = parsed.data
  const db = getDb(c.env.DATABASE_URL)

  const activeOtp = await findActiveOtp(db, { mobile, scope })
  if (!activeOtp) {
    return c.json({ error: 'No active OTP found. Please request a new one.' }, 404)
  }

  if (activeOtp.attempts >= OTP_MAX_ATTEMPTS) {
    return c.json(
      { error: 'Too many wrong attempts. Request a new OTP.' },
      429
    )
  }

  if (activeOtp.code !== otp) {
    await incrementOtpAttempts(db, activeOtp.id)
    return c.json({ error: 'Incorrect OTP.' }, 401)
  }

  // OTP correct — mark used
  await markOtpUsed(db, activeOtp.id)

  // Look up user
  const [user] = await db.select().from(users).where(eq(users.mobile, mobile)).limit(1)
  if (!user) {
    return c.json({ error: 'User not found.' }, 404)
  }

  // Issue JWT
  const token = await signJwt(
    {
      userId: user.id,
      mobile: user.mobile,
      userType: user.userType,
      superAdminId: user.superAdminId,
    },
    c.env.JWT_SECRET
  )

  return c.json({
    success: true,
    token,
    user: {
      id: user.id,
      mobile: user.mobile,
      name: user.name,
      userType: user.userType,
    },
  })
})

export default auth