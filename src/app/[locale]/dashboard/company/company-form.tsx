'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import {
  Building2,
  ExternalLink,
  Factory,
  ImagePlus,
  MapPin,
  Sprout,
  Store,
  Trash2,
  Truck,
  UtensilsCrossed,
} from 'lucide-react'
import {
  Alert,
  Button,
  CheckboxField,
  Field,
  Input,
  RadioGroup,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui'
import { CollapsibleSection } from '@/components/dashboard/collapsible-section'
import { useI18n } from '@/lib/i18n/provider'
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n/config'
import { formatMoney, parseAmountToBani } from '@/lib/money'
import { companySchema } from '@/lib/validation'
import {
  COMPANY_KINDS,
  ORG_TYPES,
  PAYMENT_METHODS,
  MAX_IMAGE_BYTES,
  RETAIL_CAPABLE_KINDS,
  type CompanyKind,
} from '@/lib/constants'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import {
  deleteCompanyPhoto,
  removeCompanyLogo,
  updateCompanyProfile,
  uploadCompanyLogo,
  uploadCompanyPhotos,
  type CompanyFormInput,
} from '@/server/actions/company'

/**
 * The company profile.
 *
 * Forty-odd fields, grouped into five blocks a person can name: who you are, how to
 * reach you, where you are and where you deliver, how you get paid, and what you look
 * like. Every block is one open panel on a desktop and one foldable panel on a phone —
 * scrolling past thirty inputs to correct a phone number is what made this screen the
 * one people abandoned.
 *
 * Folding is CSS, not conditional rendering: every input stays mounted, so a collapsed
 * section never silently drops the value it holds when the form is submitted.
 *
 * Beside the fields is the card a buyer will actually see, rendered live from the same
 * state. Most of these fields only matter because of how they land there, and that is
 * otherwise invisible until after saving and navigating away.
 *
 * The pieces exported alongside the form are the same ones the onboarding wizard
 * renders, so "profile" means exactly the same thing whether it is being created or
 * corrected.
 */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAY_KEYS)[number]

export type WorkingHoursDraft = Record<DayKey, { from: string; to: string } | null>

export const DEFAULT_WORKING_HOURS: WorkingHoursDraft = {
  mon: { from: '09:00', to: '18:00' },
  tue: { from: '09:00', to: '18:00' },
  wed: { from: '09:00', to: '18:00' },
  thu: { from: '09:00', to: '18:00' },
  fri: { from: '09:00', to: '18:00' },
  sat: null,
  sun: null,
}

export interface DistrictOption {
  id: string
  name: string
}

export interface LocalityOption {
  id: string
  districtId: string
  name: string
}

/** Raw strings, exactly as the inputs hold them — coercion happens in the schema. */
export interface CompanyFormValues {
  legalName: string
  displayName: string
  idno: string
  orgType: string
  description: string
  phone: string
  email: string
  website: string
  contactPerson: string
  districtId: string
  localityId: string
  address: string
  deliveryTerms: string
  minOrder: string
  pickupAvailable: boolean
  isBuyer: boolean
  isSeller: boolean
  languages: string[]
  paymentMethods: string[]
  deliveryZones: string[]
  workingHours: WorkingHoursDraft
  /** What the business is — decides whether the consumer storefront is offered at all. */
  kind: string
  isRetail: boolean
  retailDeliveryFee: string
  retailFreeFrom: string
  retailNote: string
}

/** Whether this kind of business may run the consumer storefront. */
export function canSellRetail(kind: string): boolean {
  return RETAIL_CAPABLE_KINDS.includes(kind as CompanyKind)
}

export const EMPTY_COMPANY_VALUES: CompanyFormValues = {
  legalName: '',
  displayName: '',
  idno: '',
  orgType: 'SRL',
  description: '',
  phone: '',
  email: '',
  website: '',
  contactPerson: '',
  districtId: '',
  localityId: '',
  address: '',
  deliveryTerms: '',
  minOrder: '',
  pickupAvailable: false,
  isBuyer: false,
  isSeller: false,
  languages: ['ru'],
  paymentMethods: [],
  deliveryZones: [],
  workingHours: DEFAULT_WORKING_HOURS,
  kind: 'OTHER',
  isRetail: false,
  retailDeliveryFee: '',
  retailFreeFrom: '',
  retailNote: '',
}

/** Form state in, schema input out — the server parses this exact object again. */
export function toCompanyPayload(values: CompanyFormValues): CompanyFormInput {
  return {
    legalName: values.legalName,
    displayName: values.displayName,
    idno: values.idno,
    orgType: values.orgType as CompanyFormInput['orgType'],
    description: values.description,
    phone: values.phone,
    email: values.email,
    website: values.website,
    contactPerson: values.contactPerson,
    districtId: values.districtId,
    localityId: values.localityId,
    address: values.address,
    deliveryTerms: values.deliveryTerms,
    minOrderBani: values.minOrder,
    pickupAvailable: values.pickupAvailable,
    isBuyer: values.isBuyer,
    isSeller: values.isSeller,
    languages: values.languages,
    paymentMethods: values.paymentMethods as CompanyFormInput['paymentMethods'],
    deliveryZones: values.deliveryZones,
    workingHours: values.workingHours,
    kind: values.kind as CompanyFormInput['kind'],
    // The server clears all four of these for a kind that cannot sell retail; sending
    // them anyway keeps this function a plain projection of the form.
    isRetail: values.isRetail,
    retailDeliveryFeeBani: values.retailDeliveryFee,
    retailFreeFromBani: values.retailFreeFrom,
    retailDeliveryNote: values.retailNote,
  }
}

/** Client-side pre-check. The server re-validates the same payload regardless. */
export function validateCompanyPayload(payload: CompanyFormInput): Record<string, string> {
  const parsed = companySchema.safeParse(payload)
  if (parsed.success) return {}

  const errors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const path = String(issue.path[0] ?? '')
    if (path && !errors[path]) errors[path] = issue.message
  }
  return errors
}

export interface CompanyPhotoItem {
  id: string
  url: string
}

/** Which block owns which field, so a rejected save can point at the right panel. */
const FIELD_SECTIONS: Record<string, string> = {
  legalName: 'basics',
  displayName: 'basics',
  idno: 'basics',
  orgType: 'basics',
  description: 'basics',
  isBuyer: 'basics',
  isSeller: 'basics',
  kind: 'basics',
  retailDeliveryFeeBani: 'retail',
  retailFreeFromBani: 'retail',
  retailDeliveryNote: 'retail',
  phone: 'contacts',
  email: 'contacts',
  website: 'contacts',
  contactPerson: 'contacts',
  districtId: 'address',
  localityId: 'address',
  address: 'address',
  deliveryTerms: 'address',
  minOrderBani: 'payment',
}

export function CompanyForm({
  districts,
  localities,
  initial,
  initialLogoUrl,
  initialPhotos,
  publicHref,
}: {
  districts: readonly DistrictOption[]
  localities: readonly LocalityOption[]
  initial: CompanyFormValues
  initialLogoUrl: string | null
  initialPhotos: readonly CompanyPhotoItem[]
  publicHref: string | null
}) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [values, setValues] = useState<CompanyFormValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [photos, setPhotos] = useState<readonly CompanyPhotoItem[]>(initialPhotos)
  const [pending, startTransition] = useTransition()

  const logoInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  const localityOptions = useMemo(
    () =>
      values.districtId
        ? localities.filter((locality) => locality.districtId === values.districtId)
        : [],
    [localities, values.districtId],
  )

  const districtName = districts.find((district) => district.id === values.districtId)?.name ?? ''
  const localityName =
    localityOptions.find((locality) => locality.id === values.localityId)?.name ?? ''

  /** Sections holding at least one rejected field, so they can be opened, not hunted for. */
  const invalidSections = useMemo(() => {
    const set = new Set<string>()
    for (const field of Object.keys(errors)) {
      const section = FIELD_SECTIONS[field]
      if (section) set.add(section)
    }
    return set
  }, [errors])

  function update<K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) {
    setSaved(false)
    setValues((current) => ({ ...current, [key]: value }))
  }

  function submit() {
    setFormError(null)
    setSaved(false)

    const payload = toCompanyPayload(values)
    const clientErrors = validateCompanyPayload(payload)

    if (Object.keys(clientErrors).length > 0) {
      const resolved: Record<string, string> = {}
      for (const [field, key] of Object.entries(clientErrors)) {
        resolved[field] = translate(t, key) ?? key
      }
      setErrors(resolved)
      setFormError(t.errors.validation)
      return
    }

    setErrors({})

    startTransition(async () => {
      const result = await updateCompanyProfile(payload)

      if (!result.ok) {
        if (result.fields) {
          const resolved: Record<string, string> = {}
          for (const [field, key] of Object.entries(result.fields)) {
            resolved[field] = translate(t, key) ?? key
          }
          setErrors(resolved)
        }
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      setSaved(true)
      toast({ title: t.company.profileSaved, variant: 'success' })
      router.refresh()
    })
  }

  function pickLogo(file: File | undefined) {
    if (!file) return
    setFormError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const result = await uploadCompanyLogo(formData)

      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }
      setLogoUrl(result.data.url)
      router.refresh()
    })
  }

  function pickPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setFormError(null)

    startTransition(async () => {
      const formData = new FormData()
      for (const file of Array.from(files)) formData.append('files', file)

      const result = await uploadCompanyPhotos(formData)
      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }
      setPhotos((current) => [
        ...current,
        ...result.data.map((photo) => ({ id: photo.id, url: photo.url })),
      ])
      router.refresh()
    })
  }

  const sectionLabels = {
    expand: t.company.expandSection,
    collapse: t.company.collapseSection,
  }

  return (
    <div className="space-y-4">
      {/* Announced, not just coloured: the result of a save has to reach a screen
          reader too. */}
      <div aria-live="polite">
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        {saved && !formError ? <Alert variant="success">{t.company.profileSaved}</Alert> : null}
      </div>

      <CompanyPreview
        values={values}
        logoUrl={logoUrl}
        districtName={districtName}
        localityName={localityName}
        publicHref={publicHref}
      />

      {/* ------------------------------------------------------------- basics */}
      <CollapsibleSection
        title={t.company.sectionBasics}
        description={t.company.sectionBasicsHint}
        summary={values.displayName || values.legalName}
        defaultOpen
        forceOpen={invalidSections.has('basics')}
        expandLabel={sectionLabels.expand}
        collapseLabel={sectionLabels.collapse}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t.company.legalName}
            htmlFor="company-legal-name"
            required
            error={errors['legalName']}
          >
            <Input
              id="company-legal-name"
              value={values.legalName}
              onChange={(event) => update('legalName', event.target.value)}
              placeholder={t.company.legalNamePlaceholder}
              invalid={Boolean(errors['legalName'])}
              maxLength={200}
            />
          </Field>

          <Field
            label={t.company.displayName}
            htmlFor="company-display-name"
            required
            hint={t.company.displayNameHint}
            error={errors['displayName']}
          >
            <Input
              id="company-display-name"
              value={values.displayName}
              onChange={(event) => update('displayName', event.target.value)}
              placeholder={t.company.displayNamePlaceholder}
              invalid={Boolean(errors['displayName'])}
              maxLength={120}
            />
          </Field>

          <Field
            label={t.company.idno}
            htmlFor="company-idno"
            hint={t.company.idnoHint}
            error={errors['idno']}
          >
            <Input
              id="company-idno"
              inputMode="numeric"
              value={values.idno}
              onChange={(event) => update('idno', event.target.value)}
              placeholder={t.company.idnoPlaceholder}
              invalid={Boolean(errors['idno'])}
              maxLength={13}
            />
          </Field>

          <Field label={t.company.orgType} htmlFor="company-org-type" error={errors['orgType']}>
            <Select
              id="company-org-type"
              value={values.orgType}
              onChange={(event) => update('orgType', event.target.value)}
            >
              {ORG_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t.orgTypes[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label={t.company.description}
          htmlFor="company-description"
          error={errors['description']}
        >
          <Textarea
            id="company-description"
            value={values.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder={t.company.descriptionPlaceholder}
            rows={5}
            maxLength={4000}
          />
        </Field>

        <CompanyKindField
          idPrefix="company"
          value={values.kind}
          onChange={(kind) => update('kind', kind)}
        />

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">{t.company.rolesTitle}</legend>
          <div className="space-y-1">
            <CheckboxField
              id="company-is-buyer"
              label={t.onboarding.roleBuyer}
              hint={t.onboarding.roleBuyerText}
              checked={values.isBuyer}
              onChange={(event) => update('isBuyer', event.target.checked)}
            />
            <CheckboxField
              id="company-is-seller"
              label={t.onboarding.roleSeller}
              hint={t.onboarding.roleSellerText}
              checked={values.isSeller}
              onChange={(event) => update('isSeller', event.target.checked)}
              error={errors['isBuyer']}
            />
          </div>
        </fieldset>
      </CollapsibleSection>

      {/* ----------------------------------------------------------- contacts */}
      <CollapsibleSection
        title={t.company.sectionContacts}
        description={t.company.sectionContactsHint}
        summary={values.phone || values.email}
        forceOpen={invalidSections.has('contacts')}
        expandLabel={sectionLabels.expand}
        collapseLabel={sectionLabels.collapse}
      >
        <ContactFields values={values} errors={errors} update={update} />
      </CollapsibleSection>

      {/* ---------------------------------------------- address & delivery */}
      <CollapsibleSection
        title={t.company.sectionAddress}
        description={t.company.sectionAddressHint}
        summary={[localityName, districtName].filter(Boolean).join(', ')}
        forceOpen={invalidSections.has('address')}
        expandLabel={sectionLabels.expand}
        collapseLabel={sectionLabels.collapse}
      >
        <GeographyFields
          districts={districts}
          localityOptions={localityOptions}
          values={values}
          errors={errors}
          onDistrictChange={(districtId) =>
            setValues((current) => ({ ...current, districtId, localityId: '' }))
          }
          onLocalityChange={(localityId) => update('localityId', localityId)}
          onAddressChange={(address) => update('address', address)}
        />

        <DeliveryTermsFields districts={districts} values={values} errors={errors} update={update} />

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{t.company.workingHours}</legend>
          <p className="mb-2 text-caption text-muted-foreground">{t.company.workingHoursHint}</p>
          <WorkingHoursEditor
            value={values.workingHours}
            onChange={(workingHours) => update('workingHours', workingHours)}
          />
        </fieldset>
      </CollapsibleSection>

      {/* ------------------------------------------------ retail storefront
          Absent, not disabled, for a kind that cannot sell to households: a HoReCa
          business has no use for delivery terms it is not allowed to publish, and a
          greyed-out panel would only invite the question. */}
      {canSellRetail(values.kind) ? (
        <CollapsibleSection
          title={t.company.retailTitle}
          description={t.company.retailHint}
          summary={values.isRetail ? t.company.retailEnable : t.common.no}
          defaultOpen={values.isRetail}
          forceOpen={invalidSections.has('retail')}
          expandLabel={sectionLabels.expand}
          collapseLabel={sectionLabels.collapse}
        >
          <RetailFields idPrefix="company" values={values} errors={errors} update={update} />
        </CollapsibleSection>
      ) : null}

      {/* ------------------------------------------------- payment & terms */}
      <CollapsibleSection
        title={t.company.sectionPayment}
        description={t.company.sectionPaymentHint}
        summary={values.paymentMethods
          .map((method) => t.paymentMethods[method as keyof typeof t.paymentMethods])
          .filter(Boolean)
          .join(', ')}
        forceOpen={invalidSections.has('payment')}
        expandLabel={sectionLabels.expand}
        collapseLabel={sectionLabels.collapse}
      >
        <PaymentFields values={values} errors={errors} update={update} />
      </CollapsibleSection>

      {/* -------------------------------------------------------------- media */}
      <CollapsibleSection
        title={t.company.sectionMedia}
        description={t.company.sectionMediaHint}
        summary={logoUrl ? t.company.logo : t.company.logoNone}
        expandLabel={sectionLabels.expand}
        collapseLabel={sectionLabels.collapse}
      >
        <div className="flex flex-wrap items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
            />
          ) : (
            // The muted fill already says "nothing stored yet"; the dashed outline round
            // it was a second way of saying the same thing.
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </span>
          )}

          <div className="min-w-0 flex-1">
            {/* What is stored right now, said in words — an image that failed to load
                otherwise looks exactly like no logo at all. */}
            <p className="text-sm font-medium">{logoUrl ? t.company.logo : t.company.logoNone}</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {fmt(t.company.logoHint, { size: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)) })}
            </p>
          </div>
        </div>

        <input
          ref={logoInput}
          id="company-logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            pickLogo(event.target.files?.[0])
            event.target.value = ''
          }}
        />

        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button
            variant="outline"
            loading={pending}
            fullWidth
            className="sm:w-auto"
            onClick={() => logoInput.current?.click()}
          >
            {t.company.logoUpload}
          </Button>
          {logoUrl ? (
            <Button
              variant="ghost"
              loading={pending}
              fullWidth
              className="sm:w-auto"
              onClick={() =>
                startTransition(async () => {
                  const result = await removeCompanyLogo()
                  if (!result.ok) {
                    setFormError(resolveErrorMessage(t, result, fmt))
                    return
                  }
                  setLogoUrl(null)
                  router.refresh()
                })
              }
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t.company.logoRemove}
            </Button>
          ) : null}
        </div>

        {/* The logo block above and the gallery below are separated by space; the rule
            that used to run between them cut one panel into two. */}
        <div className="pt-2">
          <p className="text-sm font-medium">{t.company.photos}</p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {fmt(t.company.photosCount, { count: photos.length })} ·{' '}
            {fmt(t.company.photosHint, { max: 12 })}
          </p>

          {photos.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo) => (
                <li key={photo.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    className="aspect-square w-full rounded-md border border-border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t.company.photoRemove}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteCompanyPhoto(photo.id)
                        if (!result.ok) {
                          setFormError(resolveErrorMessage(t, result, fmt))
                          return
                        }
                        setPhotos((current) => current.filter((item) => item.id !== photo.id))
                        router.refresh()
                      })
                    }
                    className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full bg-card/90 text-muted-foreground shadow-card transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <input
            ref={photoInput}
            id="company-photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              pickPhotos(event.target.files)
              event.target.value = ''
            }}
          />
          <Button
            variant="outline"
            loading={pending}
            fullWidth
            className="mt-3 sm:w-auto"
            onClick={() => photoInput.current?.click()}
          >
            {t.company.photosUpload}
          </Button>
        </div>
      </CollapsibleSection>

      {/* Sticky on a phone: the save button of a five-panel form is otherwise a scroll
          away from whichever field was just edited. The offset is the same height
          `.pb-safe-nav` reserves, so the bar floats above the fixed bottom navigation
          instead of behind it.

          One of the few rules kept in this pass: fields slide *underneath* this bar, and
          the line is what tells you the bar is in front rather than part of the page.
          It is dropped from `sm` up, where the bar stops floating at all. */}
      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <Button loading={pending} onClick={submit} size="lg" fullWidth className="sm:w-auto">
          {t.common.save}
        </Button>
      </div>
    </div>
  )
}

// --- public preview ----------------------------------------------------------

/**
 * The card a buyer sees, drawn from the values currently in the form.
 *
 * Not a screenshot of the real page and not trying to be: it shows the four things that
 * decide whether a buyer clicks — name, where you are, what you do, how to reach you —
 * so that "displayName" and "description" stop being abstract database columns.
 */
function CompanyPreview({
  values,
  logoUrl,
  districtName,
  localityName,
  publicHref,
}: {
  values: CompanyFormValues
  logoUrl: string | null
  districtName: string
  localityName: string
  publicHref: string | null
}) {
  const { t } = useI18n()

  const location = [localityName, districtName].filter(Boolean).join(', ')
  const orgType = t.orgTypes[values.orgType as keyof typeof t.orgTypes]

  return (
    <section aria-labelledby="company-preview-title" className="surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="company-preview-title" className="text-h3">
          {t.company.previewTitle}
        </h2>
        {publicHref ? (
          <Link
            href={publicHref}
            className="inline-flex min-h-[24px] items-center text-sm font-medium text-primary hover:text-primary-hover"
          >
            {t.company.publicProfile}
            <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {/* Inset rather than outlined: this is a sample of another screen embedded in
          this one, and it should sit *in* the card rather than float on top of it. */}
      <div className="surface-muted mt-3 flex gap-3 rounded-md p-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-card text-muted-foreground">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-sm font-semibold">
            {values.displayName || values.legalName || (
              <span className="font-normal text-muted-foreground">{t.company.previewNoName}</span>
            )}
          </p>

          <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {orgType ? `${orgType} · ` : ''}
              {location || t.company.previewNoLocation}
            </span>
          </p>

          <p className="clamp-2 mt-1.5 text-caption text-muted-foreground">
            {values.description || t.company.previewNoDescription}
          </p>

          {values.phone || values.email ? (
            <p className="clamp-1 mt-1.5 text-caption text-foreground">
              {[values.phone, values.email].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

// --- company kind ------------------------------------------------------------

const KIND_ICONS: Record<CompanyKind, ReactNode> = {
  FARM: <Sprout />,
  PRODUCER: <Factory />,
  WHOLESALER: <Truck />,
  RETAIL_CHAIN: <Store />,
  HORECA: <UtensilsCrossed />,
  OTHER: <Building2 />,
}

/**
 * What the business is, as six cards.
 *
 * Deliberately not a <select>: this choice decides whether the consumer storefront is
 * offered at all, and a one-line hint under each option is what stops a farm from
 * filing itself as a wholesaler because the word sounded bigger.
 *
 * `isBuyer`/`isSeller` next to it answer a different question — which side of the
 * market you play. A supermarket is both, and neither field can express "supermarket".
 */
export function CompanyKindField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: string
  onChange: (kind: string) => void
}) {
  const { t } = useI18n()

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-1 text-sm font-medium">{t.company.kind}</legend>
      <p className="mb-2 text-caption text-muted-foreground">{t.company.kindHint}</p>

      <RadioGroup
        name={`${idPrefix}-kind`}
        columns={2}
        value={value}
        onChange={onChange}
        options={COMPANY_KINDS.map((kind) => ({
          value: kind,
          label: t.company.kinds[kind],
          hint: t.company.kindHints[kind],
          icon: KIND_ICONS[kind],
        }))}
      />

      {/* Said once, here, rather than leaving the missing storefront panel unexplained. */}
      {!canSellRetail(value) ? (
        <p className="mt-2 text-caption text-muted-foreground">
          {t.company.retailUnavailable}. {t.company.retailUnavailableHint}
        </p>
      ) : null}
    </fieldset>
  )
}

/**
 * The consumer storefront's own terms.
 *
 * Everything below the switch is about one question the shopper asks before adding
 * anything to a basket: what does delivery cost me. The line under the fields answers
 * it back in the shopper's words, from the values currently typed — a fee stored in
 * bani and a free-delivery threshold are otherwise two numbers whose interaction is
 * only visible from the other side of the checkout.
 */
export function RetailFields({
  idPrefix,
  values,
  errors,
  update,
}: {
  idPrefix: string
  values: CompanyFormValues
  errors: Record<string, string>
  update: <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => void
}) {
  const { t, fmt, locale } = useI18n()

  const feeBani = parseAmountToBani(values.retailDeliveryFee.trim())
  const freeFromBani = parseAmountToBani(values.retailFreeFrom.trim())

  const preview: string[] = []
  if (feeBani !== null) {
    preview.push(fmt(t.company.retailPreviewFee, { amount: formatMoney(feeBani, locale) }))
  }
  if (freeFromBani !== null) {
    preview.push(fmt(t.company.retailPreviewFree, { amount: formatMoney(freeFromBani, locale) }))
  }

  return (
    <div className="space-y-4">
      <div>
        <Switch
          id={`${idPrefix}-is-retail`}
          checked={values.isRetail}
          onCheckedChange={(checked) => update('isRetail', checked)}
          label={t.company.retailEnable}
        />
        <p className="mt-1 text-caption text-muted-foreground">{t.company.retailEnableHint}</p>
      </div>

      {values.isRetail ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.company.retailDeliveryFee}
              htmlFor={`${idPrefix}-retail-fee`}
              hint={t.company.retailDeliveryFeeHint}
              error={errors['retailDeliveryFeeBani']}
            >
              <Input
                id={`${idPrefix}-retail-fee`}
                inputMode="decimal"
                autoComplete="off"
                value={values.retailDeliveryFee}
                onChange={(event) => update('retailDeliveryFee', event.target.value)}
                placeholder="35"
                invalid={Boolean(errors['retailDeliveryFeeBani'])}
              />
            </Field>

            <Field
              label={t.company.retailFreeFrom}
              htmlFor={`${idPrefix}-retail-free-from`}
              hint={t.company.retailFreeFromHint}
              error={errors['retailFreeFromBani']}
            >
              <Input
                id={`${idPrefix}-retail-free-from`}
                inputMode="decimal"
                autoComplete="off"
                value={values.retailFreeFrom}
                onChange={(event) => update('retailFreeFrom', event.target.value)}
                placeholder="500"
                invalid={Boolean(errors['retailFreeFromBani'])}
              />
            </Field>
          </div>

          <Field
            label={t.company.retailNote}
            htmlFor={`${idPrefix}-retail-note`}
            hint={t.company.retailNoteHint}
            error={errors['retailDeliveryNote']}
          >
            <Textarea
              id={`${idPrefix}-retail-note`}
              value={values.retailNote}
              onChange={(event) => update('retailNote', event.target.value)}
              placeholder={t.company.retailNotePlaceholder}
              rows={3}
              maxLength={500}
            />
          </Field>

          {/* What the shopper will read on the shop card, from what is typed above. */}
          <p className="surface-muted rounded-md px-3 py-2 text-sm">
            {preview.length === 0 ? t.company.retailPreviewNone : preview.join(' · ')}
          </p>
        </>
      ) : null}

      <p className="text-caption text-muted-foreground">{t.company.retailMoneyNote}</p>
    </div>
  )
}

// --- shared field groups -----------------------------------------------------

export function ContactFields({
  values,
  errors,
  update,
}: {
  values: CompanyFormValues
  errors: Record<string, string>
  update: <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => void
}) {
  const { t } = useI18n()

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.company.phone} htmlFor="company-phone" error={errors['phone']}>
        <Input
          id="company-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(event) => update('phone', event.target.value)}
          placeholder={t.auth.phonePlaceholder}
          invalid={Boolean(errors['phone'])}
        />
      </Field>

      <Field label={t.company.email} htmlFor="company-email" error={errors['email']}>
        <Input
          id="company-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          placeholder={t.auth.emailPlaceholder}
          invalid={Boolean(errors['email'])}
        />
      </Field>

      <Field label={t.company.website} htmlFor="company-website" error={errors['website']}>
        <Input
          id="company-website"
          type="url"
          inputMode="url"
          value={values.website}
          onChange={(event) => update('website', event.target.value)}
          placeholder="https://"
          invalid={Boolean(errors['website'])}
        />
      </Field>

      <Field
        label={t.company.contactPerson}
        htmlFor="company-contact-person"
        error={errors['contactPerson']}
      >
        <Input
          id="company-contact-person"
          value={values.contactPerson}
          onChange={(event) => update('contactPerson', event.target.value)}
          maxLength={120}
        />
      </Field>
    </div>
  )
}

export function GeographyFields({
  districts,
  localityOptions,
  values,
  errors,
  onDistrictChange,
  onLocalityChange,
  onAddressChange,
  showAddress = true,
}: {
  districts: readonly DistrictOption[]
  localityOptions: readonly LocalityOption[]
  values: Pick<CompanyFormValues, 'districtId' | 'localityId' | 'address'>
  errors: Record<string, string>
  onDistrictChange: (districtId: string) => void
  onLocalityChange: (localityId: string) => void
  onAddressChange: (address: string) => void
  /** The onboarding wizard asks for the address a step later than the region. */
  showAddress?: boolean
}) {
  const { t } = useI18n()

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.company.district} htmlFor="company-district" error={errors['districtId']}>
          <Select
            id="company-district"
            value={values.districtId}
            onChange={(event) => onDistrictChange(event.target.value)}
          >
            <option value="">{t.validation.selectOption}</option>
            {districts.map((district) => (
              <option key={district.id} value={district.id}>
                {district.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.company.locality} htmlFor="company-locality" error={errors['localityId']}>
          <Select
            id="company-locality"
            value={values.localityId}
            disabled={localityOptions.length === 0}
            onChange={(event) => onLocalityChange(event.target.value)}
          >
            <option value="">{t.validation.selectOption}</option>
            {localityOptions.map((locality) => (
              <option key={locality.id} value={locality.id}>
                {locality.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {showAddress ? (
        <Field label={t.company.address} htmlFor="company-address" error={errors['address']}>
          <Input
            id="company-address"
            value={values.address}
            onChange={(event) => onAddressChange(event.target.value)}
            maxLength={250}
          />
        </Field>
      ) : null}
    </>
  )
}

/** Where and how goods move: written terms, pickup, and the districts served. */
export function DeliveryTermsFields({
  districts,
  values,
  errors,
  update,
}: {
  districts: readonly DistrictOption[]
  values: CompanyFormValues
  errors: Record<string, string>
  update: <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => void
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-4">
      <Field
        label={t.company.deliveryTerms}
        htmlFor="company-delivery-terms"
        error={errors['deliveryTerms']}
      >
        <Textarea
          id="company-delivery-terms"
          value={values.deliveryTerms}
          onChange={(event) => update('deliveryTerms', event.target.value)}
          rows={3}
          maxLength={1000}
        />
      </Field>

      <CheckboxField
        id="company-pickup"
        label={t.company.pickupAvailable}
        checked={values.pickupAvailable}
        onChange={(event) => update('pickupAvailable', event.target.checked)}
      />

      <CheckboxGroup
        legend={t.company.deliveryZones}
        name="delivery-zones"
        options={districts.map((district) => ({ value: district.id, label: district.name }))}
        selected={values.deliveryZones}
        onChange={(next) => update('deliveryZones', next)}
        columns={3}
      />
    </div>
  )
}

/** What a deal costs to start and how it is settled. */
export function PaymentFields({
  values,
  errors,
  update,
}: {
  values: CompanyFormValues
  errors: Record<string, string>
  update: <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => void
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-4">
      <Field
        label={t.company.minOrder}
        htmlFor="company-min-order"
        hint={t.company.minOrderHint}
        error={errors['minOrderBani']}
      >
        <Input
          id="company-min-order"
          inputMode="decimal"
          value={values.minOrder}
          onChange={(event) => update('minOrder', event.target.value)}
          placeholder="1000"
          invalid={Boolean(errors['minOrderBani'])}
        />
      </Field>

      <CheckboxGroup
        legend={t.company.paymentMethods}
        name="payment-methods"
        options={PAYMENT_METHODS.map((value) => ({ value, label: t.paymentMethods[value] }))}
        selected={values.paymentMethods}
        onChange={(next) => update('paymentMethods', next)}
        columns={2}
      />

      <CheckboxGroup
        legend={t.company.languages}
        name="languages"
        options={LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
        selected={values.languages}
        onChange={(next) => update('languages', next)}
        columns={2}
      />
    </div>
  )
}

/**
 * Delivery and payment as one block.
 *
 * Kept as a single component because the onboarding wizard asks all of it on one step;
 * the profile editor uses the two halves separately, under headings a returning user can
 * navigate by.
 */
export function DeliveryFields({
  districts,
  values,
  errors,
  update,
}: {
  districts: readonly DistrictOption[]
  values: CompanyFormValues
  errors: Record<string, string>
  update: <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => void
}) {
  return (
    <div className="space-y-4">
      <DeliveryTermsFields districts={districts} values={values} errors={errors} update={update} />
      <PaymentFields values={values} errors={errors} update={update} />
    </div>
  )
}

/**
 * Seven rows, each either "closed" or a pair of times.
 *
 * Stored as a JSON string in one column rather than a table: the schema has to run on
 * SQLite as well as PostgreSQL, and nothing ever queries a company *by* its opening
 * hours.
 */
export function WorkingHoursEditor({
  value,
  onChange,
}: {
  value: WorkingHoursDraft
  onChange: (next: WorkingHoursDraft) => void
}) {
  const { t } = useI18n()

  function setDay(day: DayKey, next: { from: string; to: string } | null) {
    onChange({ ...value, [day]: next })
  }

  return (
    <ul className="space-y-2">
      {DAY_KEYS.map((day) => {
        const hours = value[day]
        return (
          <li
            key={day}
            className="surface-muted flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2"
          >
            <span className="w-24 shrink-0 text-sm font-medium sm:w-28">{t.company.days[day]}</span>

            <CheckboxField
              id={`working-hours-${day}`}
              rowClassName="w-auto"
              label={hours ? t.company.dayOpen : t.company.dayClosed}
              checked={hours !== null}
              onChange={(event) =>
                setDay(day, event.target.checked ? { from: '09:00', to: '18:00' } : null)
              }
            />

            {hours ? (
              <span className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <label htmlFor={`hours-from-${day}`} className="sr-only">
                  {t.company.hoursFrom}
                </label>
                <Input
                  id={`hours-from-${day}`}
                  type="time"
                  className="min-w-0 flex-1 sm:w-[7.5rem] sm:flex-initial"
                  value={hours.from}
                  onChange={(event) => setDay(day, { ...hours, from: event.target.value })}
                />
                <span aria-hidden className="text-muted-foreground">
                  —
                </span>
                <label htmlFor={`hours-to-${day}`} className="sr-only">
                  {t.company.hoursTo}
                </label>
                <Input
                  id={`hours-to-${day}`}
                  type="time"
                  className="min-w-0 flex-1 sm:w-[7.5rem] sm:flex-initial"
                  value={hours.to}
                  onChange={(event) => setDay(day, { ...hours, to: event.target.value })}
                />
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function CheckboxGroup({
  legend,
  name,
  options,
  selected,
  onChange,
  columns = 2,
}: {
  legend: string
  name: string
  options: readonly { value: string; label: string }[]
  selected: readonly string[]
  onChange: (next: string[]) => void
  columns?: 1 | 2 | 3
}) {
  const columnClass =
    columns === 3
      ? 'sm:grid-cols-2 lg:grid-cols-3'
      : columns === 2
        ? 'sm:grid-cols-2'
        : 'grid-cols-1'

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={`grid gap-x-4 ${columnClass}`}>
        {options.map((option) => (
          <CheckboxField
            key={option.value}
            id={`${name}-${option.value}`}
            label={option.label}
            checked={selected.includes(option.value)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, option.value]
                  : selected.filter((value) => value !== option.value),
              )
            }
          />
        ))}
      </div>
    </fieldset>
  )
}

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="surface space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-h3">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}
