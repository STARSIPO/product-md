'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import { UNITS } from '@/lib/constants'
import type { ActionResult } from '@/server/actions/result'
import {
  deleteAttributeAction,
  deleteAttributeOptionAction,
  deleteCategoryAction,
  deleteSynonymAction,
  previewSuggestionsAction,
  saveAttributeAction,
  saveAttributeOptionAction,
  saveCategoryAction,
  saveSynonymAction,
  type SuggestionPreview,
} from '@/server/actions/admin'

/**
 * Taxonomy editing: categories, their attributes and the synonyms that feed the
 * "smart category" typeahead.
 *
 * All three live in one client module because they are one job. A category is worthless
 * to a buyer who calls it something else — «картошка» for «Картофель», "carne de vita"
 * without diacritics — so adding a category and teaching the matcher its aliases has to
 * be the same sitting. The tester at the bottom of the synonyms screen closes that loop:
 * type what a buyer would type and see the ranking the matcher actually produces.
 *
 * Every mutation goes through a server action that re-checks the admin role and calls
 * `invalidateCategoryIndex()`, because the suggester holds the whole taxonomy in memory.
 */

const ATTRIBUTE_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'MULTISELECT', 'BOOL', 'DATE'] as const
const APPLIES_TO = ['BOTH', 'PRODUCT', 'REQUEST'] as const

type AnyActionResult = ActionResult<unknown>

/** Shared submit plumbing: pending flag, localized error, toast, refresh. */
function useEditorAction() {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | undefined>(undefined)

  function run(
    action: () => Promise<AnyActionResult>,
    options: { onSuccess?: (result: AnyActionResult) => void } = {},
  ) {
    setError(null)
    setFieldError(undefined)

    startTransition(async () => {
      const result = await action()

      if (!result.ok) {
        setError(resolveErrorMessage(t, result, fmt))
        const first = result.fields ? Object.values(result.fields)[0] : undefined
        setFieldError(translate(t, first))
        return
      }

      toast({ title: t.admin.saved, variant: 'success' })
      options.onSuccess?.(result)
      router.refresh()
    })
  }

  return { run, pending, error, fieldError }
}

// --- categories --------------------------------------------------------------

export interface CategoryOption {
  id: string
  label: string
}

export interface CategoryFormValues {
  id: string
  parentId: string
  slug: string
  nameRu: string
  nameRo: string
  slugRu: string
  slugRo: string
  sortOrder: number
  isPopular: boolean
  isActive: boolean
  defaultUnit: string
  icon: string
}

export function CategoryEditor({
  category,
  parents,
  basePath,
}: {
  category: CategoryFormValues
  /** Every category except the edited one and its descendants. */
  parents: readonly CategoryOption[]
  basePath: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const { run, pending, error, fieldError } = useEditorAction()
  const [values, setValues] = useState<CategoryFormValues>(category)

  function set<K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const units = t.units as Record<string, string | undefined>
  const isNew = values.id === ''

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-h3">{isNew ? t.admin.newCategory : t.admin.editCategory}</h2>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t.admin.parentCategory} htmlFor="parentId">
          <Select
            id="parentId"
            value={values.parentId}
            disabled={pending}
            onChange={(event) => set('parentId', event.target.value)}
          >
            <option value="">{t.admin.rootCategory}</option>
            {parents.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.admin.slug} htmlFor="slug" required error={fieldError}>
          <Input
            id="slug"
            value={values.slug}
            disabled={pending}
            onChange={(event) => set('slug', event.target.value)}
          />
        </Field>

        <Field label={t.admin.nameRu} htmlFor="nameRu" required>
          <Input
            id="nameRu"
            value={values.nameRu}
            disabled={pending}
            onChange={(event) => set('nameRu', event.target.value)}
          />
        </Field>

        <Field label={t.admin.nameRo} htmlFor="nameRo" required>
          <Input
            id="nameRo"
            value={values.nameRo}
            disabled={pending}
            onChange={(event) => set('nameRo', event.target.value)}
          />
        </Field>

        <Field label={t.admin.slugRu} htmlFor="slugRu" required>
          <Input
            id="slugRu"
            value={values.slugRu}
            disabled={pending}
            onChange={(event) => set('slugRu', event.target.value)}
          />
        </Field>

        <Field label={t.admin.slugRo} htmlFor="slugRo" required>
          <Input
            id="slugRo"
            value={values.slugRo}
            disabled={pending}
            onChange={(event) => set('slugRo', event.target.value)}
          />
        </Field>

        <Field label={t.admin.sortOrder} htmlFor="sortOrder">
          <Input
            id="sortOrder"
            type="number"
            inputMode="numeric"
            value={values.sortOrder}
            disabled={pending}
            onChange={(event) => set('sortOrder', Number(event.target.value) || 0)}
          />
        </Field>

        <Field label={t.admin.defaultUnit} htmlFor="defaultUnit">
          <Select
            id="defaultUnit"
            value={values.defaultUnit}
            disabled={pending}
            onChange={(event) => set('defaultUnit', event.target.value)}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {units[unit] ?? unit}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.admin.icon} htmlFor="icon" hint="lucide">
          <Input
            id="icon"
            value={values.icon}
            disabled={pending}
            onChange={(event) => set('icon', event.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
            <Checkbox
              checked={values.isActive}
              disabled={pending}
              onChange={(event) => set('isActive', event.target.checked)}
            />
            {t.admin.isActive}
          </label>
          <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
            <Checkbox
              checked={values.isPopular}
              disabled={pending}
              onChange={(event) => set('isPopular', event.target.checked)}
            />
            {t.admin.isPopular}
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          loading={pending}
          onClick={() =>
            run(
              () =>
                saveCategoryAction({
                  ...(values.id ? { id: values.id } : {}),
                  parentId: values.parentId === '' ? null : values.parentId,
                  slug: values.slug,
                  nameRu: values.nameRu,
                  nameRo: values.nameRo,
                  slugRu: values.slugRu,
                  slugRo: values.slugRo,
                  sortOrder: values.sortOrder,
                  isPopular: values.isPopular,
                  isActive: values.isActive,
                  defaultUnit: values.defaultUnit as (typeof UNITS)[number],
                  icon: values.icon,
                }),
              {
                onSuccess: (result) => {
                  if (result.ok && typeof result.data === 'string') {
                    router.push(`${basePath}?id=${encodeURIComponent(result.data)}`)
                  }
                },
              },
            )
          }
        >
          {t.common.save}
        </Button>

        {!isNew ? (
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              run(() => deleteCategoryAction(values.id), {
                onSuccess: () => router.push(basePath),
              })
            }
          >
            {t.admin.deleteCategory}
          </Button>
        ) : null}
      </div>

      {!isNew ? (
        <p className="mt-2 text-caption text-muted-foreground">{t.admin.deleteCategoryHint}</p>
      ) : null}
    </section>
  )
}

// --- attributes --------------------------------------------------------------

export interface AttributeOptionValues {
  id: string
  value: string
  sortOrder: number
  labelRu: string
  labelRo: string
}

export interface AttributeFormValues {
  id: string
  categoryId: string
  key: string
  type: string
  unit: string
  isRequired: boolean
  isFilterable: boolean
  appliesTo: string
  sortOrder: number
  inherited: boolean
  labelRu: string
  labelRo: string
  hintRu: string
  hintRo: string
  options: AttributeOptionValues[]
}

export function AttributeList({
  categoryId,
  attributes,
}: {
  categoryId: string
  attributes: readonly AttributeFormValues[]
}) {
  const { t } = useI18n()

  const blank: AttributeFormValues = {
    id: '',
    categoryId,
    key: '',
    type: 'TEXT',
    unit: '',
    isRequired: false,
    isFilterable: false,
    appliesTo: 'BOTH',
    sortOrder: 0,
    inherited: true,
    labelRu: '',
    labelRo: '',
    hintRu: '',
    hintRo: '',
    options: [],
  }

  return (
    <section className="space-y-3">
      <h2 className="text-h3">{t.admin.attributesTitle}</h2>

      {attributes.map((attribute) => (
        <AttributeCard key={attribute.id} attribute={attribute} />
      ))}

      <AttributeCard key={`new-${categoryId}`} attribute={blank} />
    </section>
  )
}

function AttributeCard({ attribute }: { attribute: AttributeFormValues }) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useEditorAction()
  const [values, setValues] = useState<AttributeFormValues>(attribute)

  function set<K extends keyof AttributeFormValues>(key: K, value: AttributeFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const isNew = values.id === ''
  const attributeTypes = t.admin.attributeTypes as Record<string, string | undefined>
  const appliesToLabels = t.admin.appliesTo as Record<string, string | undefined>
  const hasOptions = values.type === 'SELECT' || values.type === 'MULTISELECT'

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">
        {isNew ? t.admin.newAttribute : `${values.labelRu} · ${values.key}`}
      </h3>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t.admin.attributeKey} htmlFor={`key-${values.id || 'new'}`} required error={fieldError}>
          <Input
            id={`key-${values.id || 'new'}`}
            value={values.key}
            disabled={pending}
            onChange={(event) => set('key', event.target.value)}
          />
        </Field>

        <Field label={t.admin.attributeType} htmlFor={`type-${values.id || 'new'}`}>
          <Select
            id={`type-${values.id || 'new'}`}
            value={values.type}
            disabled={pending}
            onChange={(event) => set('type', event.target.value)}
          >
            {ATTRIBUTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {attributeTypes[type] ?? type}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.admin.attributeLabelRu} htmlFor={`labelRu-${values.id || 'new'}`} required>
          <Input
            id={`labelRu-${values.id || 'new'}`}
            value={values.labelRu}
            disabled={pending}
            onChange={(event) => set('labelRu', event.target.value)}
          />
        </Field>

        <Field label={t.admin.attributeLabelRo} htmlFor={`labelRo-${values.id || 'new'}`} required>
          <Input
            id={`labelRo-${values.id || 'new'}`}
            value={values.labelRo}
            disabled={pending}
            onChange={(event) => set('labelRo', event.target.value)}
          />
        </Field>

        <Field label={t.admin.attributeHintRu} htmlFor={`hintRu-${values.id || 'new'}`}>
          <Textarea
            id={`hintRu-${values.id || 'new'}`}
            rows={2}
            value={values.hintRu}
            disabled={pending}
            onChange={(event) => set('hintRu', event.target.value)}
          />
        </Field>

        <Field label={t.admin.attributeHintRo} htmlFor={`hintRo-${values.id || 'new'}`}>
          <Textarea
            id={`hintRo-${values.id || 'new'}`}
            rows={2}
            value={values.hintRo}
            disabled={pending}
            onChange={(event) => set('hintRo', event.target.value)}
          />
        </Field>

        <Field label={t.admin.attributeUnit} htmlFor={`unit-${values.id || 'new'}`}>
          <Input
            id={`unit-${values.id || 'new'}`}
            value={values.unit}
            disabled={pending}
            onChange={(event) => set('unit', event.target.value)}
          />
        </Field>

        <Field label={t.admin.attributeAppliesTo} htmlFor={`appliesTo-${values.id || 'new'}`}>
          <Select
            id={`appliesTo-${values.id || 'new'}`}
            value={values.appliesTo}
            disabled={pending}
            onChange={(event) => set('appliesTo', event.target.value)}
          >
            {APPLIES_TO.map((value) => (
              <option key={value} value={value}>
                {appliesToLabels[value] ?? value}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.admin.sortOrder} htmlFor={`sort-${values.id || 'new'}`}>
          <Input
            id={`sort-${values.id || 'new'}`}
            type="number"
            inputMode="numeric"
            value={values.sortOrder}
            disabled={pending}
            onChange={(event) => set('sortOrder', Number(event.target.value) || 0)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
            <Checkbox
              checked={values.isRequired}
              disabled={pending}
              onChange={(event) => set('isRequired', event.target.checked)}
            />
            {t.admin.attributeRequired}
          </label>
          <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
            <Checkbox
              checked={values.isFilterable}
              disabled={pending}
              onChange={(event) => set('isFilterable', event.target.checked)}
            />
            {t.admin.attributeFilterable}
          </label>
          <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
            <Checkbox
              checked={values.inherited}
              disabled={pending}
              onChange={(event) => set('inherited', event.target.checked)}
            />
            {t.admin.attributeInherited}
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            run(() =>
              saveAttributeAction({
                ...(values.id ? { id: values.id } : {}),
                categoryId: values.categoryId,
                key: values.key,
                type: values.type as (typeof ATTRIBUTE_TYPES)[number],
                unit: values.unit,
                isRequired: values.isRequired,
                isFilterable: values.isFilterable,
                appliesTo: values.appliesTo as (typeof APPLIES_TO)[number],
                sortOrder: values.sortOrder,
                inherited: values.inherited,
                labelRu: values.labelRu,
                labelRo: values.labelRo,
                hintRu: values.hintRu,
                hintRo: values.hintRo,
              }),
            )
          }
        >
          {t.common.save}
        </Button>

        {!isNew ? (
          <Button
            size="sm"
            variant="destructive"
            loading={pending}
            onClick={() => run(() => deleteAttributeAction(values.id))}
          >
            {t.common.delete}
          </Button>
        ) : null}
      </div>

      {!isNew && hasOptions ? (
        <OptionList attributeId={values.id} options={values.options} />
      ) : null}
    </article>
  )
}

function OptionList({
  attributeId,
  options,
}: {
  attributeId: string
  options: readonly AttributeOptionValues[]
}) {
  const { t } = useI18n()

  const blank: AttributeOptionValues = {
    id: '',
    value: '',
    sortOrder: 0,
    labelRu: '',
    labelRo: '',
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <h4 className="text-sm font-semibold">{t.admin.optionsTitle}</h4>
      <ul className="mt-2 space-y-2">
        {options.map((option) => (
          <li key={option.id}>
            <OptionRow attributeId={attributeId} option={option} />
          </li>
        ))}
        <li>
          <OptionRow attributeId={attributeId} option={blank} />
        </li>
      </ul>
    </div>
  )
}

function OptionRow({
  attributeId,
  option,
}: {
  attributeId: string
  option: AttributeOptionValues
}) {
  const { t } = useI18n()
  const { run, pending, error } = useEditorAction()
  const [values, setValues] = useState<AttributeOptionValues>(option)

  function set<K extends keyof AttributeOptionValues>(key: K, value: AttributeOptionValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const isNew = values.id === ''

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[120px] flex-1">
        <span className="mb-1 block text-caption text-muted-foreground">{t.admin.optionValue}</span>
        <Input
          value={values.value}
          disabled={pending}
          onChange={(event) => set('value', event.target.value)}
        />
      </label>
      <label className="min-w-[120px] flex-1">
        <span className="mb-1 block text-caption text-muted-foreground">{t.admin.nameRu}</span>
        <Input
          value={values.labelRu}
          disabled={pending}
          onChange={(event) => set('labelRu', event.target.value)}
        />
      </label>
      <label className="min-w-[120px] flex-1">
        <span className="mb-1 block text-caption text-muted-foreground">{t.admin.nameRo}</span>
        <Input
          value={values.labelRo}
          disabled={pending}
          onChange={(event) => set('labelRo', event.target.value)}
        />
      </label>

      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          run(() =>
            saveAttributeOptionAction({
              ...(values.id ? { id: values.id } : {}),
              attributeId,
              value: values.value,
              sortOrder: values.sortOrder,
              labelRu: values.labelRu,
              labelRo: values.labelRo,
            }),
          )
        }
      >
        {isNew ? t.common.add : t.common.save}
      </Button>

      {!isNew ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => run(() => deleteAttributeOptionAction(values.id))}
        >
          {t.common.delete}
        </Button>
      ) : null}

      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </div>
  )
}

// --- synonyms ----------------------------------------------------------------

export interface SynonymValues {
  id: string
  categoryId: string
  locale: string
  term: string
  normalized: string
  weight: number
  isMisspelling: boolean
}

export function SynonymRow({
  synonym,
  categories,
}: {
  synonym: SynonymValues
  categories: readonly CategoryOption[]
}) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useEditorAction()
  const [values, setValues] = useState<SynonymValues>(synonym)

  function set<K extends keyof SynonymValues>(key: K, value: SynonymValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const isNew = values.id === ''

  return (
    <div className="flex flex-wrap items-end gap-2 px-4 py-3">
      <label className="min-w-[160px] flex-[2]">
        <span className="mb-1 block text-caption text-muted-foreground">{t.admin.synonymTerm}</span>
        <Input
          value={values.term}
          disabled={pending}
          invalid={fieldError !== undefined}
          onChange={(event) => set('term', event.target.value)}
        />
      </label>

      <label className="min-w-[180px] flex-[2]">
        <span className="mb-1 block text-caption text-muted-foreground">{t.admin.categories}</span>
        <Select
          value={values.categoryId}
          disabled={pending}
          onChange={(event) => set('categoryId', event.target.value)}
        >
          <option value="">—</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </Select>
      </label>

      <label className="w-[104px]">
        <span className="mb-1 block text-caption text-muted-foreground">
          {t.admin.synonymLocale}
        </span>
        <Select
          value={values.locale}
          disabled={pending}
          onChange={(event) => set('locale', event.target.value)}
        >
          <option value="ru">ru</option>
          <option value="ro">ro</option>
        </Select>
      </label>

      <label className="w-[92px]">
        <span className="mb-1 block text-caption text-muted-foreground">
          {t.admin.synonymWeight}
        </span>
        <Input
          type="number"
          inputMode="numeric"
          value={values.weight}
          disabled={pending}
          onChange={(event) => set('weight', Number(event.target.value) || 0)}
        />
      </label>

      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <Checkbox
          checked={values.isMisspelling}
          disabled={pending}
          onChange={(event) => set('isMisspelling', event.target.checked)}
        />
        {t.admin.synonymMisspelling}
      </label>

      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          run(() =>
            saveSynonymAction({
              ...(values.id ? { id: values.id } : {}),
              categoryId: values.categoryId,
              locale: values.locale === 'ro' ? 'ro' : 'ru',
              term: values.term,
              weight: values.weight,
              isMisspelling: values.isMisspelling,
            }),
          )
        }
      >
        {isNew ? t.common.add : t.common.save}
      </Button>

      {!isNew ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => run(() => deleteSynonymAction(values.id))}
        >
          {t.common.delete}
        </Button>
      ) : null}

      {!isNew ? (
        <span className="w-full font-mono text-caption text-muted-foreground">
          {t.admin.synonymNormalized}: {values.normalized}
        </span>
      ) : null}

      {error ? <span className="w-full text-caption text-destructive">{error}</span> : null}
    </div>
  )
}

/**
 * "Try a query" box.
 *
 * Synonyms are only worth anything if they change the ranking, and the ranking is not
 * obvious from the rows — depth bonus, misspelling penalty and weight all interact. This
 * runs the real `suggestCategories()` on the server and prints the scores it returns.
 */
export function SuggestTester({ locale }: { locale: 'ru' | 'ro' }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SuggestionPreview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function test() {
    setError(null)
    startTransition(async () => {
      const result = await previewSuggestionsAction(query, locale)
      if (!result.ok) {
        setError(t.errors.generic)
        setResults([])
        return
      }
      setResults(result.data)
    })
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-h3">{t.admin.testQuery}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.admin.testQueryHint}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">{t.admin.testQuery}</span>
          <Input
            value={query}
            disabled={pending}
            placeholder={t.nav.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button loading={pending} onClick={test}>
          {t.admin.testQueryRun}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {results !== null ? (
        results.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t.admin.testQueryEmpty}</p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-md border border-border">
            {results.map((item) => (
              <li key={item.categoryId} className="flex flex-wrap items-baseline gap-2 px-3 py-2">
                <span className="text-sm font-medium">{item.name}</span>
                <span className="text-caption text-muted-foreground">{item.trailLabel}</span>
                {item.matchedTerm ? (
                  <span className="font-mono text-caption text-muted-foreground">
                    {item.matchedTerm}
                  </span>
                ) : null}
                <span className="tnum ml-auto text-sm font-semibold">
                  {t.admin.score}: {item.score}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </section>
  )
}
