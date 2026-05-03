/**
 * One-time seed script: creates or updates the platform owner user.
 *
 * Run with:  pnpm exec tsx scripts/seed-owner.ts
 *
 * Idempotent: safe to re-run. Uses upsert pattern.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, and, ne } from 'drizzle-orm'
import { users } from '../src/db/schema'
import * as schema from '../src/db/schema'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadEnv() {
  const devVarsPath = resolve(__dirname, '..', '.dev.vars')
  const contents = readFileSync(devVarsPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^"|"$/g, '')
    env[key] = value
  }
  return env
}

async function main() {
  const env = loadEnv()
  const databaseUrl = env.DATABASE_URL
  const ownerMobile = env.OWNER_MOBILE

  if (!databaseUrl) throw new Error('DATABASE_URL not found in .dev.vars')
  if (!ownerMobile) throw new Error('OWNER_MOBILE not found in .dev.vars')
  if (!/^\d{10}$/.test(ownerMobile)) {
    throw new Error(
      `OWNER_MOBILE must be exactly 10 digits, got: "${ownerMobile}"`
    )
  }

  console.log('Connecting to database...')
  const sql = neon(databaseUrl)
  const db = drizzle(sql, { schema })

  // Safety check: refuse if a different mobile is already the owner
  const otherOwner = await db
    .select()
    .from(users)
    .where(
      and(eq(users.userType, 'product_owner'), ne(users.mobile, ownerMobile))
    )

  if (otherOwner.length > 0) {
    console.error(
      `❌ A different product_owner already exists with mobile "${otherOwner[0].mobile}".`
    )
    console.error(
      '   Refusing to create a second owner. Update .dev.vars or remove the existing row.'
    )
    process.exit(1)
  }

  // Safety check: refuse if our mobile is already used by a different user type
  const conflictingUser = await db
    .select()
    .from(users)
    .where(and(eq(users.mobile, ownerMobile), ne(users.userType, 'product_owner')))

  if (conflictingUser.length > 0) {
    console.error(
      `❌ Mobile ${ownerMobile} is already used by user type "${conflictingUser[0].userType}".`
    )
    console.error('   Choose a different OWNER_MOBILE.')
    process.exit(1)
  }

  // Upsert: insert if not exists, update name if exists
  const [owner] = await db
    .insert(users)
    .values({
      mobile: ownerMobile,
      name: 'Platform Owner',
      userType: 'product_owner',
    })
    .onConflictDoUpdate({
      target: users.mobile,
      set: {
        name: 'Platform Owner',
        userType: 'product_owner',
      },
    })
    .returning()

  console.log('✅ Platform owner ready.')
  console.log(`   id: ${owner.id}`)
  console.log(`   mobile: ${owner.mobile}`)
  console.log(`   userType: ${owner.userType}`)
  console.log('')
  console.log('You can now log in at /owner using this mobile + OTP.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})