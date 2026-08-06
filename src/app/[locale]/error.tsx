'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { Button } from '@/components/ui'

/**
 * Route-level error boundary.
 *
 * The user gets a plain sentence in their language; the technical detail goes to the
 * console (and, in production, to the error reporter). Rendering `error.message` here
 * would leak internals and read as "Mutation failed" to a restaurant manager.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    console.error('[route-error]', error.digest ?? '', error)
  }, [error])

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-destructive-soft text-destructive">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-h2">{t.states.errorTitle}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{t.states.errorText}</p>
      <Button onClick={reset} className="mt-6">
        {t.states.errorRetry}
      </Button>
    </div>
  )
}
