import type { Metadata } from 'next'
import { AlertTriangle, FileText, Lock, ShieldCheck } from 'lucide-react'
import { getDictionary, resolveLocale, fmt } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateShort } from '@/lib/i18n/format'
import { VERIFICATION_TYPES } from '@/lib/constants'
import { requireCompany } from '@/server/auth/guards'
import { db } from '@/server/db'
import { Alert, Badge, Card, EmptyState, StatusBadge } from '@/components/ui'
import { DocumentActions, DocumentUploadForm } from './document-upload'

/**
 * Verification.
 *
 * The distinction this page exists to make: a *badge* is a public claim that something
 * was checked; a *document* is the private evidence behind it. Badges are listed for
 * everyone to see; documents are listed only here, are stored in private storage, and
 * are reachable only through /api/files, which re-checks ownership on every request.
 *
 * Consequently no storage key and no direct URL is ever rendered — the only link to a
 * file goes through that route.
 */

export const dynamic = 'force-dynamic'

/** A document expiring within this window gets a warning rather than a quiet lapse. */
const EXPIRY_WARNING_DAYS = 30

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.verification.title, robots: { index: false, follow: false } }
}

export default async function DashboardVerificationPage({
  params,
}: {
  params: { locale: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireCompany(locale, localePath(locale, 'dashboard', 'verification'))

  const [badges, documents] = await Promise.all([
    db.verificationBadge.findMany({
      where: { companyId: user.companyId },
      select: { type: true, status: true, note: true, grantedAt: true, expiresAt: true },
    }),
    db.document.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        number: true,
        status: true,
        moderatorComment: true,
        isPublic: true,
        fileKey: true,
        fileName: true,
        issuedAt: true,
        expiresAt: true,
        createdAt: true,
        history: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, toStatus: true, comment: true, createdAt: true },
        },
      },
    }),
  ])

  const badgeByType = new Map(badges.map((badge) => [badge.type, badge]))
  const badgeTypes = t.verification.types as Record<string, string | undefined>
  const badgeStatuses = t.verification.statuses as Record<string, string | undefined>
  const docTypes = t.verification.docTypes as Record<string, string | undefined>
  // Documents have one lifecycle state badges do not.
  const docStatuses: Record<string, string | undefined> = {
    ...badgeStatuses,
    CHANGES_REQUESTED: t.moderation.changesRequested,
  }
  const now = Date.now()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">{t.verification.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.verification.subtitle}</p>
      </div>

      {/* Stated up front, not buried under the upload button. */}
      <Alert
        variant="info"
        icon={<Lock aria-hidden="true" className="h-[18px] w-[18px]" />}
        title={t.verification.privacyNotice}
      >
        {t.verification.makePublicHint}
      </Alert>

      {/* ------------------------------------------------------------- badges */}
      <section aria-labelledby="verification-badges">
        <h2 id="verification-badges" className="mb-1 text-h3">
          {t.verification.badgesTitle}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{t.verification.badgesHint}</p>

        <Card>
          <ul className="divide-y divide-border">
            {VERIFICATION_TYPES.map((type) => {
              const badge = badgeByType.get(type)
              return (
                <li
                  key={type}
                  className="flex min-h-[56px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <ShieldCheck
                      aria-hidden
                      className={
                        badge?.status === 'APPROVED'
                          ? 'h-4 w-4 shrink-0 text-success'
                          : 'h-4 w-4 shrink-0 text-muted-foreground'
                      }
                    />
                    <span className="min-w-0 truncate">{badgeTypes[type] ?? type}</span>
                  </span>

                  {badge ? (
                    <StatusBadge
                      status={badge.status}
                      label={badgeStatuses[badge.status] ?? badge.status}
                      size="sm"
                    />
                  ) : (
                    <Badge variant="outline" size="sm">
                      {t.verification.notRequested}
                    </Badge>
                  )}

                  {badge?.note ? (
                    <p className="w-full text-caption text-muted-foreground">{badge.note}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      </section>

      {/* ------------------------------------------------------------- upload */}
      <section aria-labelledby="verification-upload">
        <h2 id="verification-upload" className="mb-3 text-h3">
          {t.verification.uploadDocument}
        </h2>
        <Card className="p-4 sm:p-5">
          <DocumentUploadForm />
        </Card>
      </section>

      {/* ---------------------------------------------------------- documents */}
      <section aria-labelledby="verification-documents">
        <h2 id="verification-documents" className="mb-3 text-h3">
          {t.verification.documents}
        </h2>

        {documents.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileText />}
              title={t.verification.empty}
              description={t.verification.emptyText}
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {documents.map((document) => {
              const expiresAt = document.expiresAt
              const expired = expiresAt !== null && expiresAt.getTime() < now
              const expiringSoon =
                !expired &&
                expiresAt !== null &&
                expiresAt.getTime() - now < EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000

              return (
                <li key={document.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">
                          {docTypes[document.type] ?? document.type}
                          {document.number ? (
                            <span className="ml-1.5 font-normal text-muted-foreground">
                              № {document.number}
                            </span>
                          ) : null}
                        </h3>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          {t.verification.uploadedAt}{' '}
                          {formatDateShort(document.createdAt, locale)}
                          {document.issuedAt ? (
                            <>
                              {' · '}
                              {t.verification.issuedAt}{' '}
                              {formatDateShort(document.issuedAt, locale)}
                            </>
                          ) : null}
                        </p>
                      </div>

                      <StatusBadge
                        status={document.status}
                        label={docStatuses[document.status] ?? document.status}
                        size="sm"
                      />
                    </div>

                    {expired || expiringSoon ? (
                      <p
                        className={
                          expired
                            ? 'mt-2 flex items-center gap-1.5 text-caption text-destructive'
                            : 'mt-2 flex items-center gap-1.5 text-caption text-warning'
                        }
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {expired
                          ? t.verification.expired
                          : fmt(t.verification.expiringSoon, {
                              date: expiresAt ? formatDateShort(expiresAt, locale) : '',
                            })}
                      </p>
                    ) : null}

                    {document.moderatorComment ? (
                      <div className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2">
                        <p className="text-caption font-medium text-muted-foreground">
                          {t.verification.moderatorComment}
                        </p>
                        <p className="mt-0.5 text-sm">{document.moderatorComment}</p>
                      </div>
                    ) : null}

                    <p className="mt-3">
                      {/* The one sanctioned way to reach the bytes: a route that
                          re-resolves ownership on every request. */}
                      <a
                        href={`/api/files/${document.fileKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
                      >
                        <FileText className="h-4 w-4" aria-hidden />
                        {t.verification.openFile}
                        <span className="sr-only">{t.a11y.newTab}</span>
                      </a>
                    </p>

                    <div className="mt-2 border-t border-border pt-3">
                      <DocumentActions documentId={document.id} isPublic={document.isPublic} />
                    </div>

                    {document.history.length > 0 ? (
                      <details className="mt-3">
                        <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-caption font-medium text-muted-foreground">
                          {t.verification.history}
                        </summary>
                        <ol className="mt-1 space-y-1.5">
                          {document.history.map((entry) => (
                            <li key={entry.id} className="text-caption text-muted-foreground">
                              <time dateTime={entry.createdAt.toISOString()}>
                                {formatDateShort(entry.createdAt, locale)}
                              </time>
                              {' — '}
                              {docStatuses[entry.toStatus] ?? entry.toStatus}
                              {entry.comment ? `: ${entry.comment}` : ''}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
