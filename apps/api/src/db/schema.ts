import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import {
  UserType,
  SuperAdminStatus,
  SocietyStatus,
  ResidencyType,
  FlatMemberRelation,
  SocietyRole,
  MaintenanceFrequency,
  MaintenanceMasterStatus,
  PaymentTrackStatus,
  PaymentMode,
  PaymentStatus,
  PaymentGateway,
} from './types'

// ============================================================
// Table 1: super_admins
// White-label tenants of the platform
// ============================================================
export const superAdmins = pgTable('super_admins', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  logoUrl: text('logo_url'),
  brandColor: varchar('brand_color', { length: 20 }).default('#1e40af'),
  contactMobile: varchar('contact_mobile', { length: 15 }).notNull(),
  contactEmail: varchar('contact_email', { length: 200 }),
  planAmount: integer('plan_amount').default(0),
  planStartDate: timestamp('plan_start_date'),
  planEndDate: timestamp('plan_end_date'),
  status: varchar('status', { length: 20 })
    .$type<SuperAdminStatus>()
    .default('active')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================================
// Table 2: users
// The human; mobile number is the unique login key
// ============================================================
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    mobile: varchar('mobile', { length: 15 }).notNull().unique(),
    name: varchar('name', { length: 200 }),
    email: varchar('email', { length: 200 }),
    userType: varchar('user_type', { length: 20 }).$type<UserType>().notNull(),
    superAdminId: integer('super_admin_id').references(() => superAdmins.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_mobile_idx').on(table.mobile)]
)

// ============================================================
// Table 3: societies
// Each society belongs to one super admin
// ============================================================
export const societies = pgTable(
  'societies',
  {
    id: serial('id').primaryKey(),
    superAdminId: integer('super_admin_id')
      .notNull()
      .references(() => superAdmins.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    address: text('address'),
    totalFlats: integer('total_flats').default(0),
    planAmount: integer('plan_amount').default(0),
    planStartDate: timestamp('plan_start_date'),
    planEndDate: timestamp('plan_end_date'),
    status: varchar('status', { length: 20 })
      .$type<SocietyStatus>()
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('society_slug_per_super_admin_idx').on(
      table.superAdminId,
      table.slug
    ),
  ]
)

// ============================================================
// Table 4: flats
// Physical flats. Block + flat_no together identify a flat.
// ============================================================
export const flats = pgTable(
  'flats',
  {
    id: serial('id').primaryKey(),
    societyId: integer('society_id')
      .notNull()
      .references(() => societies.id, { onDelete: 'cascade' }),
    block: varchar('block', { length: 20 }).notNull(),
    flatNo: varchar('flat_no', { length: 20 }).notNull(),
    ownerName: varchar('owner_name', { length: 200 }),
    residencyType: varchar('residency_type', { length: 20 })
      .$type<ResidencyType>()
      .default('owner')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('flat_per_society_idx').on(
      table.societyId,
      table.block,
      table.flatNo
    ),
  ]
)

// ============================================================
// Table 5: flat_members
// Junction: which user is associated with which flat
// (max 2 per flat; one mobile can be in multiple flats)
// ============================================================
export const flatMembers = pgTable(
  'flat_members',
  {
    id: serial('id').primaryKey(),
    flatId: integer('flat_id')
      .notNull()
      .references(() => flats.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    relation: varchar('relation', { length: 20 })
      .$type<FlatMemberRelation>()
      .default('owner')
      .notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('flat_user_idx').on(table.flatId, table.userId)]
)

// ============================================================
// Table 6: society_roles
// Roles a user holds in a society (chairman, secretary, cashier,
// committee, or just member)
// ============================================================
export const societyRoles = pgTable(
  'society_roles',
  {
    id: serial('id').primaryKey(),
    societyId: integer('society_id')
      .notNull()
      .references(() => societies.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 30 }).$type<SocietyRole>().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    assignedBy: integer('assigned_by').references(() => users.id),
  },
  (table) => [
    uniqueIndex('society_user_role_idx').on(
      table.societyId,
      table.userId
    ),
  ]
)

// ============================================================
// Table 7: maintenance_master
// Chairman creates one entry per Financial Year per society.
// Sets enabled frequencies + amount for each enabled frequency.
// Only fill columns for frequencies you enable; leave others null.
// ============================================================
export const maintenanceMaster = pgTable('maintenance_master', {
  id: serial('id').primaryKey(),
  societyId: integer('society_id')
    .notNull()
    .references(() => societies.id, { onDelete: 'cascade' }),
  fyLabel: varchar('fy_label', { length: 50 }).notNull(),
  fyStartDate: timestamp('fy_start_date').notNull(),
  fyEndDate: timestamp('fy_end_date').notNull(),

  // Owner amounts — fill only enabled frequencies, leave others null
  ownerMonthly: integer('owner_monthly'),
  ownerQuarterly: integer('owner_quarterly'),
  ownerHalfYearly: integer('owner_half_yearly'),
  ownerYearly: integer('owner_yearly'),

  // Tenant amounts — fill only enabled frequencies
  tenantMonthly: integer('tenant_monthly'),
  tenantQuarterly: integer('tenant_quarterly'),
  tenantHalfYearly: integer('tenant_half_yearly'),
  tenantYearly: integer('tenant_yearly'),

  // Penalty (informational only — chairman handles offline)
  penaltyPerDayOwner: integer('penalty_per_day_owner').default(0),
  penaltyPerDayTenant: integer('penalty_per_day_tenant').default(0),

  status: varchar('status', { length: 20 })
    .$type<MaintenanceMasterStatus>()
    .default('active')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ============================================================
// Table 8: flat_payment_track
// One row per flat per FY master. Eagerly created when master is
// created. Tracks the locked frequency + total + paid amount.
//
// frequency and totalAmount are null until the flat's first payment.
// On first payment, both get set based on the chosen frequency.
// ============================================================
export const flatPaymentTrack = pgTable(
  'flat_payment_track',
  {
    id: serial('id').primaryKey(),
    maintenanceMasterId: integer('maintenance_master_id')
      .notNull()
      .references(() => maintenanceMaster.id, { onDelete: 'cascade' }),
    flatId: integer('flat_id')
      .notNull()
      .references(() => flats.id, { onDelete: 'cascade' }),
    // Locked frequency — set on first payment, then unchangeable
    frequency: varchar('frequency', { length: 20 }).$type<MaintenanceFrequency>(),
    // Total FY amount = freq_amount × cycles_per_year (set on first payment)
    totalAmount: integer('total_amount'),
    paidAmount: integer('paid_amount').default(0).notNull(),
    status: varchar('status', { length: 20 })
      .$type<PaymentTrackStatus>()
      .default('unpaid')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('flat_master_idx').on(
      table.maintenanceMasterId,
      table.flatId
    ),
  ]
)

// ============================================================
// Table 9: payments
// Each successful payment a member made for a maintenance master.
// Multiple payments can exist for one flat_payment_track.
// ============================================================
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  maintenanceMasterId: integer('maintenance_master_id')
    .notNull()
    .references(() => maintenanceMaster.id, { onDelete: 'cascade' }),
  flatId: integer('flat_id')
    .notNull()
    .references(() => flats.id, { onDelete: 'cascade' }),
  paidByUserId: integer('paid_by_user_id').references(() => users.id),
  frequency: varchar('frequency', { length: 20 })
    .$type<MaintenanceFrequency>()
    .notNull(),
  amount: integer('amount').notNull(),
  mode: varchar('mode', { length: 20 }).$type<PaymentMode>().notNull(),
  gateway: varchar('gateway', { length: 50 }).$type<PaymentGateway>(),
  gatewayTxnId: varchar('gateway_txn_id', { length: 200 }),
  status: varchar('status', { length: 20 })
    .$type<PaymentStatus>()
    .default('success')
    .notNull(),
  notes: text('notes'),
  receiptUrl: text('receipt_url'),
  paidAt: timestamp('paid_at').defaultNow().notNull(),
})

// ============================================================
// Table 10: otps
// Sent OTPs awaiting verification. Cleaned up periodically.
// ============================================================
export const otps = pgTable(
  'otps',
  {
    id: serial('id').primaryKey(),
    mobile: varchar('mobile', { length: 15 }).notNull(),
    code: varchar('code', { length: 10 }).notNull(),
    scope: varchar('scope', { length: 30 }).notNull(),
    scopeRef: varchar('scope_ref', { length: 100 }),
    attempts: integer('attempts').default(0).notNull(),
    isUsed: boolean('is_used').default(false).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('otps_mobile_scope_idx').on(table.mobile, table.scope),
  ]
)

// ============================================================
// Relations (helps Drizzle do JOINs cleanly)
// ============================================================
export const superAdminsRelations = relations(superAdmins, ({ many }) => ({
  societies: many(societies),
  users: many(users),
}))

export const societiesRelations = relations(societies, ({ one, many }) => ({
  superAdmin: one(superAdmins, {
    fields: [societies.superAdminId],
    references: [superAdmins.id],
  }),
  flats: many(flats),
  roles: many(societyRoles),
  maintenanceMasters: many(maintenanceMaster),
}))

export const flatsRelations = relations(flats, ({ one, many }) => ({
  society: one(societies, {
    fields: [flats.societyId],
    references: [societies.id],
  }),
  members: many(flatMembers),
  paymentTracks: many(flatPaymentTrack),
  payments: many(payments),
}))

export const flatMembersRelations = relations(flatMembers, ({ one }) => ({
  flat: one(flats, {
    fields: [flatMembers.flatId],
    references: [flats.id],
  }),
  user: one(users, {
    fields: [flatMembers.userId],
    references: [users.id],
  }),
}))

export const usersRelations = relations(users, ({ many, one }) => ({
  flats: many(flatMembers),
  roles: many(societyRoles),
  superAdmin: one(superAdmins, {
    fields: [users.superAdminId],
    references: [superAdmins.id],
  }),
}))

export const societyRolesRelations = relations(societyRoles, ({ one }) => ({
  society: one(societies, {
    fields: [societyRoles.societyId],
    references: [societies.id],
  }),
  user: one(users, {
    fields: [societyRoles.userId],
    references: [users.id],
  }),
}))

export const maintenanceMasterRelations = relations(
  maintenanceMaster,
  ({ one, many }) => ({
    society: one(societies, {
      fields: [maintenanceMaster.societyId],
      references: [societies.id],
    }),
    tracks: many(flatPaymentTrack),
    payments: many(payments),
  })
)

export const flatPaymentTrackRelations = relations(
  flatPaymentTrack,
  ({ one }) => ({
    master: one(maintenanceMaster, {
      fields: [flatPaymentTrack.maintenanceMasterId],
      references: [maintenanceMaster.id],
    }),
    flat: one(flats, {
      fields: [flatPaymentTrack.flatId],
      references: [flats.id],
    }),
  })
)

export const paymentsRelations = relations(payments, ({ one }) => ({
  master: one(maintenanceMaster, {
    fields: [payments.maintenanceMasterId],
    references: [maintenanceMaster.id],
  }),
  flat: one(flats, {
    fields: [payments.flatId],
    references: [flats.id],
  }),
  paidByUser: one(users, {
    fields: [payments.paidByUserId],
    references: [users.id],
  }),
}))
