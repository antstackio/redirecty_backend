import { betterAuth } from 'better-auth'
import { Pool } from '@neondatabase/serverless'

interface AuthEnv {
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

const trustedOrigins = [
  "http://localhost:5173",
  "https://antt.me",
  "https://www.antt.me",
  "https://dash.antt.me",
]

// Cache pool per connection string to avoid creating a new one on every request
let cachedPool: Pool | null = null
let cachedConnectionString: string | null = null

function getPool(connectionString: string): Pool {
  if (cachedPool && cachedConnectionString === connectionString) {
    return cachedPool
  }
  cachedPool = new Pool({ connectionString })
  cachedConnectionString = connectionString
  return cachedPool
}

// Runtime factory for Cloudflare Workers (env is per-request)
export function createAuth(env: AuthEnv, requestUrl?: string) {
  return betterAuth({
    database: getPool(env.DATABASE_URL),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: requestUrl ? new URL(requestUrl).origin : undefined,
    basePath: "/api/auth",
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account" as const,
      },
    },
    trustedOrigins,
  })
}

