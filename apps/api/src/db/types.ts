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

export const RESIDENCY_TYPES = ['owner', 'tenant', 'hybrid'] as const
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

export const MAINTENANCE_PERIOD_TYPES = ['yearly', 'half_yearly'] as const
export type MaintenancePeriodType = (typeof MAINTENANCE_PERIOD_TYPES)[number]

export const MAINTENANCE_PERIOD_STATUS = ['active', 'closed'] as const
export type MaintenancePeriodStatus = (typeof MAINTENANCE_PERIOD_STATUS)[number]

export const DUE_STATUS = ['unpaid', 'partial', 'paid'] as const
export type DueStatus = (typeof DUE_STATUS)[number]

export const PAYMENT_MODES = ['upi', 'cash', 'cheque', 'manual'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

export const PAYMENT_STATUS = ['pending', 'success', 'failed'] as const
export type PaymentStatus = (typeof PAYMENT_STATUS)[number]

export const PAYMENT_GATEWAYS = ['razorpay'] as const
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number]