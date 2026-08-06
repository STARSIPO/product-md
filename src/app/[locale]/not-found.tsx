import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { DEFAULT_LOCALE, localePath } from '@/lib/i18n/config'
import { buttonVariants } from '@/components/ui'

/**
 * `notFound()` unwinds before params are available, so this cannot know the locale.
 * It renders the default language and links back into it — the alternative would be a
 * client-side locale sniff that flashes the wrong text first.
 */
export default async function NotFound() {
  const t = await getDictionary(DEFAULT_LOCALE)

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-h2">{t.states.notFoundTitle}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{t.states.notFoundText}</p>
      <Link href={localePath(DEFAULT_LOCALE)} className={`${buttonVariants()} mt-6`}>
        {t.common.goHome}
      </Link>
    </div>
  )
}
