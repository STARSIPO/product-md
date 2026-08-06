import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireCompany } from '@/server/auth/guards'
import { getDealForParticipant } from '@/server/services/deals'
import { formatMoney, formatQuantity, lineTotalBani } from '@/lib/money'
import { formatDate } from '@/lib/i18n/format'
import { buttonVariants } from '@/components/ui'
import { PrintButton } from '@/components/deal/deal-actions'

/**
 * The printable agreement.
 *
 * Product.md is an information platform: this sheet records what the two companies
 * agreed so both can file the same numbers, and `t.deal.disclaimer` says plainly that
 * the supply contract is between them and that the platform is not a party to it.
 *
 * There is no PDF library here on purpose. The browser's own "print to PDF" produces a
 * better document than a client-side renderer, keeps selectable text, and costs nothing
 * in bundle size — globals.css carries the @media print rules and `.print-hidden`.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.deal.documentTitle, robots: { index: false, follow: false } }
}

export default async function DealDocumentPage({
  params,
}: {
  params: { locale: string; id: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await requireCompany(locale, localePath(locale, 'deals', params.id, 'document'))

  const deal = await getDealForParticipant(params.id, user.companyId)
  if (!deal) notFound()

  const unitLabel = t.units[deal.unit as keyof typeof t.units] ?? deal.unit
  const goodsBani = lineTotalBani(deal.quantity, deal.unitPriceBani)

  return (
    <div className="container max-w-3xl py-8">
      <div className="print-hidden mb-6 flex flex-wrap items-center gap-2">
        <Link
          href={localePath(locale, 'deals', deal.id)}
          className={buttonVariants({ variant: 'ghost' })}
        >
          {t.common.back}
        </Link>
        <PrintButton label={t.deal.printButton} />
        <p className="w-full text-caption text-muted-foreground">{t.deal.documentHint}</p>
      </div>

      <article className="rounded-lg border border-border bg-card p-6 text-foreground print:rounded-none print:border-0 print:p-0">
        <header className="border-b border-border pb-4">
          <h1 className="text-h2">{t.deal.documentTitle}</h1>
          <p className="tnum mt-1 text-sm text-muted-foreground">
            {fmt(t.deal.number, { number: deal.number })} · {t.deal.date}:{' '}
            {formatDate(deal.createdAt, locale)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.common.status}: {t.dealStatus[deal.status as keyof typeof t.dealStatus] ?? deal.status}
          </p>
        </header>

        {/* ---------------------------------------------------------- parties */}
        <section aria-labelledby="doc-parties" className="mt-5 grid gap-5 sm:grid-cols-2">
          <h2 id="doc-parties" className="sr-only">
            {t.deal.signatures}
          </h2>
          <PartyBlock
            role={t.deal.buyer}
            company={deal.buyerCompany}
            idnoLabel={t.company.idno}
            addressLabel={t.company.address}
            phoneLabel={t.company.phone}
            emailLabel={t.company.email}
          />
          <PartyBlock
            role={t.deal.seller}
            company={deal.sellerCompany}
            idnoLabel={t.company.idno}
            addressLabel={t.company.address}
            phoneLabel={t.company.phone}
            emailLabel={t.company.email}
          />
        </section>

        {/* ------------------------------------------------------ line items */}
        <section aria-labelledby="doc-items" className="mt-6">
          <h2 id="doc-items" className="text-h3">
            {t.deal.lineItems}
          </h2>

          <div className="mt-3 w-full overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {t.deal.subject}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {t.deal.quantity}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {t.deal.unitPrice}
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    {t.common.total}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2.5 pr-3">{deal.title}</td>
                  <td className="tnum py-2.5 pr-3">
                    {formatQuantity(deal.quantity, unitLabel, locale)}
                  </td>
                  <td className="tnum py-2.5 pr-3">{formatMoney(deal.unitPriceBani, locale)}</td>
                  <td className="tnum py-2.5 text-right">{formatMoney(goodsBani, locale)}</td>
                </tr>
                {deal.deliveryPriceBani > 0 ? (
                  <tr>
                    <td className="py-2.5 pr-3" colSpan={3}>
                      {t.deal.deliveryPrice}
                    </td>
                    <td className="tnum py-2.5 text-right">
                      {formatMoney(deal.deliveryPriceBani, locale)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <th scope="row" colSpan={3} className="py-3 pr-3 text-left font-semibold">
                    {t.deal.total}
                  </th>
                  <td className="tnum py-3 text-right text-base font-semibold">
                    {formatMoney(deal.totalBani, locale)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* --------------------------------------------------- delivery terms */}
        <section aria-labelledby="doc-delivery" className="mt-6">
          <h2 id="doc-delivery" className="text-h3">
            {t.deal.deliveryAddress}
          </h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <Row label={t.deal.deliveryAddress} value={deal.deliveryAddress ?? '—'} />
            <Row
              label={t.deal.deliveryDate}
              value={deal.deliveryAt ? formatDate(deal.deliveryAt, locale) : '—'}
            />
            <Row
              label={t.deal.paymentMethod}
              value={
                deal.paymentMethod
                  ? (t.paymentMethods[deal.paymentMethod as keyof typeof t.paymentMethods] ??
                    deal.paymentMethod)
                  : '—'
              }
            />
            {deal.comment ? <Row label={t.offer.comment} value={deal.comment} /> : null}
          </dl>
        </section>

        {/* --------------------------------------------------------- signatures */}
        <section aria-labelledby="doc-signatures" className="mt-8">
          <h2 id="doc-signatures" className="text-h3">
            {t.deal.signatures}
          </h2>
          <div className="mt-4 grid gap-8 sm:grid-cols-2">
            <SignatureLine
              role={t.deal.buyer}
              company={deal.buyerCompany.displayName}
              hint={t.deal.signatureLine}
            />
            <SignatureLine
              role={t.deal.seller}
              company={deal.sellerCompany.displayName}
              hint={t.deal.signatureLine}
            />
          </div>
        </section>

        <footer className="mt-8 border-t border-border pt-4">
          <p className="text-caption leading-relaxed text-muted-foreground">
            {t.deal.disclaimer}
          </p>
        </footer>
      </article>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function PartyBlock({
  role,
  company,
  idnoLabel,
  addressLabel,
  phoneLabel,
  emailLabel,
}: {
  role: string
  company: {
    displayName: string
    legalName: string | null
    idno: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  idnoLabel: string
  addressLabel: string
  phoneLabel: string
  emailLabel: string
}) {
  return (
    <div>
      <h3 className="text-caption uppercase tracking-wide text-muted-foreground">{role}</h3>
      <p className="mt-1 text-base font-semibold">{company.legalName ?? company.displayName}</p>
      {company.legalName ? (
        <p className="text-sm text-muted-foreground">{company.displayName}</p>
      ) : null}
      <dl className="mt-2 space-y-1 text-sm">
        {company.idno ? <Row label={idnoLabel} value={company.idno} /> : null}
        {company.address ? <Row label={addressLabel} value={company.address} /> : null}
        {company.phone ? <Row label={phoneLabel} value={company.phone} /> : null}
        {company.email ? <Row label={emailLabel} value={company.email} /> : null}
      </dl>
    </div>
  )
}

function SignatureLine({
  role,
  company,
  hint,
}: {
  role: string
  company: string
  hint: string
}) {
  return (
    <div>
      <p className="text-sm font-medium">{role}</p>
      <p className="text-caption text-muted-foreground">{company}</p>
      <div className="mt-8 border-b border-foreground/40" />
      <p className="mt-1 text-caption text-muted-foreground">{hint}</p>
    </div>
  )
}
