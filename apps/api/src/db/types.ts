// ============================================================
// Centralized type definitions for all enum-like fields
// Database stores varchar; TypeScript enforces valid values
// ============================================================

export const USER_TYPES = ['product_owner', 'super_admin', 'society_user'] as const
export type UserType = (typeof USER_TYPES)[number]

export const SUPER_ADMIN_STATUS = [
  'active',
  'suspended',
  'expired',
  'pending',
] as const
export type SuperAdminStatus = (typeof SUPER_ADMIN_STATUS)[number]

export const SOCIETY_STATUS = [
  'active',
  'suspended',
  'expired',
  'pending',
] as const
export type SocietyStatus = (typeof SOCIETY_STATUS)[number]

// Hybrid removed — only owner or tenant
export const RESIDENCY_TYPES = ['owner', 'tenant'] as const
export type ResidencyType = (typeof RESIDENCY_TYPES)[number]

export const FLAT_MEMBER_RELATIONS = ['owner', 'tenant', 'family'] as const
export type FlatMemberRelation = (typeof FLAT_MEMBER_RELATIONS)[number]

export const SOCIETY_ROLES = [
  'chairman',
  'secretary',
  'cashier',
  'committee',
  'member',
] as const
export type SocietyRole = (typeof SOCIETY_ROLES)[number]

// Helper subsets for permission checks
export const COMMITTEE_ROLES = [
  'chairman',
  'secretary',
  'cashier',
  'committee',
] as const
export type CommitteeRole = (typeof COMMITTEE_ROLES)[number]

// Maintenance frequencies a chairman can enable for an FY
export const MAINTENANCE_FREQUENCIES = [
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
] as const
export type MaintenanceFrequency = (typeof MAINTENANCE_FREQUENCIES)[number]

// Cycles per year for each frequency — used to compute total FY amount
export const FREQUENCY_CYCLES: Record<MaintenanceFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
}

// Master FY status
export const MAINTENANCE_MASTER_STATUS = ['active', 'closed'] as const
export type MaintenanceMasterStatus = (typeof MAINTENANCE_MASTER_STATUS)[number]

// Payment track per flat per FY
export const PAYMENT_TRACK_STATUS = ['unpaid', 'paid'] as const
export type PaymentTrackStatus = (typeof PAYMENT_TRACK_STATUS)[number]

// How a payment was made
export const PAYMENT_MODES = ['upi', 'cash', 'cheque', 'manual'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

// Payment lifecycle status (kept for future Razorpay flow: pending → success/failed)
export const PAYMENT_STATUS = ['pending', 'success', 'failed'] as const
export type PaymentStatus = (typeof PAYMENT_STATUS)[number]

export const PAYMENT_GATEWAYS = ['razorpay'] as const
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number]
