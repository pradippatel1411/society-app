const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'dashboard',
  'help',
  'login',
  'logout',
  'mail',
  'manage',
  'owner',
  'payment',
  'profile',
  'public',
  'settings',
  'signup',
  'super',
  'support',
  'terms',
  'privacy',
  'www',
])

/**
 * Converts a name to a URL-friendly slug.
 *   "Acme Society Services" → "acme-society-services"
 *   "Green Park Co-op"      → "green-park-co-op"
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-word chars
    .replace(/\s+/g, '-') // spaces → hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-|-$/g, '') // trim hyphens from ends
    .slice(0, 50)
}

/**
 * Validates a slug is well-formed and not reserved.
 * Returns null if valid, else returns an error message.
 */
export function validateSlug(slug: string): string | null {
  if (!slug || slug.length < 2) {
    return 'Slug must be at least 2 characters'
  }
  if (slug.length > 50) {
    return 'Slug must be 50 characters or fewer'
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'Slug must contain only lowercase letters, digits, and hyphens'
  }
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return 'Slug cannot start or end with a hyphen'
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is a reserved word and cannot be used`
  }
  return null
}