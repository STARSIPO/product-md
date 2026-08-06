import { NextResponse, type NextRequest } from 'next/server'
import { storage } from '@/server/storage'
import { verifyFileSignature } from '@/server/storage/local'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'

/**
 * Serves PRIVATE objects — verification documents, offer attachments, message files.
 *
 * Two independent gates, and a request must pass at least one:
 *   1. a valid short-lived signature (the link the app just generated), or
 *   2. an authenticated session that actually owns the object, re-checked here
 *
 * The second gate exists because a signed URL can be forwarded. Ownership is resolved
 * from the database on every request; nothing is inferred from the path itself.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { key: string[] } },
) {
  const key = params.key.join('/')
  if (!key || key.includes('..')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const exp = request.nextUrl.searchParams.get('exp')
  const sig = request.nextUrl.searchParams.get('sig')

  const signatureValid = exp !== null && sig !== null && verifyFileSignature(key, exp, sig)
  const authorized = signatureValid || (await isOwnerOfKey(key))

  if (!authorized) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = await storage.get(key, 'private')
  if (!body) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': guessContentType(key),
      // Private material must never land in a shared cache.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${sanitizeFilename(key)}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** Resolves whether the signed-in user's company owns the object behind this key. */
async function isOwnerOfKey(key: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  // Staff review documents as part of moderation.
  if (user.role === 'ADMIN' || user.role === 'MODERATOR') return true
  if (!user.companyId) return false

  const [document, attachment, messageFile] = await Promise.all([
    db.document.findFirst({
      where: { fileKey: key, companyId: user.companyId },
      select: { id: true },
    }),
    db.requestAttachment.findFirst({
      where: { key, request: { companyId: user.companyId } },
      select: { id: true },
    }),
    db.messageAttachment.findFirst({
      where: { key, message: { conversation: { participants: { some: { userId: user.id } } } } },
      select: { id: true },
    }),
  ])

  return document !== null || attachment !== null || messageFile !== null
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function guessContentType(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

function sanitizeFilename(key: string): string {
  return (key.split('/').pop() ?? 'file').replace(/[^\w.-]/g, '_')
}
