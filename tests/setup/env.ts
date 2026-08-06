/**
 * Test environment.
 *
 * Set before any module imports `src/env.ts`, which validates configuration at load
 * time and would otherwise refuse to start. Everything points at throwaway local
 * resources: a dedicated SQLite file, the console mailer, the mock SMS and payment
 * adapters. No test can reach an external service.
 */
// NODE_ENV is typed read-only by @types/node; the cast is the sanctioned way to set it.
;(process.env as Record<string, string>).NODE_ENV ??= 'test'
process.env.DATABASE_PROVIDER = 'sqlite'
process.env.DATABASE_URL = 'file:./test.db'
process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'test-secret-must-be-at-least-32-characters-long'
process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret-value'
process.env.CRON_SECRET = 'test-cron-secret-value'
process.env.STORAGE_DRIVER = 'local'
process.env.MAIL_DRIVER = 'console'
process.env.SMS_DRIVER = 'mock'
process.env.PAYMENT_DRIVER = 'mock'
process.env.LOG_LEVEL = 'error'
