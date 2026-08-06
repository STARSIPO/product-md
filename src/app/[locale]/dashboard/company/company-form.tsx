'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { ExternalLink, ImagePlus, Trash2 } from 'lucide-react'
import {
  Alert,
  Button,
  CheckboxField,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { LOCALES, LOCALE_LABELS } from '@/lib/i18n/config'
import { companySchema } from '@/lib/validation'
import { ORG_TYPES, PAYMENT_METHODS, MAX_IMAGE_BYTES } from '@/lib/constants'
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
 * Everything a buyer uses to decide whether to talk to this supplier lives on one
 * screen — there is no wizard here, because editing is a different task from creating
 * and a returning user wants to change one field, not walk seven steps.
 *
 * The pieces exported alongside the form (day rows, checkbox groups, the value shape)
 * are the same ones the onboarding wizard renders, so "profile" means exactly the same
 * thing whether it is being created or corrected.
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
      setPhotos((current) => [...current, ...result.data.map((photo) => ({ id: photo.id, url: photo.url }))])
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Announced, not just coloured: the result of a save has to reach a screen
          reader too. */}
      <div aria-live="polite">
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        {saved && !formError ? <Alert variant="success">{t.company.profileSaved}</Alert> : null}
      </div>

      {publicHref ? (
        <p className="text-sm text-muted-foreground">
          {t.company.publicProfileHint}{' '}
          <Link
            href={publicHref}
            className="font-medium text-primary hover:text-primary-hover"
          >
            {t.company.publicProfile}
            <ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      ) : null}

      {/* ------------------------------------------------------------ identity */}
      <Section title={t.onboarding.companyTitle} description={t.onboarding.companySubtitle}>
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
      </Section>

      {/* -------------------------------------------------------------- images */}
      <Section title={t.company.logo}>
        <div className="flex flex-wrap items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 rounded-lg border border-border object-cover"
            />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </span>
          )}

          <div className="flex flex-wrap gap-2">
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
            <Button
              variant="outline"
              loading={pending}
              onClick={() => logoInput.current?.click()}
            >
              {t.company.logoUpload}
            </Button>
            {logoUrl ? (
              <Button
                variant="ghost"
                loading={pending}
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
                {t.company.logoRemove}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-caption text-muted-foreground">
          {fmt(t.company.logoHint, { size: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)) })}
        </p>
      </Section>

      <Section title={t.company.photos}>
        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                  className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-md bg-card/90 text-muted-foreground shadow-card transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div>
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
          <Button variant="outline" loading={pending} onClick={() => photoInput.current?.click()}>
            {t.company.photosUpload}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          {fmt(t.company.photosHint, { max: 12 })}
        </p>
      </Section>

      {/* ------------------------------------------------------------ contacts */}
      <Section title={t.company.contactsTitle}>
        <ContactFields values={values} errors={errors} update={update} />
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
      </Section>

      {/* -------------------------------------------------------- working hours */}
      <Section title={t.company.workingHours} description={t.company.workingHoursHint}>
        <WorkingHoursEditor
          value={values.workingHours}
          onChange={(workingHours) => update('workingHours', workingHours)}
        />
      </Section>

      {/* ------------------------------------------------------------ delivery */}
      <Section title={t.company.deliveryTerms}>
        <DeliveryFields
          districts={districts}
          values={values}
          errors={errors}
          update={update}
        />
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button loading={pending} onClick={submit}>
          {t.common.save}
        </Button>
      </div>
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

      <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="flex items-end">
          <CheckboxField
            id="company-pickup"
            label={t.company.pickupAvailable}
            checked={values.pickupAvailable}
            onChange={(event) => update('pickupAvailable', event.target.checked)}
          />
        </div>
      </div>

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
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <span className="w-28 shrink-0 text-sm font-medium">{t.company.days[day]}</span>

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
              <span className="ml-auto flex items-center gap-2">
                <label htmlFor={`hours-from-${day}`} className="sr-only">
                  {t.company.hoursFrom}
                </label>
                <Input
                  id={`hours-from-${day}`}
                  type="time"
                  className="w-[7.5rem]"
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
                  className="w-[7.5rem]"
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
    <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
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
