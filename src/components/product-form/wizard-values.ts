import type { Unit, Availability } from '@/lib/constants'

/**
 * The listing wizard's data shapes and its blank draft.
 *
 * These live in their own module, deliberately, and the module carries no `'use client'`
 * directive. `product-wizard.tsx` does — and every *value* exported across a client
 * boundary becomes a client reference on the server side, not the thing itself. While
 * `emptyWizardValues` lived there, the two server components that build a draft
 * (`products/new` and `products/[slug]/edit`) were calling a proxy object:
 *
 *     TypeError: (0 , product_wizard__WEBPACK_IMPORTED_MODULE__.emptyWizardValues)
 *                is not a function
 *
 * — a 500 on both "Разместить товар" and "Edit listing". Types are erased at build time
 * and were never part of the problem; only the function had to move. Keep it that way:
 * anything a server component *calls* belongs here, not next to the React.
 */

/** An image already uploaded through /api/uploads/product-photo. */
export interface PhotoDraft {
  key: string
  url: string
}

/** One wholesale price break, still in the seller's own text. */
export interface TierDraft {
  minQty: string
  maxQty: string
  priceBani: string
}

export interface WizardValues {
  title: string
  description: string
  priceBani: string
  currency: string
  unit: Unit
  minOrderQty: string
  availableQty: string
  availability: Availability
  priceTiers: TierDraft[]
  originCountry: string
  productionPlace: string
  manufacturer: string
  batchNumber: string
  producedAt: string
  bestBefore: string
  storageConditions: string
  storageTempC: string
  allergens: string
  composition: string
  packaging: string
  supplyRegularity: string
  deliveryTerms: string
  deliveryPriceBani: string
  pickupAvailable: boolean
  deliveryRegions: string[]
  videoUrl: string
  photos: PhotoDraft[]
  documentIds: string[]
}

export function emptyWizardValues(): WizardValues {
  return {
    title: '',
    description: '',
    priceBani: '',
    currency: 'MDL',
    unit: 'KG',
    minOrderQty: '',
    availableQty: '',
    availability: 'IN_STOCK',
    priceTiers: [],
    originCountry: '',
    productionPlace: '',
    manufacturer: '',
    batchNumber: '',
    producedAt: '',
    bestBefore: '',
    storageConditions: '',
    storageTempC: '',
    allergens: '',
    composition: '',
    packaging: '',
    supplyRegularity: '',
    deliveryTerms: '',
    deliveryPriceBani: '',
    pickupAvailable: false,
    deliveryRegions: [],
    videoUrl: '',
    photos: [],
    documentIds: [],
  }
}
