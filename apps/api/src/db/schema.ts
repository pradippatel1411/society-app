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
  MaintenancePeriodType,
  MaintenancePeriodStatus,
  DueStatus,
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
      table.userId,
      table.role
    ),
  ]
)

// ============================================================
// Table 7: maintenance_configs
// Per society: how much, when, penalty rate
// ============================================================
export const maintenanceConfigs = pgTable('maintenance_configs', {
  id: serial('id').primaryKey(),
  societyId: integer('society_id')
    .notNull()
    .references(() => societies.id, { onDelete: 'cascade' })
    .unique(),
  periodType: varchar('period_type', { length: 20 })
    .$type<MaintenancePeriodType>()
    .default('yearly')
    .notNull(),
  ownerAmount: integer('owner_amount').notNull(),
  tenantAmount: integer('tenant_amount').notNull(),
  penaltyPerDay: integer('penalty_per_day').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================================
// Table 8: maintenance_periods
// e.g., "Apr 2026 to Mar 2027"
// ============================================================
export const maintenancePeriods = pgTable('maintenance_periods', {
  id: serial('id').primaryKey(),
  societyId: integer('society_id')
    .notNull()
    .references(() => societies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  status: varchar('status', { length: 20 })
    .$type<MaintenancePeriodStatus>()
    .default('active')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ============================================================
// Table 9: dues
// One row per flat per period
// ============================================================
export const dues = pgTable(
  'dues',
  {
    id: serial('id').primaryKey(),
    periodId: integer('period_id')
      .notNull()
      .references(() => maintenancePeriods.id, { onDelete: 'cascade' }),
    flatId: integer('flat_id')
      .notNull()
      .references(() => flats.id, { onDelete: 'cascade' }),
    baseAmount: integer('base_amount').notNull(),
    hybridOverrideAmount: integer('hybrid_override_amount'),
    paidAmount: integer('paid_amount').default(0).notNull(),
    penaltyAmount: integer('penalty_amount').default(0).notNull(),
    status: varchar('status', { length: 20 })
      .$type<DueStatus>()
      .default('unpaid')
      .notNull(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('flat_period_idx').on(table.periodId, table.flatId),
  ]
)

// ============================================================
// Table 10: payments
// Every payment attempt and result
// ============================================================
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  dueId: integer('due_id')
    .notNull()
    .references(() => dues.id, { onDelete: 'cascade' }),
  paidByUserId: integer('paid_by_user_id').references(() => users.id),
  amount: integer('amount').notNull(),
  mode: varchar('mode', { length: 20 }).$type<PaymentMode>().notNull(),
  gatewayTxnId: varchar('gateway_txn_id', { length: 200 }),
  gateway: varchar('gateway', { length: 50 }).$type<PaymentGateway>(),
  status: varchar('status', { length: 20 })
    .$type<PaymentStatus>()
    .default('pending')
    .notNull(),
  notes: text('notes'),
  receiptUrl: text('receipt_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ============================================================
// Table 11: otps
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
  config: one(maintenanceConfigs),
  periods: many(maintenancePeriods),
}))

export const flatsRelations = relations(flats, ({ one, many }) => ({
  society: one(societies, {
    fields: [flats.societyId],
    references: [societies.id],
  }),
  members: many(flatMembers),
  dues: many(dues),
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

export const maintenancePeriodsRelations = relations(
  maintenancePeriods,
  ({ one, many }) => ({
    society: one(societies, {
      fields: [maintenancePeriods.societyId],
      references: [societies.id],
    }),
    dues: many(dues),
  })
)

export const duesRelations = relations(dues, ({ one, many }) => ({
  period: one(maintenancePeriods, {
    fields: [dues.periodId],
    references: [maintenancePeriods.id],
  }),
  flat: one(flats, {
    fields: [dues.flatId],
    references: [flats.id],
  }),
  payments: many(payments),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  due: one(dues, {
    fields: [payments.dueId],
    references: [dues.id],
  }),
  paidByUser: one(users, {
    fields: [payments.paidByUserId],
    references: [users.id],
  }),
}))