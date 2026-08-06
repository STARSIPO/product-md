import 'server-only'
import { extname } from 'node:path'
import { env } from '@/env'
import {
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
} from '@/lib/constants'
import { generateToken } from '@/server/crypto'
import { LocalStorageAdapter } from '@/server/storage/local'
import { S3StorageAdapter } from '@/server/storage/s3'
import type { StorageAdapter } from '@/server/storage/types'

export type { PutObjectInput, StorageAdapter } from '@/server/storage/types'
export { verifyFileSignature } from '@/server/storage/local'

export const storage: StorageAdapter =
  env.STORAGE_DRIVER === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter()

// --- keys --------------------------------------------------------------------

export type StorageScope = 'product' | 'company' | 'document' | 'message' | 'request'

const ALLOWED_EXTENSIONS: readonly string[] = ['.jpg', '.jpeg', '.png', '.webp', '.pdf']

/** cuid/uuid shaped. Anything else would let an id smuggle a path separator into the key. */
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Mints the object key. The uploader's filename is used for exactly one thing — reading
 * its extension — and never becomes part of the stored name: "../../.env", "photo.php"
 * and a 4 KB unicode filename all reduce to `${scope}/${ownerId}/${random}.jpg`.
 *
 * The random component also means keys are unguessable, so a public object cannot be
 * enumerated even though its URL needs no signature.
 */
export function buildStorageKey(scope: StorageScope, ownerId: string, fileName: string): string {
  if (!OWNER_ID_PATTERN.test(ownerId)) {
    throw new Error(`storageOwnerInvalid: ${JSON.stringify(ownerId)}`)
  }

  const ext = extname(fileName).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`fileTypeNotAllowed: ${ext || fileName}`)
  }

  return `${scope}/${ownerId}/${generateToken(16)}${ext}`
}

// --- validation --------------------------------------------------------------

/**
 * First of the two upload gates. This one judges what the browser *claims*; the caller
 * must also run `sniffMimeType` over the bytes and compare — a declared Content-Type is
 * attacker-controlled and worth nothing on its own.
 */
export function assertUploadAllowed(
  mimeType: string,
  sizeBytes: number,
  kind: 'image' | 'document',
): void {
  const allowed: readonly string[] = kind === 'image' ? IMAGE_MIME_TYPES : DOCUMENT_MIME_TYPES
  const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES

  if (!allowed.includes(mimeType)) {
    throw new Error(`fileTypeNotAllowed: ${mimeType}`)
  }

  // A non-finite size is treated as over the limit: unknown length is never "fine".
  if (!Number.isFinite(sizeBytes) || sizeBytes > maxBytes) {
    throw new Error(`fileTooLarge: ${sizeBytes} > ${maxBytes}`)
  }
}

function startsWith(buffer: Buffer, signature: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false
  return signature.every((byte, index) => buffer[offset + index] === byte)
}

/**
 * Reads the format out of the bytes themselves.
 *
 * Cross-checking this against the declared Content-Type is what stops a PHP script or a
 * Windows executable from being stored as "image/png" and later served back — the
 * classic path from "photo upload" to remote code execution. Returns null when the
 * content is not one of the four formats the platform accepts, which callers must treat
 * as a rejection rather than "unknown but probably fine".
 */
export function sniffMimeType(buffer: Buffer): string | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  // RIFF....WEBP — the four bytes between the two markers are the chunk size.
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp'
  }
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'
  return null
}
