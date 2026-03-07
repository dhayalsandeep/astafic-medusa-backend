"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
(0, utils_1.loadEnv)(process.env.NODE_ENV || 'development', process.cwd());
const isProduction = process.env.NODE_ENV === "production";
// Production URLs (Change these to your actual deployed URLs)
const PROD_STORE_URL = "https://astafic-web.vercel.app";
const PROD_ADMIN_URL = "https://astafic-admin.vercel.app";
module.exports = (0, utils_1.defineConfig)({
    projectConfig: {
        databaseUrl: process.env.DATABASE_URL,
        databaseDriverOptions: {
            connection: {
                ssl: isProduction ? { rejectUnauthorized: false } : false,
            },
        },
        http: {
            storeCors: isProduction ? `${PROD_STORE_URL},${process.env.STORE_CORS || ""}` : (process.env.STORE_CORS || "http://localhost:3000,http://localhost:8000"),
            adminCors: isProduction ? `${PROD_ADMIN_URL},${process.env.ADMIN_CORS || ""}` : (process.env.ADMIN_CORS || "http://localhost:7001,http://localhost:9000"),
            authCors: isProduction ? `${PROD_STORE_URL},${PROD_ADMIN_URL},${process.env.AUTH_CORS || ""}` : (process.env.AUTH_CORS || "http://localhost:3000,http://localhost:7001,http://localhost:9000"),
            jwtSecret: process.env.JWT_SECRET || "supersecret",
            cookieSecret: process.env.COOKIE_SECRET || "supersecret",
        },
        redisUrl: process.env.REDIS_URL,
    },
    admin: {
        backendUrl: process.env.MEDUSA_BACKEND_URL || (isProduction ? "https://astafic-backend.onrender.com" : "http://localhost:9000"),
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
});
//# sourceMappingURL=medusa-config.js.map