import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const testDb = join(root, 'prisma', 'test.db')

/**
 * Builds a fresh schema in prisma/test.db before the suite and removes it afterwards.
 *
 * A real database rather than mocks: the things most worth testing here — the sealed
 * offer boundary, ledger idempotency, unique constraints — are enforced BY the
 * database. Mocking Prisma would test the mock's opinion of those rules, not the rules.
 */
export async function setup() {
  if (existsSync(testDb)) rmSync(testDb, { force: true })

  execFileSync('node', ['scripts/prisma.mjs', 'db', 'push', '--skip-generate'], {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_PROVIDER: 'sqlite',
      DATABASE_URL: 'file:./test.db',
    },
  })
}

export async function teardown() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${testDb}${suffix}`
    if (existsSync(file)) rmSync(file, { force: true })
  }
}
