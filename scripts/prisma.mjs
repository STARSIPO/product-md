#!/usr/bin/env node
/**
 * Provider-aware Prisma wrapper.
 *
 * Prisma will not accept env() for `datasource.provider`, but Product.md has to run
 * on PostgreSQL in production and on SQLite for zero-setup local development. So
 * prisma/schema.prisma stays canonical (PostgreSQL) and, when DATABASE_PROVIDER is
 * "sqlite", this script derives prisma/schema.sqlite.prisma by swapping *only* the
 * datasource block, then forwards to the real Prisma CLI with --schema.
 *
 * Usage:  node scripts/prisma.mjs <prisma args...>
 * Example: node scripts/prisma.mjs db push
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const canonical = join(root, 'prisma', 'schema.prisma')
const derived = join(root, 'prisma', 'schema.sqlite.prisma')

// Minimal .env reader — we only need DATABASE_PROVIDER before Prisma boots.
function readEnvFile() {
  const file = join(root, '.env')
  if (!existsSync(file)) return {}
  /** @type {Record<string,string>} */
  const out = {}
  // Strip a UTF-8 BOM: Notepad and other Windows editors add one by default, and it
  // would otherwise become part of the first key, silently hiding DATABASE_PROVIDER.
  const contents = readFileSync(file, 'utf8').replace(/^﻿/, '')
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const fileEnv = readEnvFile()
const provider = (process.env.DATABASE_PROVIDER ?? fileEnv.DATABASE_PROVIDER ?? 'sqlite').trim()

if (provider !== 'sqlite' && provider !== 'postgresql') {
  console.error(
    `[prisma] DATABASE_PROVIDER must be "sqlite" or "postgresql", received "${provider}".`,
  )
  process.exit(1)
}

let schemaPath = canonical

if (provider === 'sqlite') {
  const source = readFileSync(canonical, 'utf8')
  const datasourceBlock = /datasource\s+db\s*\{[^}]*\}/m

  if (!datasourceBlock.test(source)) {
    console.error('[prisma] Could not locate the datasource block in prisma/schema.prisma.')
    process.exit(1)
  }

  const swapped = source.replace(
    datasourceBlock,
    'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}',
  )

  const banner =
    '// GENERATED FILE — DO NOT EDIT.\n' +
    '// Derived from prisma/schema.prisma by scripts/prisma.mjs for DATABASE_PROVIDER="sqlite".\n' +
    '// Edit prisma/schema.prisma instead; this file is rewritten on every db command.\n\n'

  // Only rewrite when the content actually changed, so file watchers stay quiet.
  const next = banner + swapped
  if (!existsSync(derived) || readFileSync(derived, 'utf8') !== next) {
    writeFileSync(derived, next, 'utf8')
  }
  schemaPath = derived
}

const args = process.argv.slice(2)
const hasSchemaFlag = args.includes('--schema')
const finalArgs = hasSchemaFlag ? args : [...args, '--schema', schemaPath]

const result = spawnSync('npx', ['prisma', ...finalArgs], {
  stdio: 'inherit',
  cwd: root,
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_PROVIDER: provider },
})

process.exit(result.status ?? 1)
