# syntax=docker/dockerfile:1

# Multi-stage build for Product.md.
#
# Debian slim rather than Alpine: Prisma's query engine needs OpenSSL and glibc, and
# the musl variants are a recurring source of "engine not found" failures. The runtime
# stage carries only the standalone output, so the image stays small anyway.

# ---------------------------------------------------------------- dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --------------------------------------------------------------------- builder
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build needs a syntactically valid DATABASE_URL for `prisma generate`, but never
# connects to it. Real values are injected at runtime.
ENV DATABASE_PROVIDER=postgresql
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV APP_SECRET=build-time-placeholder-secret-value-32chars
ENV PAYMENT_WEBHOOK_SECRET=build-time-placeholder-webhook
ENV CRON_SECRET=build-time-placeholder-cron-secret
ENV NEXT_TELEMETRY_DISABLED=1

RUN node scripts/prisma.mjs generate && npm run build

# --------------------------------------------------------------------- runtime
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run the app as root.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma CLI + schema + seed, so `migrate deploy` can run from this image.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

# Local-storage driver writes here; mount a volume or switch to STORAGE_DRIVER=s3.
RUN mkdir -p /app/.storage /app/.mail && chown -R nextjs:nodejs /app/.storage /app/.mail

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
