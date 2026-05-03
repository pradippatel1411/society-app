import type { Config } from 'drizzle-kit'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read DATABASE_URL from .dev.vars manually for drizzle-kit CLI
const devVars = readFileSync(resolve(__dirname, '.dev.vars'), 'utf-8')
const databaseUrl = devVars
  .split('\n')
  .find((line) => line.startsWith('DATABASE_URL='))
  ?.replace('DATABASE_URL=', '')
  .replace(/^"|"$/g, '')
  .trim()

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in .dev.vars')
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config