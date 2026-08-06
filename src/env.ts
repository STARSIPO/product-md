import 'server-only'
import { z } from 'zod'

/**
 * Single validated entry point for configuration.
 *
 * Nothing anywhere else in the codebase reads process.env directly: a typo in a
 * variable name should fail at boot with a readable message, not silently become
 * `undefined` inside a security check three weeks later.
 */

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .or(z.boolean())

const intFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().int().nonnegative())

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_PROVIDER: z.enum(['postgresql', 'sqlite']).default('sqlite'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    APP_URL: z.string().url().default('http://localhost:3000'),
    DEFAULT_LOCALE: z.enum(['ru', 'ro']).default('ru'),
    APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
    SESSION_TTL_DAYS: intFromString(30),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET_PUBLIC: z.string().optional(),
    S3_BUCKET_PRIVATE: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),
    S3_PUBLIC_BASE_URL: z.string().optional(),

    MAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
    MAIL_FROM: z.string().default('Product.md <no-reply@product.md>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: intFromString(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    SMS_DRIVER: z.enum(['mock', 'http']).default('mock'),
    SMS_API_KEY: z.string().optional(),
    SMS_SENDER: z.string().default('ProductMD'),

    PAYMENT_DRIVER: z.enum(['mock', 'maib', 'victoriabank', 'paynet', 'mia']).default('mock'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(16),

    LISTING_DAILY_PRICE_BANI: intFromString(100),
    SELLER_TRIAL_DAYS: intFromString(30),
    LOW_BALANCE_THRESHOLD_BANI: intFromString(1000),
    CRON_SECRET: z.string().min(16),

    SENTRY_DSN: z.string().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_DRIVER === 's3') {
      for (const key of [
        'S3_BUCKET_PUBLIC',
        'S3_BUCKET_PRIVATE',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER="s3"`,
          })
        }
      }
    }

    if (value.MAIL_DRIVER === 'smtp' && !value.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when MAIL_DRIVER="smtp"',
      })
    }

    // A production deployment must never inherit the sample secrets.
    if (value.NODE_ENV === 'production') {
      if (value.APP_SECRET.includes('dev-only')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_SECRET'],
          message: 'Refusing to start production with the example APP_SECRET.',
        })
      }
      if (value.CRON_SECRET.includes('dev-only')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CRON_SECRET'],
          message: 'Refusing to start production with the example CRON_SECRET.',
        })
      }
    }
  })

function load() {
  const parsed = schema.safeParse(process.env)

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the missing values.`,
    )
  }

  return parsed.data
}

export const env = load()

export type Env = typeof env
export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'
