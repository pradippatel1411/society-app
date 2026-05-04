import { Hono } from 'hono'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  flats,
  flatMembers,
  maintenanceMaster,
  flatPaymentTrack,
  payments,
  societies,
} from '../db/schema'
import { requireAuth, requireUserType } from '../lib/middleware'
import {
  FREQUENCY_CYCLES,
  type MaintenanceFrequency,
} from '../db/types'

type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
}

type Variables = {
  user: {
    userId: number
    mobile: string
    userType: 'product_owner' | 'super_admin' | 'society_user'
  }
}

const member = new Hono<{ Bindings: Bindings; Variables: Variables }>()

member.use('/*', requireAuth)
member.use('/*', requireUserType('society_user'))

// ────────────────────────────────────────────────────────────
// Helper: pick the amount for a given residency + frequency
// from a maintenance_master row.
// Returns null if that combination isn't enabled.
// ────────────────────────────────────────────────────────────
function pickAmount(
  master: typeof maintenanceMaster.$inferSelect,
  residency: string,
  freq: MaintenanceFrequency
): number | null {
  const isOwner = residency === 'owner'
  switch (freq) {
    case 'monthly':
      return isOwner ? master.ownerMonthly : master.tenantMonthly
    case 'quarterly':
      return isOwner ? master.ownerQuarterly : master.tenantQuarterly
    case 'half_yearly':
      return isOwner ? master.ownerHalfYearly : master.tenantHalfYearly
    case 'yearly':
      return isOwner ? master.ownerYearly : master.tenantYearly
  }
}

// ────────────────────────────────────────────────────────────
// GET /member/dues
// All current outstanding dues for the logged-in user across
// all their flats and active maintenance masters.
//
// For each flat × active master:
//   - If track has no frequency yet (no payments made):
//     show available frequencies with their amounts
//   - If track has frequency locked:
//     show outstanding amount + frequency
// ────────────────────────────────────────────────────────────
member.get('/dues', async (c) => {
  const user = c.get('user')
  const db = getDb(c.env.DATABASE_URL)

  // Find this user's flats with society info
  const myFlats = await db
    .select({
      flatId: flatMembers.flatId,
      block: flats.block,
      flatNo: flats.flatNo,
      residencyType: flats.residencyType,
      societyId: flats.societyId,
      societyName: societies.name,
    })
    .from(flatMembers)
    .innerJoin(flats, eq(flatMembers.flatId, flats.id))
    .innerJoin(societies, eq(flats.societyId, societies.id))
    .where(eq(flatMembers.userId, user.userId))

  if (myFlats.length === 0) {
    return c.json({ dues: [] })
  }

  const flatIds = myFlats.map((f) => f.flatId)
  const societyIds = [...new Set(myFlats.map((f) => f.societyId))]

  // All ACTIVE masters across the user's societies
  // All masters (active + closed) where the user might still owe money.
  // We include closed FYs because a flat may have outstanding from a
  // previous year that wasn't fully collected.
  const allMasters = await db
    .select()
    .from(maintenanceMaster)
    .where(inArray(maintenanceMaster.societyId, societyIds))
    .orderBy(desc(maintenanceMaster.fyStartDate))

  // All tracks for the user's flats and active masters
  const masterIds = allMasters.map((m) => m.id)
  const tracks =
    masterIds.length === 0
      ? []
      : await db
          .select()
          .from(flatPaymentTrack)
          .where(
            and(
              inArray(flatPaymentTrack.flatId, flatIds),
              inArray(flatPaymentTrack.maintenanceMasterId, masterIds)
            )
          )

  // Build the response
  const result = []
  for (const flat of myFlats) {
    const flatMasters = allMasters.filter((m) => m.societyId === flat.societyId)
    for (const master of flatMasters) {
      const track = tracks.find(
        (t) => t.flatId === flat.flatId && t.maintenanceMasterId === master.id
      )

      // Build available frequency options (only those master has enabled
      // for this flat's residency type)
      const allFrequencies: MaintenanceFrequency[] = [
        'monthly',
        'quarterly',
        'half_yearly',
        'yearly',
      ]
      const availableOptions = allFrequencies
        .map((freq) => {
          const amount = pickAmount(master, flat.residencyType, freq)
          if (amount == null) return null
          return {
            frequency: freq,
            amountPerCycle: amount,
            cyclesPerYear: FREQUENCY_CYCLES[freq],
            fyTotalIfChosen: amount * FREQUENCY_CYCLES[freq],
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      // No track yet (defensive — shouldn't happen since masters create tracks)
      if (!track) {
        result.push({
          masterId: master.id,
          fyLabel: master.fyLabel,
          fyStartDate: master.fyStartDate,
          fyEndDate: master.fyEndDate,
          flat: {
            id: flat.flatId,
            block: flat.block,
            flatNo: flat.flatNo,
            label: `${flat.block}-${flat.flatNo}`,
            residencyType: flat.residencyType,
            societyName: flat.societyName,
          },
          frequencyLocked: false,
          frequency: null,
          totalAmount: null,
          paidAmount: 0,
          outstanding: null,
          status: 'unpaid',
          availableFrequencies: availableOptions,
        })
        continue
      }

      // Frequency not yet locked → member can pick any available frequency
      if (track.frequency === null) {
        result.push({
          masterId: master.id,
          fyLabel: master.fyLabel,
          fyStartDate: master.fyStartDate,
          fyEndDate: master.fyEndDate,
          flat: {
            id: flat.flatId,
            block: flat.block,
            flatNo: flat.flatNo,
            label: `${flat.block}-${flat.flatNo}`,
            residencyType: flat.residencyType,
            societyName: flat.societyName,
          },
          frequencyLocked: false,
          frequency: null,
          totalAmount: null,
          paidAmount: 0,
          outstanding: null,
          status: track.status,
          availableFrequencies: availableOptions,
        })
        continue
      }

      // Frequency locked → only show that frequency's payment options
      const lockedAmount = pickAmount(master, flat.residencyType, track.frequency)
      const totalAmount = track.totalAmount ?? 0
      const outstanding = totalAmount - track.paidAmount
      
      // Skip fully-paid FYs — no need to show them in dues
      if (outstanding <= 0) continue
      
      result.push({
        masterId: master.id,
        fyLabel: master.fyLabel,
        fyStartDate: master.fyStartDate,
        fyEndDate: master.fyEndDate,
        flat: {
          id: flat.flatId,
          block: flat.block,
          flatNo: flat.flatNo,
          label: `${flat.block}-${flat.flatNo}`,
          residencyType: flat.residencyType,
          societyName: flat.societyName,
        },
        frequencyLocked: true,
        frequency: track.frequency,
        amountPerCycle: lockedAmount,
        totalAmount,
        paidAmount: track.paidAmount,
        outstanding,
        status: track.status,
      })
    }
  }

  return c.json({ dues: result })
})

// ────────────────────────────────────────────────────────────
// GET /member/payments
// Payment history for the user's flats
// ────────────────────────────────────────────────────────────
member.get('/payments', async (c) => {
  const user = c.get('user')
  const db = getDb(c.env.DATABASE_URL)

  const myFlatRows = await db
    .select({ flatId: flatMembers.flatId })
    .from(flatMembers)
    .where(eq(flatMembers.userId, user.userId))
  if (myFlatRows.length === 0) return c.json({ payments: [] })
  const flatIds = myFlatRows.map((r) => r.flatId)

  const rows = await db
    .select({
      paymentId: payments.id,
      amount: payments.amount,
      frequency: payments.frequency,
      mode: payments.mode,
      gateway: payments.gateway,
      gatewayTxnId: payments.gatewayTxnId,
      status: payments.status,
      receiptUrl: payments.receiptUrl,
      paidAt: payments.paidAt,
      flatId: flats.id,
      block: flats.block,
      flatNo: flats.flatNo,
      masterId: maintenanceMaster.id,
      fyLabel: maintenanceMaster.fyLabel,
    })
    .from(payments)
    .innerJoin(flats, eq(payments.flatId, flats.id))
    .innerJoin(
      maintenanceMaster,
      eq(payments.maintenanceMasterId, maintenanceMaster.id)
    )
    .where(inArray(payments.flatId, flatIds))
    .orderBy(desc(payments.paidAt))

  return c.json({ payments: rows })
})

export default member
