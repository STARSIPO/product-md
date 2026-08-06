import 'server-only'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { signPayload, verifySignature } from '@/server/crypto'
import type { PutObjectInput, StorageAdapter } from '@/server/storage/types'

/**
 * Filesystem-backed storage for local development and single-server deployments.
 *
 * This is not a stand-in for S3 — bytes really land on disk and really come back. The
 * only thing it cannot do is survive a serverless/multi-instance deployment, which is
 * exactly when STORAGE_DRIVER should be flipped to "s3".
 *
 * Private objects live in a sibling directory that no static route serves; they are
 * only reachable through /api/files with a signature this module issues.
 */

const STORAGE_ROOT = resolve(process.cwd(), '.storage')

/** Purpose label for the HMAC. Keeps file URLs from being replayable as session tokens. */
const URL_PURPOSE = 'file-url'

/**
 * A key is a path fragment that is joined onto a root directory, so it is the one
 * place where a crafted upload could escape into the filesystem. Rejected outright
 * rather than sanitised: every key this application stores is minted by
 * `buildStorageKey`, so anything unusual is an attack, not a typo.
 */
export function isSafeStorageKey(key: string): boolean {
  if (key.length === 0 || key.length > 512) return false
  if (key.includes('..')) return false
  if (key.startsWith('/')) return false
  if (key.includes('\\')) return false
  if (key.includes('\0')) return false
  return true
}

function assertSafeKey(key: string): void {
  if (!isSafeStorageKey(key)) {
    throw new Error(`storageKeyRejected: ${JSON.stringify(key)}`)
  }
}

function absolutePath(key: string, visibility: 'public' | 'private'): string {
  assertSafeKey(key)

  const root = resolve(STORAGE_ROOT, visibility)
  const full = resolve(root, key)

  // Belt and braces: even if the character rules above ever miss a case, a resolved
  // path outside the visibility root is never touched.
  if (!full.startsWith(root + sep)) {
    throw new Error(`storageKeyRejected: ${JSON.stringify(key)}`)
  }

  return full
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local'

  /**
   * `contentType` is not persisted: the filesystem has nowhere to put it, and every
   * key carries an allow-listed extension (see buildStorageKey), so the serving route
   * derives the header from the key instead of trusting a stored value.
   */
  async put(input: PutObjectInput): Promise<{ key: string }> {
    const full = absolutePath(input.key, input.visibility)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, input.body)
    return { key: input.key }
  }

  async get(key: string, visibility: 'public' | 'private'): Promise<Buffer | null> {
    try {
      return await readFile(absolutePath(key, visibility))
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
  }

  async delete(key: string, visibility: 'public' | 'private'): Promise<void> {
    try {
      await unlink(absolutePath(key, visibility))
    } catch (error) {
      // Deleting an object that is already gone is the desired end state, not a failure.
      if (!isMissingFile(error)) throw error
    }
  }

  publicUrl(key: string): string {
    assertSafeKey(key)
    return `/uploads/${key}`
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    assertSafeKey(key)
    const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresInSeconds))
    const sig = signPayload(`${key}:${exp}`, URL_PURPOSE)
    return `/api/files/${key}?exp=${exp}&sig=${encodeURIComponent(sig)}`
  }
}

/**
 * Validates a link produced by `signedUrl`.
 *
 * Both halves matter: the signature proves the URL was issued by us, and the deadline
 * makes a leaked link (browser history, forwarded email, referrer header) stop working.
 * Accepts the raw string form of `exp` because callers read it straight off the query
 * string; a non-numeric value simply fails.
 */
export function verifyFileSignature(key: string, exp: string | number, sig: string): boolean {
  if (!isSafeStorageKey(key) || sig.length === 0) return false

  const expiresAt = typeof exp === 'number' ? exp : Number(exp)
  if (!Number.isInteger(expiresAt)) return false
  if (expiresAt * 1000 <= Date.now()) return false

  return verifySignature(`${key}:${expiresAt}`, sig, URL_PURPOSE)
}
