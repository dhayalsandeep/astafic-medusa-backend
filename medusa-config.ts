import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const isProduction = process.env.NODE_ENV === "production"

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production, set STORE_CORS / ADMIN_CORS / AUTH_CORS as Railway env vars
// (comma-separated list of allowed origins).
// In development, sensible localhost fallbacks are used automatically.

const DEV_STORE_CORS = [
  "http://localhost:3000",
  "http://localhost:8000",
  "http://localhost:8081",
  "http://10.0.2.2:8081",
  "http://10.0.2.2:9000",
  "http://10.0.2.2:3000",
  "exp://localhost:8081",
  "exp://10.0.2.2:8081",
].join(",")

const DEV_ADMIN_CORS =
  "http://localhost:7001,http://localhost:9000,http://10.0.2.2:9000"

const DEV_AUTH_CORS = [
  "http://localhost:3000",
  "http://localhost:7001",
  "http://localhost:8081",
  "http://localhost:9000",
  "http://10.0.2.2:8081",
  "http://10.0.2.2:9000",
  "exp://localhost:8081",
  "exp://10.0.2.2:8081",
].join(",")

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      connection: {
        ssl: isProduction ? { rejectUnauthorized: false } : false,
      },
    },
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS || DEV_STORE_CORS,
      adminCors: process.env.ADMIN_CORS || DEV_ADMIN_CORS,
      authCors: process.env.AUTH_CORS || DEV_AUTH_CORS,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  },
  modules: [
    {
      resolve: "@medusajs/medusa/cache-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
  ],
})

