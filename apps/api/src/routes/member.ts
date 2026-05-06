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
  users,
  societyRoles,
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
    societyId?: number | null
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

  if (!user.societyId) {
    return c.json({ error: 'Society context missing from token' }, 401)
  }

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
    .where(
      and(
        eq(flatMembers.userId, user.userId),
        eq(flats.societyId, user.societyId)
      )
    )

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

  if (!user.societyId) {
    return c.json({ error: 'Society context missing from token' }, 401)
  }

  const myFlatRows = await db
    .select({ flatId: flatMembers.flatId })
    .from(flatMembers)
    .innerJoin(flats, eq(flatMembers.flatId, flats.id))
    .where(
      and(
        eq(flatMembers.userId, user.userId),
        eq(flats.societyId, user.societyId)
      )
    )
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

// ────────────────────────────────────────────────────────────
// GET /member/flat/:flatId
// Returns flat details + members list for one of the user's flats.
// Member must be linked to this flat.
// ────────────────────────────────────────────────────────────
member.get('/flat/:flatId', async (c) => {
  const user = c.get('user')
  const db = getDb(c.env.DATABASE_URL)
  const flatId = parseInt(c.req.param('flatId'), 10)
  if (isNaN(flatId)) return c.json({ error: 'Invalid flat id' }, 400)

  // Verify the user is actually a member of this flat
  const [link] = await db
    .select()
    .from(flatMembers)
    .where(and(eq(flatMembers.flatId, flatId), eq(flatMembers.userId, user.userId)))
    .limit(1)
  if (!link) return c.json({ error: 'Flat not found or access denied' }, 403)

  // Fetch flat details
  const [flat] = await db
    .select()
    .from(flats)
    .where(eq(flats.id, flatId))
    .limit(1)
  if (!flat) return c.json({ error: 'Flat not found' }, 404)

  // Fetch all members of this flat with their society role
  const memberRows = await db
    .select({
      userId: flatMembers.userId,
      relation: flatMembers.relation,
      isPrimary: flatMembers.isPrimary,
      name: users.name,
      mobile: users.mobile,
    })
    .from(flatMembers)
    .innerJoin(users, eq(flatMembers.userId, users.id))
    .where(eq(flatMembers.flatId, flatId))

  // Fetch roles for those users in this society
  const userIds = memberRows.map((m) => m.userId)
  const roles =
    userIds.length === 0
      ? []
      : await db
          .select({ userId: societyRoles.userId, role: societyRoles.role })
          .from(societyRoles)
          .where(
            and(
              eq(societyRoles.societyId, flat.societyId),
              inArray(societyRoles.userId, userIds),
              eq(societyRoles.isActive, true)
            )
          )

  const members = memberRows.map((m) => ({
    userId: m.userId,
    name: m.name,
    mobile: m.mobile,
    relation: m.relation,
    isPrimary: m.isPrimary,
    role: roles.find((r) => r.userId === m.userId)?.role ?? 'member',
  }))

  return c.json({
    flat: {
      id: flat.id,
      block: flat.block,
      flatNo: flat.flatNo,
      label: `${flat.block}-${flat.flatNo}`,
      ownerName: flat.ownerName,
      residencyType: flat.residencyType,
      societyId: flat.societyId,
      members,
    },
  })
})

// ────────────────────────────────────────────────────────────
// POST /member/pay
// Member self-records a payment for their own flat.
// Delegates to the same logic as committee payment recording
// but restricted to the user's own flats.
// Body: { masterId, flatId, frequency, amount, mode, gatewayTxnId? }
// ────────────────────────────────────────────────────────────
member.post('/pay', async (c) => {
  const user = c.get('user')
  const db = getDb(c.env.DATABASE_URL)

  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: 'Invalid request body' }, 400)

  const { masterId, flatId, frequency, amount, mode, gatewayTxnId } = body as {
    masterId: number
    flatId: number
    frequency: string
    amount: number
    mode: string
    gatewayTxnId?: string | null
  }

  if (!masterId || !flatId || !frequency || !amount || !mode) {
    return c.json({ error: 'Missing required fields: masterId, flatId, frequency, amount, mode' }, 400)
  }

  const validFrequencies = ['monthly', 'quarterly', 'half_yearly', 'yearly']
  const validModes = ['upi', 'cash', 'cheque', 'manual']
  if (!validFrequencies.includes(frequency)) {
    return c.json({ error: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}` }, 400)
  }
  if (!validModes.includes(mode)) {
    return c.json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, 400)
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return c.json({ error: 'Amount must be a positive integer' }, 400)
  }

  // Verify user is linked to this flat
  const [link] = await db
    .select()
    .from(flatMembers)
    .where(and(eq(flatMembers.flatId, flatId), eq(flatMembers.userId, user.userId)))
    .limit(1)
  if (!link) return c.json({ error: 'You are not a member of this flat' }, 403)

  // Load flat
  const [flat] = await db
    .select()
    .from(flats)
    .where(eq(flats.id, flatId))
    .limit(1)
  if (!flat) return c.json({ error: 'Flat not found' }, 404)

  // Load master
  const [master] = await db
    .select()
    .from(maintenanceMaster)
    .where(
      and(
        eq(maintenanceMaster.id, masterId),
        eq(maintenanceMaster.societyId, flat.societyId)
      )
    )
    .limit(1)
  if (!master) return c.json({ error: 'Maintenance master not found' }, 404)
  if (master.status !== 'active') {
    return c.json({ error: 'This financial year is closed' }, 400)
  }

  // Get the per-cycle amount for this flat's residency + chosen frequency
  const freq = frequency as MaintenanceFrequency
  const freqAmount = pickAmount(master, flat.residencyType, freq)
  if (freqAmount == null) {
    return c.json(
      { error: `Frequency "${frequency}" is not enabled for ${flat.residencyType}s in this FY` },
      400
    )
  }

  // Amount must be a positive multiple of freqAmount
  if (amount % freqAmount !== 0) {
    return c.json(
      {
        error: `Amount must be a multiple of ₹${freqAmount} (the ${frequency} amount for ${flat.residencyType}s)`,
      },
      400
    )
  }

  // Get or create the flat_payment_track row
  const [existingTrack] = await db
    .select()
    .from(flatPaymentTrack)
    .where(
      and(
        eq(flatPaymentTrack.maintenanceMasterId, masterId),
        eq(flatPaymentTrack.flatId, flatId)
      )
    )
    .limit(1)

  let trackId: number
  let lockedFrequency: MaintenanceFrequency
  let totalAmount: number
  let currentPaid: number

  if (!existingTrack) {
    const cycles = FREQUENCY_CYCLES[freq]
    totalAmount = freqAmount * cycles
    const [created] = await db
      .insert(flatPaymentTrack)
      .values({
        maintenanceMasterId: masterId,
        flatId,
        frequency: freq,
        totalAmount,
        paidAmount: 0,
        status: 'unpaid',
      })
      .returning()
    trackId = created.id
    lockedFrequency = freq
    currentPaid = 0
  } else {
    if (existingTrack.status === 'paid') {
      return c.json({ error: 'This flat is already fully paid for this FY' }, 400)
    }
    if (existingTrack.frequency === null) {
      // First payment — lock the frequency
      const cycles = FREQUENCY_CYCLES[freq]
      totalAmount = freqAmount * cycles
      lockedFrequency = freq
      await db
        .update(flatPaymentTrack)
        .set({ frequency: freq, totalAmount, updatedAt: new Date() })
        .where(eq(flatPaymentTrack.id, existingTrack.id))
      trackId = existingTrack.id
      currentPaid = existingTrack.paidAmount
    } else {
      if (existingTrack.frequency !== freq) {
        return c.json(
          {
            error: `Your payment frequency is locked to "${existingTrack.frequency}" for this FY. You cannot change it.`,
          },
          400
        )
      }
      lockedFrequency = existingTrack.frequency
      totalAmount =
        existingTrack.totalAmount ?? freqAmount * FREQUENCY_CYCLES[lockedFrequency]
      trackId = existingTrack.id
      currentPaid = existingTrack.paidAmount
    }
  }

  const outstanding = totalAmount - currentPaid
  if (amount > outstanding) {
    return c.json(
      { error: `Cannot pay ₹${amount}. Only ₹${outstanding} is outstanding for this FY.` },
      400
    )
  }

  // Insert the payment row
  const [payment] = await db
    .insert(payments)
    .values({
      maintenanceMasterId: masterId,
      flatId,
      paidByUserId: user.userId,
      frequency: lockedFrequency,
      amount,
      mode: mode as 'upi' | 'cash' | 'cheque' | 'manual',
      gateway: null,
      gatewayTxnId: gatewayTxnId ?? null,
      status: 'success',
      notes: null,
    })
    .returning()

  // Update the track
  const newPaid = currentPaid + amount
  const newStatus = newPaid >= totalAmount ? 'paid' : 'unpaid'
  await db
    .update(flatPaymentTrack)
    .set({ paidAmount: newPaid, status: newStatus, updatedAt: new Date() })
    .where(eq(flatPaymentTrack.id, trackId))

  return c.json({
    success: true,
    payment,
    track: {
      id: trackId,
      frequency: lockedFrequency,
      totalAmount,
      paidAmount: newPaid,
      status: newStatus,
      outstanding: totalAmount - newPaid,
    },
  })
})

export default member
