import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/server/auth/session'
import { clientIp, consume } from '@/server/auth/rate-limit'
import { assertUploadAllowed, buildStorageKey, sniffMimeType, storage } from '@/server/storage'
import { MAX_IMAGE_BYTES } from '@/lib/constants'
import { reportError } from '@/server/observability'

/**
 * Product photo upload.
 *
 * The wizard uploads each file as it is picked so the seller sees progress and a
 * thumbnail immediately, and the listing itself only ever carries storage keys.
 *
 * Three things the browser says are ignored on purpose:
 *   - the company: taken from the session, so a listing cannot be filed under someone
 *     else's prefix
 *   - the Content-Type: cross-checked against the magic bytes, and a mismatch is a
 *     rejection — this is the path from "photo upload" to serving an executable
 *   - the filename: never stored. `buildStorageKey` mints `product/<companyId>/<random>`
 *     with an extension derived from the sniffed format, so "../../.env" and "x.php"
 *     have nowhere to go
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

function errorResponse(
  error: string,
  status: number,
  params?: Record<string, string | number>,
): NextResponse {
  return NextResponse.json({ error, params }, { status })
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return errorResponse('unauthorized', 401)
  if (!user.companyId) return errorResponse('companyRequired', 403)
  if (!user.isSeller || user.companyStatus === 'BLOCKED') return errorResponse('forbidden', 403)

  // Uploads are expensive and easy to abuse; budget per user and per address.
  const perUser = await consume({
    key: `upload:product-photo:${user.id}`,
    limit: 40,
    windowSeconds: 60,
  })
  const perIp = perUser.ok
    ? await consume({ key: `upload:product-photo:ip:${clientIp()}`, limit: 80, windowSeconds: 60 })
    : perUser

  if (!perIp.ok) {
    return NextResponse.json(
      { error: 'rateLimited', params: { seconds: perIp.retryAfterSeconds } },
      { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds) } },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse('validation', 400)
  }

  const entry = formData.get('file')
  if (entry === null || typeof entry === 'string') {
    return errorResponse('validation', 400)
  }

  // Gate one: what the browser claims. Cheap, and rejects the obvious cases early.
  try {
    assertUploadAllowed(entry.type, entry.size, 'image')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('fileTooLarge')) {
      return errorResponse('fileTooLarge', 413, {
        size: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)),
      })
    }
    return errorResponse('fileTypeNotAllowed', 415)
  }

  const buffer = Buffer.from(await entry.arrayBuffer())

  // A stream can lie about its length; re-check the bytes we actually received.
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return errorResponse('fileTooLarge', 413, {
      size: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)),
    })
  }

  // Gate two: what the bytes actually are. Must be an image, and must be the image the
  // request declared — a PNG announced as a JPEG is a rejection, not a correction.
  const sniffed = sniffMimeType(buffer)
  const extension = sniffed === null ? undefined : EXTENSION_BY_MIME[sniffed]
  if (sniffed === null || extension === undefined || sniffed !== entry.type) {
    return errorResponse('fileTypeNotAllowed', 415)
  }

  try {
    const key = buildStorageKey('product', user.companyId, `photo${extension}`)
    await storage.put({ key, body: buffer, contentType: sniffed, visibility: 'public' })

    return NextResponse.json(
      { key, url: storage.publicUrl(key) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    reportError(error, { scope: 'upload-product-photo', companyId: user.companyId })
    return errorResponse('generic', 500)
  }
}
