'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ClipboardList, PartyPopper, Search, Store, Users } from 'lucide-react'
import {
  Alert,
  Button,
  Field,
  Input,
  ProgressSteps,
  RadioGroup,
  Select,
  Textarea,
  buttonVariants,
} from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { ORG_TYPES } from '@/lib/constants'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import { completeOnboarding } from '@/server/actions/company'
import {
  CompanyKindField,
  ContactFields,
  DeliveryFields,
  EMPTY_COMPANY_VALUES,
  GeographyFields,
  RetailFields,
  Section,
  WorkingHoursEditor,
  canSellRetail,
  toCompanyPayload,
  validateCompanyPayload,
  type CompanyFormValues,
  type DistrictOption,
  type LocalityOption,
} from '@/app/[locale]/dashboard/company/company-form'

/**
 * Account setup, in three decisions.
 *
 * The order is deliberate: role first, because it changes what the rest of the product
 * even shows; then who the company is; then how it trades. Nothing is asked twice, and
 * the only two truly required fields are the two names — a half-filled profile that
 * exists beats a perfect one that was abandoned on step two.
 *
 * Progress is mirrored into sessionStorage on every keystroke, so a phone call, an
 * accidental refresh or a back button does not cost the whole form. sessionStorage
 * rather than localStorage: this draft is worthless once the tab is gone, and company
 * details are not something to leave lying in a shared browser.
 */

const STEP_COUNT = 3
const STORAGE_KEY = 'pmd:onboarding'

type RoleChoice = 'buyer' | 'seller' | 'both'

/** Which step owns which schema field — a server error jumps to the right screen. */
const FIELD_STEPS: Record<string, number> = {
  isBuyer: 0,
  isSeller: 0,
  kind: 0,
  legalName: 1,
  displayName: 1,
  idno: 1,
  orgType: 1,
  description: 1,
  phone: 1,
  email: 1,
  website: 1,
  contactPerson: 1,
  districtId: 1,
  localityId: 1,
  address: 2,
  deliveryTerms: 2,
  minOrderBani: 2,
  paymentMethods: 2,
  languages: 2,
  deliveryZones: 2,
  retailDeliveryFeeBani: 2,
  retailFreeFromBani: 2,
  retailDeliveryNote: 2,
}

function roleOf(values: CompanyFormValues): RoleChoice | '' {
  if (values.isBuyer && values.isSeller) return 'both'
  if (values.isSeller) return 'seller'
  if (values.isBuyer) return 'buyer'
  return ''
}

export function OnboardingWizard({
  districts,
  localities,
  trialDays,
}: {
  districts: readonly DistrictOption[]
  localities: readonly LocalityOption[]
  trialDays: number
}) {
  const { t, fmt, href } = useI18n()

  const [step, setStep] = useState(0)
  const [values, setValues] = useState<CompanyFormValues>(EMPTY_COMPANY_VALUES)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [done, setDone] = useState<{ isSeller: boolean; isBuyer: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  const hydrated = useRef(false)

  // --- autosave -------------------------------------------------------------
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<CompanyFormValues>
        setValues((current) => ({ ...current, ...parsed }))
        setRestored(true)
      }
    } catch {
      // A corrupt draft must never block the form.
    }
    hydrated.current = true
  }, [])

  useEffect(() => {
    if (!hydrated.current || done) return
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values))
      } catch {
        // Private mode / quota — autosave is a convenience, never a requirement.
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [values, done])

  const localityOptions = useMemo(
    () =>
      values.districtId
        ? localities.filter((locality) => locality.districtId === values.districtId)
        : [],
    [localities, values.districtId],
  )

  function update<K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function validateStep(index: number): boolean {
    const next: Record<string, string> = {}

    if (index === 0 && !values.isBuyer && !values.isSeller) {
      next['isBuyer'] = t.validation.selectOption
    }

    if (index === 1) {
      if (values.legalName.trim().length < 2) next['legalName'] = t.validation.required
      if (values.displayName.trim().length < 2) next['displayName'] = t.validation.required
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  function goNext() {
    if (!validateStep(step)) return
    setStep((current) => Math.min(current + 1, STEP_COUNT - 1))
  }

  function submit() {
    setFormError(null)

    const payload = toCompanyPayload(values)
    const clientErrors = validateCompanyPayload(payload)

    if (Object.keys(clientErrors).length > 0) {
      const resolved: Record<string, string> = {}
      let firstStep = STEP_COUNT - 1

      for (const [field, key] of Object.entries(clientErrors)) {
        resolved[field] = translate(t, key) ?? key
        const owner = FIELD_STEPS[field]
        if (owner !== undefined && owner < firstStep) firstStep = owner
      }

      setErrors(resolved)
      setFormError(t.errors.validation)
      setStep(firstStep)
      return
    }

    setErrors({})

    startTransition(async () => {
      const result = await completeOnboarding(payload)

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

      try {
        window.sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }

      // Deliberately no router.refresh(): this route redirects to the dashboard as
      // soon as the session has a company, and refreshing would replace the "what
      // next" screen with it. The links below are full navigations instead, which
      // also guarantees the next page is rendered against the new session.
      setDone({ isSeller: result.data.isSeller, isBuyer: result.data.isBuyer })
    })
  }

  function discardDraft() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setValues(EMPTY_COMPANY_VALUES)
    setRestored(false)
    setErrors({})
    setStep(0)
  }

  // --- done -----------------------------------------------------------------
  if (done) {
    return (
      <div className="space-y-5" aria-live="polite">
        <div className="surface flex flex-col items-center px-6 py-10 text-center">
          <span aria-hidden className="icon-chip mb-4 h-12 w-12 bg-success-soft text-success">
            <PartyPopper className="h-6 w-6" />
          </span>
          <h2 className="text-h2">{t.onboarding.finishTitle}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{t.onboarding.finishText}</p>

          <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
            {done.isSeller ? (
              <a href={href('products', 'new')} className={buttonVariants({ size: 'lg' })}>
                {t.onboarding.finishAddProduct}
              </a>
            ) : null}
            {done.isBuyer ? (
              <a
                href={href('requests', 'new')}
                className={buttonVariants({
                  size: 'lg',
                  variant: done.isSeller ? 'outline' : 'primary',
                })}
              >
                {t.onboarding.finishAddRequest}
              </a>
            ) : null}
            <a
              href={href('products')}
              className={buttonVariants({ size: 'lg', variant: 'ghost' })}
            >
              <Search className="mr-1.5 h-4 w-4" aria-hidden />
              {t.onboarding.finishExplore}
            </a>
          </div>
        </div>

        {done.isSeller ? (
          <Alert variant="info">{fmt(t.onboarding.trialNotice, { days: trialDays })}</Alert>
        ) : null}
        <Alert variant="info">{t.onboarding.verificationPending}</Alert>
      </div>
    )
  }

  const steps = [
    { id: 'role', label: t.onboarding.stepRole },
    { id: 'company', label: t.onboarding.stepCompany },
    { id: 'details', label: t.onboarding.stepDetails },
  ]

  return (
    <div className="space-y-6">
      <ProgressSteps
        steps={steps}
        current={step}
        onStepClick={(index) => setStep(index)}
        summary={fmt(t.onboarding.stepOf, { current: step + 1, total: STEP_COUNT })}
        label={t.onboarding.title}
      />

      <div aria-live="polite">
        {restored ? (
          <Alert variant="warning">
            {t.onboarding.draftRestored}{' '}
            <button type="button" onClick={discardDraft} className="font-medium underline">
              {t.onboarding.discardDraft}
            </button>
          </Alert>
        ) : null}
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </div>

      {/* ------------------------------------------------------------- step 1 */}
      {step === 0 ? (
        <Section title={t.onboarding.roleTitle} description={t.onboarding.roleSubtitle}>
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="sr-only">{t.onboarding.roleTitle}</legend>
            <RadioGroup
              name="onboarding-role"
              columns={1}
              value={roleOf(values)}
              onChange={(value) =>
                setValues((current) => ({
                  ...current,
                  isBuyer: value === 'buyer' || value === 'both',
                  isSeller: value === 'seller' || value === 'both',
                }))
              }
              options={[
                {
                  value: 'buyer',
                  label: t.onboarding.roleBuyer,
                  hint: t.onboarding.roleBuyerText,
                  icon: <ClipboardList />,
                },
                {
                  value: 'seller',
                  label: t.onboarding.roleSeller,
                  hint: t.onboarding.roleSellerText,
                  icon: <Store />,
                },
                {
                  value: 'both',
                  label: t.onboarding.roleBoth,
                  hint: t.onboarding.roleBothText,
                  icon: <Users />,
                },
              ]}
            />
          </fieldset>
          {errors['isBuyer'] ? (
            <p role="alert" className="text-caption text-destructive">
              {errors['isBuyer']}
            </p>
          ) : null}

          {/* Which side of the market you play, then what kind of business you are —
              two different questions, and a supermarket answers "both" to the first. */}
          <CompanyKindField
            idPrefix="onboarding"
            value={values.kind}
            onChange={(kind) => update('kind', kind)}
          />
        </Section>
      ) : null}

      {/* ------------------------------------------------------------- step 2 */}
      {step === 1 ? (
        <Section title={t.onboarding.companyTitle} description={t.onboarding.companySubtitle}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.company.legalName}
              htmlFor="onboarding-legal-name"
              required
              error={errors['legalName']}
            >
              <Input
                id="onboarding-legal-name"
                value={values.legalName}
                onChange={(event) => update('legalName', event.target.value)}
                placeholder={t.company.legalNamePlaceholder}
                invalid={Boolean(errors['legalName'])}
                maxLength={200}
                autoFocus
              />
            </Field>

            <Field
              label={t.company.displayName}
              htmlFor="onboarding-display-name"
              required
              hint={t.company.displayNameHint}
              error={errors['displayName']}
            >
              <Input
                id="onboarding-display-name"
                value={values.displayName}
                onChange={(event) => update('displayName', event.target.value)}
                placeholder={t.company.displayNamePlaceholder}
                invalid={Boolean(errors['displayName'])}
                maxLength={120}
              />
            </Field>

            <Field
              label={t.company.idno}
              htmlFor="onboarding-idno"
              hint={t.company.idnoHint}
              error={errors['idno']}
            >
              <Input
                id="onboarding-idno"
                inputMode="numeric"
                value={values.idno}
                onChange={(event) => update('idno', event.target.value)}
                placeholder={t.company.idnoPlaceholder}
                invalid={Boolean(errors['idno'])}
                maxLength={13}
              />
            </Field>

            <Field label={t.company.orgType} htmlFor="onboarding-org-type">
              <Select
                id="onboarding-org-type"
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
            htmlFor="onboarding-description"
            error={errors['description']}
          >
            <Textarea
              id="onboarding-description"
              value={values.description}
              onChange={(event) => update('description', event.target.value)}
              placeholder={t.company.descriptionPlaceholder}
              rows={4}
              maxLength={4000}
            />
          </Field>

          <ContactFields values={values} errors={errors} update={update} />

          <GeographyFields
            districts={districts}
            localityOptions={localityOptions}
            values={values}
            errors={errors}
            showAddress={false}
            onDistrictChange={(districtId) =>
              setValues((current) => ({ ...current, districtId, localityId: '' }))
            }
            onLocalityChange={(localityId) => update('localityId', localityId)}
            onAddressChange={(address) => update('address', address)}
          />
        </Section>
      ) : null}

      {/* ------------------------------------------------------------- step 3 */}
      {step === 2 ? (
        <div className="space-y-6">
          <Section title={t.onboarding.detailsTitle} description={t.onboarding.detailsSubtitle}>
            <Field label={t.company.address} htmlFor="onboarding-address" error={errors['address']}>
              <Input
                id="onboarding-address"
                value={values.address}
                onChange={(event) => update('address', event.target.value)}
                maxLength={250}
              />
            </Field>
          </Section>

          <Section title={t.company.workingHours} description={t.company.workingHoursHint}>
            <WorkingHoursEditor
              value={values.workingHours}
              onChange={(workingHours) => update('workingHours', workingHours)}
            />
          </Section>

          <Section title={t.company.deliveryTerms}>
            <DeliveryFields
              districts={districts}
              values={values}
              errors={errors}
              update={update}
            />
          </Section>

          {/* Offered during setup only to the kinds that can actually use it — a
              supermarket signing up wants the storefront on today, not after a second
              trip through the profile editor. */}
          {canSellRetail(values.kind) ? (
            <Section title={t.company.retailTitle} description={t.company.retailHint}>
              <RetailFields
                idPrefix="onboarding"
                values={values}
                errors={errors}
                update={update}
              />
            </Section>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- navigation
          Back / next sit below the step's own card, so the card edge already ends the
          step; the extra rule above them was a second boundary in the same place. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((current) => current - 1)}>
            {t.common.back}
          </Button>
        ) : null}

        {step < STEP_COUNT - 1 ? (
          <Button onClick={goNext}>{t.common.next}</Button>
        ) : (
          <Button loading={pending} onClick={submit}>
            {t.onboarding.createProfile}
          </Button>
        )}

        <p className="ml-auto text-caption text-muted-foreground">{t.onboarding.autosaveHint}</p>
      </div>
    </div>
  )
}
