import { eq, and, gt, desc } from 'drizzle-orm'
import type { Database } from '../db/client'
import { otps } from '../db/schema'

export const OTP_VALIDITY_MINUTES = 5
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RATE_LIMIT_PER_HOUR = 5
export const OTP_RESEND_COOLDOWN_SECONDS = 30

/**
 * Generates a random 6-digit OTP, or returns the dev fixed OTP
 * if DEV_FIXED_OTP is set (used in local development).
 */
export function generateOtp(devFixedOtp?: string): string {
  if (devFixedOtp && devFixedOtp.length > 0) {
    return devFixedOtp
  }
  // 6 random digits, zero-padded
  const num = Math.floor(Math.random() * 1_000_000)
  return num.toString().padStart(6, '0')
}

/**
 * Stores an OTP in the database.
 */
export async function createOtp(
  db: Database,
  params: {
    mobile: string
    code: string
    scope: string
    scopeRef?: string | null
  }
) {
  const expiresAt = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000)
  const [row] = await db
    .insert(otps)
    .values({
      mobile: params.mobile,
      code: params.code,
      scope: params.scope,
      scopeRef: params.scopeRef ?? null,
      expiresAt,
    })
    .returning()
  return row
}

/**
 * Returns the most recent active (not used, not expired) OTP
 * for a given mobile + scope.
 */
export async function findActiveOtp(
  db: Database,
  params: { mobile: string; scope: string; scopeRef?: string | null }
) {
  const now = new Date()
  const filters = [
    eq(otps.mobile, params.mobile),
    eq(otps.scope, params.scope),
    eq(otps.isUsed, false),
    gt(otps.expiresAt, now),
  ]

  if (params.scopeRef) {
    filters.push(eq(otps.scopeRef, params.scopeRef))
  }

  const rows = await db
    .select()
    .from(otps)
    .where(and(...filters))
    .orderBy(desc(otps.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function incrementOtpAttempts(db: Database, otpId: number) {
  const [row] = await db
    .update(otps)
    .set({ attempts: (await getAttempts(db, otpId)) + 1 })
    .where(eq(otps.id, otpId))
    .returning()
  return row
}

async function getAttempts(db: Database, otpId: number): Promise<number> {
  const rows = await db.select({ attempts: otps.attempts }).from(otps).where(eq(otps.id, otpId)).limit(1)
  return rows[0]?.attempts ?? 0
}

export async function markOtpUsed(db: Database, otpId: number) {
  await db.update(otps).set({ isUsed: true }).where(eq(otps.id, otpId))
}

/**
 * How many OTPs have been requested for this mobile in the last hour.
 * Used for rate limiting.
 */
export async function countRecentOtps(
  db: Database,
  mobile: string
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const rows = await db
    .select()
    .from(otps)
    .where(and(eq(otps.mobile, mobile), gt(otps.createdAt, oneHourAgo)))
  return rows.length
}

/**
 * Returns the seconds remaining before the user can request another OTP.
 * 0 means they can request now.
 */
export async function getResendCooldownRemaining(
  db: Database,
  params: { mobile: string; scope: string }
): Promise<number> {
  const cutoff = new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000)
  const rows = await db
    .select()
    .from(otps)
    .where(
      and(
        eq(otps.mobile, params.mobile),
        eq(otps.scope, params.scope),
        gt(otps.createdAt, cutoff)
      )
    )
    .orderBy(desc(otps.createdAt))
    .limit(1)

  if (rows.length === 0) return 0

  const lastSent = rows[0].createdAt
  const elapsedSec = Math.floor((Date.now() - lastSent.getTime()) / 1000)
  const remaining = OTP_RESEND_COOLDOWN_SECONDS - elapsedSec
  return Math.max(0, remaining)
}
