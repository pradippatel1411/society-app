import { pgTable, serial, text, timestamp, varchar, integer } from 'drizzle-orm/pg-core'

// Table 1: super_admins
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
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Table 2: users (the human — login key)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  mobile: varchar('mobile', { length: 15 }).notNull().unique(),
  name: varchar('name', { length: 200 }),
  email: varchar('email', { length: 200 }),
  userType: varchar('user_type', { length: 20 }).notNull(),
  superAdminId: integer('super_admin_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})