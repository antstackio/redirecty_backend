import { betterAuth } from 'better-auth'
import { Pool } from '@neondatabase/serverless'

interface AuthEnv {
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

const authConfig = (env: Partial<AuthEnv> = {}, requestUrl?: string) => ({
  database: new Pool({ connectionString: env.DATABASE_URL || process.env.DATABASE_URL || "" }),
  secret: env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET || "dev-secret",
  baseURL: requestUrl ? new URL(requestUrl).origin : undefined,
  basePath: "/api/auth",
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "placeholder",
      prompt: "select_account" as const,
    },
  },
  trustedOrigins: [
    "http://localhost:5173",
    "https://antt.me",
    "https://www.antt.me",
    "https://dash.antt.me",
  ],
})

// Runtime factory for Cloudflare Workers (env is per-request)
export function createAuth(env: AuthEnv, requestUrl?: string) {
  return betterAuth(authConfig(env, requestUrl))
}

// Default export for Better Auth CLI (`npx @better-auth/cli migrate`)
export const auth = betterAuth(authConfig())
