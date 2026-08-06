'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/provider'
import { Checkbox, Field, Input, Select, Skeleton } from '@/components/ui'

/**
 * Dependent characteristics.
 *
 * The form for beef is not the form for packaging: once a category is chosen the
 * server returns exactly the attributes that category (and its ancestors) define, and
 * this renders them. Nothing here is hardcoded per category — an admin adding a new
 * attribute in the category editor changes this form with no code change.
 *
 * Values are held by the parent as a Record<attributeId, AttributeValue> so the whole
 * set can be submitted as one array; see src/lib/validation.ts
 * `productAttributeValueSchema`.
 */

export interface ResolvedAttribute {
  id: string
  key: string
  type: string
  unit: string | null
  isRequired: boolean
  isFilterable: boolean
  sortOrder: number
  label: string
  hint: string | null
  options: { id: string; value: string; label: string }[]
}

export interface AttributeValue {
  attributeId: string
  valueText?: string
  valueNumber?: number
  valueBool?: boolean
  optionId?: string
}

export function useCategoryAttributes(
  categoryId: string | null,
  appliesTo: 'PRODUCT' | 'REQUEST',
) {
  const { locale } = useI18n()
  const [attributes, setAttributes] = useState<ResolvedAttribute[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!categoryId) {
      setAttributes([])
      return
    }

    let cancelled = false
    setLoading(true)

    void fetch(
      `/api/categories/suggest?attributesFor=${categoryId}&locale=${locale}&appliesTo=${appliesTo}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { attributes?: ResolvedAttribute[] } | null) => {
        if (!cancelled && data?.attributes) setAttributes(data.attributes)
      })
      .catch(() => {
        if (!cancelled) setAttributes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [categoryId, locale, appliesTo])

  return { attributes, loading }
}

export function AttributeFields({
  attributes,
  loading,
  values,
  onChange,
  errors,
}: {
  attributes: ResolvedAttribute[]
  loading: boolean
  values: Record<string, AttributeValue>
  onChange: (attributeId: string, value: AttributeValue | undefined) => void
  errors?: Record<string, string>
}) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-[42px] w-full rounded-md" />
          </div>
        ))}
      </div>
    )
  }

  if (attributes.length === 0) return null

  return (
    <div className="space-y-4">
      {attributes.map((attribute) => {
        const value = values[attribute.id]
        const fieldId = `attr-${attribute.id}`
        const error = errors?.[attribute.id]
        const label = attribute.unit ? `${attribute.label}, ${attribute.unit}` : attribute.label

        if (attribute.type === 'BOOL') {
          return (
            <div key={attribute.id}>
              <label
                htmlFor={fieldId}
                className="flex min-h-[44px] items-center gap-2.5 text-sm"
              >
                <Checkbox
                  id={fieldId}
                  checked={value?.valueBool ?? false}
                  onChange={(event) =>
                    onChange(attribute.id, {
                      attributeId: attribute.id,
                      valueBool: event.target.checked,
                    })
                  }
                />
                <span>{attribute.label}</span>
              </label>
              {attribute.hint ? (
                <p className="ml-8 text-caption text-muted-foreground">{attribute.hint}</p>
              ) : null}
            </div>
          )
        }

        if (attribute.type === 'SELECT' || attribute.type === 'MULTISELECT') {
          return (
            <Field
              key={attribute.id}
              label={label}
              htmlFor={fieldId}
              hint={attribute.hint ?? undefined}
              required={attribute.isRequired}
              error={error}
            >
              <Select
                id={fieldId}
                value={value?.optionId ?? ''}
                invalid={Boolean(error)}
                onChange={(event) =>
                  onChange(
                    attribute.id,
                    event.target.value
                      ? { attributeId: attribute.id, optionId: event.target.value }
                      : undefined,
                  )
                }
              >
                <option value="">{t.validation.selectOption}</option>
                {attribute.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          )
        }

        if (attribute.type === 'NUMBER') {
          return (
            <Field
              key={attribute.id}
              label={label}
              htmlFor={fieldId}
              hint={attribute.hint ?? undefined}
              required={attribute.isRequired}
              error={error}
            >
              <Input
                id={fieldId}
                type="number"
                inputMode="decimal"
                step="any"
                value={value?.valueNumber ?? ''}
                invalid={Boolean(error)}
                onChange={(event) =>
                  onChange(
                    attribute.id,
                    event.target.value === ''
                      ? undefined
                      : { attributeId: attribute.id, valueNumber: Number(event.target.value) },
                  )
                }
              />
            </Field>
          )
        }

        if (attribute.type === 'DATE') {
          return (
            <Field
              key={attribute.id}
              label={label}
              htmlFor={fieldId}
              hint={attribute.hint ?? undefined}
              required={attribute.isRequired}
              error={error}
            >
              <Input
                id={fieldId}
                type="date"
                value={value?.valueText ?? ''}
                invalid={Boolean(error)}
                onChange={(event) =>
                  onChange(
                    attribute.id,
                    event.target.value
                      ? { attributeId: attribute.id, valueText: event.target.value }
                      : undefined,
                  )
                }
              />
            </Field>
          )
        }

        return (
          <Field
            key={attribute.id}
            label={label}
            htmlFor={fieldId}
            hint={attribute.hint ?? undefined}
            required={attribute.isRequired}
            error={error}
          >
            <Input
              id={fieldId}
              value={value?.valueText ?? ''}
              invalid={Boolean(error)}
              onChange={(event) =>
                onChange(
                  attribute.id,
                  event.target.value
                    ? { attributeId: attribute.id, valueText: event.target.value }
                    : undefined,
                )
              }
            />
          </Field>
        )
      })}
    </div>
  )
}

/** Flattens the value map into the array shape the server action expects. */
export function toAttributeArray(values: Record<string, AttributeValue>): AttributeValue[] {
  return Object.values(values).filter(
    (value) =>
      value.valueText !== undefined ||
      value.valueNumber !== undefined ||
      value.valueBool !== undefined ||
      value.optionId !== undefined,
  )
}
