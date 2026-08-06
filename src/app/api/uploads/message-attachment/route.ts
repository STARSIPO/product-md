import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/server/auth/session'
import { clientIp, consume } from '@/server/auth/rate-limit'
import { assertUploadAllowed, buildStorageKey, sniffMimeType, storage } from '@/server/storage'
import { MAX_DOCUMENT_BYTES } from '@/lib/constants'
import { reportError } from '@/server/observability'

/**
 * Chat attachment upload — JPG, PNG or PDF, 10 MB ceiling.
 *
 * Everything lands in PRIVATE storage and is read back only through
 * /api/files/<key>, which re-checks on every request that the reader is a participant
 * of the conversation the file hangs off. A price list sent to one buyer must not
 * become a public URL because somebody guessed the path.
 *
 * The same two gates as every other upload: the declared Content-Type is checked
 * cheaply, then the magic bytes are read and must agree. The browser's filename is
 * used only for its extension and to show a human label; the stored key is
 * `message/<userId>/<random>.<ext>`, which is also the prefix `sendMessageAction`
 * requires before it will attach the object to a message.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
}

const MAX_MB = Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))

function errorResponse(
  error: string,
  status: number,
  params?: Record<string, string | number>,
): NextResponse {
  return NextResponse.json({ error, params }, { status })
}

/** Keeps the label human without letting a 4 KB unicode filename through. */
function safeDisplayName(fileName: string, fallbackExtension: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[^\p{L}\p{N}._ -]/gu, '').trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return `file${fallbackExtension}`
  return cleaned.slice(0, 120)
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return errorResponse('unauthorized', 401)
  if (!user.companyId) return errorResponse('companyRequired', 403)
  if (user.companyStatus === 'BLOCKED') return errorResponse('forbidden', 403)

  const perUser = await consume({
    key: `upload:message-attachment:${user.id}`,
    limit: 20,
    windowSeconds: 60,
  })
  const perIp = perUser.ok
    ? await consume({
        key: `upload:message-attachment:ip:${clientIp()}`,
        limit: 60,
        windowSeconds: 60,
      })
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

  // Gate one: what the browser claims.
  try {
    assertUploadAllowed(entry.type, entry.size, 'document')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('fileTooLarge')) {
      return errorResponse('fileTooLarge', 413, { size: MAX_MB })
    }
    return errorResponse('fileTypeNotAllowed', 415)
  }

  const buffer = Buffer.from(await entry.arrayBuffer())

  // A stream can lie about its length; re-check what actually arrived.
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    return errorResponse('fileTooLarge', 413, { size: MAX_MB })
  }

  // Gate two: what the bytes actually are, and whether they match the declaration.
  const sniffed = sniffMimeType(buffer)
  const extension = sniffed === null ? undefined : EXTENSION_BY_MIME[sniffed]
  if (sniffed === null || extension === undefined || sniffed !== entry.type) {
    return errorResponse('fileTypeNotAllowed', 415)
  }

  try {
    const key = buildStorageKey('message', user.id, `attachment${extension}`)
    await storage.put({ key, body: buffer, contentType: sniffed, visibility: 'private' })

    return NextResponse.json(
      {
        key,
        fileName: safeDisplayName(entry.name, extension),
        mimeType: sniffed,
        sizeByte: buffer.byteLength,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    reportError(error, { scope: 'upload-message-attachment', userId: user.id })
    return errorResponse('generic', 500)
  }
}
