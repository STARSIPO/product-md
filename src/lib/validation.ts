import { z } from 'zod'
import {
  AVAILABILITY,
  COMPANY_KINDS,
  COMPLAINT_ENTITIES,
  COMPLAINT_REASONS,
  DOCUMENT_TYPES,
  ORG_TYPES,
  PAYMENT_METHODS,
  PRODUCT_SORTS,
  REQUEST_FREQUENCY,
  REQUEST_SORTS,
  REQUEST_VISIBILITY,
  SUPPLY_REGULARITY,
  UNITS,
} from './constants'
import { parseAmountToBani } from './money'

/**
 * Validation schemas shared by the client form and the server action.
 *
 * Every message is a *key* from the `validation` section of the dictionary, not a
 * sentence — the same schema then produces a Russian message in one form and a
 * Romanian one in the other, and the server never has to guess the caller's locale.
 *
 * The client copy of these rules is a convenience. The server re-validates
 * everything; a hand-crafted POST gets exactly the same treatment as the UI.
 */

const REQUIRED = 'required'

export const localeSchema = z.enum(['ru', 'ro'])

/** Trimmed non-empty string with a length ceiling. */
const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? REQUIRED : 'minLength')
    .max(max, 'maxLength')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'maxLength')
    .optional()
    .transform((value) => (value === '' ? undefined : value))

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, REQUIRED)
  .email('email')
  .max(254, 'maxLength')

/** Moldovan mobile/landline in any common local form; normalized to E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, REQUIRED)
  .transform((value) => value.replace(/[\s()\-.]/g, ''))
  .refine((value) => /^(\+?373|0)\d{8}$/.test(value), 'phone')
  .transform((value) => {
    if (value.startsWith('+373')) return value
    if (value.startsWith('373')) return `+${value}`
    return `+373${value.slice(1)}`
  })

export const passwordSchema = z
  .string()
  .min(8, 'passwordWeak')
  .max(200, 'maxLength')
  .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), 'passwordWeak')

/** Accepts "95.50" or "95,50" and yields integer bani. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value.trim()))
  .refine((value) => value !== '', REQUIRED)
  .transform((value, ctx) => {
    const bani = parseAmountToBani(value)
    if (bani === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price' })
      return z.NEVER
    }
    return bani
  })

export const optionalMoneySchema = z
  .union([z.string(), z.number(), z.undefined(), z.null()])
  .transform((value) => {
    if (value === undefined || value === null) return ''
    return typeof value === 'number' ? value.toFixed(2) : value.trim()
  })
  .transform((value, ctx) => {
    if (value === '') return undefined
    const bani = parseAmountToBani(value)
    if (bani === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price' })
      return z.NEVER
    }
    return bani
  })

/** Quantities may be fractional (2.5 kg) but never negative or absurd. */
export const quantitySchema = z.coerce
  .number({ invalid_type_error: 'positive' })
  .positive('positive')
  .max(10_000_000, 'max')

export const optionalQuantitySchema = z
  .union([z.string(), z.number(), z.undefined(), z.null()])
  .transform((value) => (value === '' || value === undefined || value === null ? undefined : value))
  .pipe(quantitySchema.optional())

export const unitSchema = z.enum(UNITS)
export const idSchema = z.string().min(1, REQUIRED).max(40)
export const optionalIdSchema = z
  .string()
  .max(40)
  .optional()
  .transform((value) => (value === '' ? undefined : value))

const optionalDateSchema = z
  .union([z.string(), z.date(), z.undefined(), z.null()])
  .transform((value) => {
    if (value === undefined || value === null || value === '') return undefined
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  })

const futureDateSchema = optionalDateSchema.refine(
  (value) => value === undefined || value.getTime() > Date.now() - 24 * 60 * 60 * 1000,
  'dateFuture',
)

const checkbox = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === 'on')

// --- auth --------------------------------------------------------------------

export const registerSchema = z
  .object({
    name: text(120, 2),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    acceptTerms: checkbox.refine((value) => value, 'acceptTerms'),
    locale: localeSchema.default('ru'),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'passwordMismatch',
    path: ['passwordConfirm'],
  })

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, REQUIRED),
  next: z.string().max(500).optional(),
})

export const phoneStartSchema = z.object({
  phone: phoneSchema,
  locale: localeSchema.default('ru'),
})

export const phoneVerifySchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'invalidCode'),
  name: optionalText(120),
  acceptTerms: checkbox.optional(),
})

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, REQUIRED),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'passwordMismatch',
    path: ['passwordConfirm'],
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, REQUIRED),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'passwordMismatch',
    path: ['passwordConfirm'],
  })

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'invalidCode'),
})

// --- company -----------------------------------------------------------------

export const companyRoleSchema = z
  .object({
    isBuyer: checkbox,
    isSeller: checkbox,
  })
  .refine((data) => data.isBuyer || data.isSeller, {
    message: 'selectOption',
    path: ['isBuyer'],
  })

/** IDNO is Moldova's 13-digit state registration number. */
export const idnoSchema = z
  .string()
  .trim()
  .regex(/^\d{13}$/, 'idno')
  .optional()
  .or(z.literal('').transform(() => undefined))

const workingHoursDaySchema = z
  .object({ from: z.string().max(5), to: z.string().max(5) })
  .nullable()

export const workingHoursSchema = z.object({
  mon: workingHoursDaySchema,
  tue: workingHoursDaySchema,
  wed: workingHoursDaySchema,
  thu: workingHoursDaySchema,
  fri: workingHoursDaySchema,
  sat: workingHoursDaySchema,
  sun: workingHoursDaySchema,
})

export type WorkingHours = z.infer<typeof workingHoursSchema>

export const companySchema = z.object({
  legalName: text(200, 2),
  displayName: text(120, 2),
  idno: idnoSchema,
  orgType: z.enum(ORG_TYPES).default('SRL'),
  description: optionalText(4000),
  phone: phoneSchema.optional().or(z.literal('').transform(() => undefined)),
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine(
      (value) => value === undefined || /^https?:\/\/[^\s.]+\.[^\s]{2,}$/.test(value),
      'url',
    ),
  contactPerson: optionalText(120),
  districtId: optionalIdSchema,
  localityId: optionalIdSchema,
  address: optionalText(250),
  deliveryTerms: optionalText(1000),
  minOrderBani: optionalMoneySchema,
  pickupAvailable: checkbox.optional(),
  isBuyer: checkbox,
  isSeller: checkbox,
  languages: z.array(z.string().max(5)).max(5).optional(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(4).optional(),
  deliveryZones: z.array(z.string().max(40)).max(40).optional(),

  kind: z.enum(COMPANY_KINDS).default('OTHER'),

  // Consumer delivery is opt-in and has its own terms — a farm supplying restaurants
  // should not find itself listed in a shopping storefront by accident.
  isRetail: checkbox.optional(),
  retailDeliveryFeeBani: optionalMoneySchema,
  retailFreeFromBani: optionalMoneySchema,
  retailDeliveryNote: optionalText(500),
})

// --- products ----------------------------------------------------------------

export const priceTierSchema = z.object({
  minQty: quantitySchema,
  maxQty: optionalQuantitySchema,
  priceBani: moneySchema,
})

export const priceTiersSchema = z
  .array(priceTierSchema)
  .max(10)
  .superRefine((tiers, ctx) => {
    tiers.forEach((tier, index) => {
      if (tier.maxQty !== undefined && tier.maxQty <= tier.minQty) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tierOrder',
          path: [index, 'maxQty'],
        })
      }
    })

    // Ranges must not overlap or the resolved unit price becomes ambiguous.
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty)
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]
      const current = sorted[i]
      if (!previous || !current) continue
      const previousMax = previous.maxQty ?? Number.POSITIVE_INFINITY
      if (current.minQty <= previousMax) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tierOverlap', path: [i, 'minQty'] })
      }
    }
  })

export const productAttributeValueSchema = z.object({
  attributeId: idSchema,
  valueText: z.string().max(500).optional(),
  valueNumber: z.coerce.number().optional(),
  valueBool: z.boolean().optional(),
  valueDate: optionalDateSchema,
  optionId: optionalIdSchema,
})

export const productSchema = z.object({
  title: text(160, 3),
  description: optionalText(8000),
  categoryId: idSchema,
  priceBani: moneySchema,
  unit: unitSchema,
  minOrderQty: quantitySchema.default(1),
  availableQty: optionalQuantitySchema,
  availability: z.enum(AVAILABILITY).default('IN_STOCK'),
  originCountry: optionalText(80),
  productionPlace: optionalText(120),
  manufacturer: optionalText(120),
  batchNumber: optionalText(60),
  producedAt: optionalDateSchema,
  bestBefore: optionalDateSchema,
  storageConditions: optionalText(500),
  storageTempC: optionalText(40),
  allergens: optionalText(500),
  composition: optionalText(1000),
  packaging: optionalText(300),
  supplyRegularity: z.enum(SUPPLY_REGULARITY).optional(),
  deliveryTerms: optionalText(1000),
  deliveryPriceBani: optionalMoneySchema,
  pickupAvailable: checkbox.optional(),
  deliveryRegions: z.array(z.string().max(40)).max(40).optional(),
  videoUrl: optionalText(300),
  priceTiers: priceTiersSchema.optional(),
  attributes: z.array(productAttributeValueSchema).max(40).optional(),

  // Retail availability. Wholesale sells 20 kg to a restaurant; the same listing may
  // also sell 1 kg to a household, usually at a different price.
  isRetail: checkbox.optional(),
  retailPriceBani: optionalMoneySchema,
  retailMinQty: optionalQuantitySchema,
})

export type ProductInput = z.infer<typeof productSchema>

/**
 * Setting or clearing a discount.
 *
 * `salePriceBani: null` ends the sale. The service restores the remembered original
 * price, so the form never has to ask the seller what it used to be.
 */
export const productSaleSchema = z
  .object({
    productId: idSchema,
    salePriceBani: optionalMoneySchema,
    endsAt: futureDateSchema,
  })
  .refine((data) => data.salePriceBani === undefined || data.salePriceBani > 0, {
    message: 'positive',
    path: ['salePriceBani'],
  })

// --- retail delivery ---------------------------------------------------------

export const cartLineSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
})

export const retailOrderSchema = z.object({
  sellerCompanyId: idSchema,
  lines: z.array(cartLineSchema).min(1, REQUIRED).max(60),
  customerName: text(120, 2),
  customerPhone: phoneSchema,
  customerEmail: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  deliveryAddress: text(250, 5),
  deliveryLocalityId: optionalIdSchema,
  deliveryNote: optionalText(500),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
})

export type RetailOrderInput = z.infer<typeof retailOrderSchema>

export const retailOrderStatusSchema = z.object({
  orderId: idSchema,
  status: z.enum(['NEW', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'CANCELLED']),
  reason: optionalText(500),
})

// --- purchase requests -------------------------------------------------------

export const purchaseRequestSchema = z
  .object({
    title: text(160, 3),
    description: optionalText(8000),
    categoryId: idSchema,
    quantity: quantitySchema,
    unit: unitSchema,
    desiredPriceBani: optionalMoneySchema,
    maxBudgetBani: optionalMoneySchema,
    isRecurring: checkbox.optional(),
    frequency: z.enum(REQUEST_FREQUENCY).optional(),
    firstDeliveryAt: futureDateSchema,
    offersDeadlineAt: futureDateSchema,
    deliveryLocalityId: optionalIdSchema,
    deliveryAddress: optionalText(250),
    supplierRadiusKm: z.coerce.number().int().min(1).max(1000).optional(),
    documentRequirements: optionalText(1000),
    packagingRequirements: optionalText(1000),
    storageConditions: optionalText(500),
    allowPartial: checkbox.optional(),
    verifiedOnly: checkbox.optional(),
    isUrgent: checkbox.optional(),
    visibility: z.enum(REQUEST_VISIBILITY).default('PUBLIC'),
    attributes: z.array(productAttributeValueSchema).max(40).optional(),
  })
  .refine((data) => !data.isRecurring || data.frequency !== undefined, {
    message: 'selectOption',
    path: ['frequency'],
  })

export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>

// --- offers ------------------------------------------------------------------

export const offerSchema = z.object({
  requestId: idSchema,
  priceBani: moneySchema,
  quantity: quantitySchema,
  unit: unitSchema,
  deliveryPriceBani: optionalMoneySchema,
  deliveryAt: futureDateSchema,
  deliveryDays: z.coerce.number().int().min(0).max(365).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  validUntil: futureDateSchema,
  regularity: z.enum(SUPPLY_REGULARITY).optional(),
  comment: optionalText(3000),
  alternativeProductId: optionalIdSchema,
})

export type OfferInput = z.infer<typeof offerSchema>

// --- deals -------------------------------------------------------------------

export const dealFromProductSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
  deliveryAddress: optionalText(250),
  deliveryAt: futureDateSchema,
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  comment: optionalText(2000),
})

export const dealStatusSchema = z.object({
  dealId: idSchema,
  status: z.string().min(1),
  comment: optionalText(1000),
})

// --- messaging ---------------------------------------------------------------

export const messageSchema = z.object({
  conversationId: idSchema,
  body: text(4000, 1),
})

export const startConversationSchema = z.object({
  productId: optionalIdSchema,
  requestId: optionalIdSchema,
  offerId: optionalIdSchema,
  body: text(4000, 1),
})

// --- reviews & complaints ----------------------------------------------------

const ratingSchema = z.coerce.number().int().min(1, 'min').max(5, 'max')

export const reviewSchema = z.object({
  dealId: idSchema,
  overall: ratingSchema,
  criteria: z.record(ratingSchema),
  comment: optionalText(3000),
})

export const reviewReplySchema = z.object({
  reviewId: idSchema,
  body: text(2000, 1),
})

export const complaintSchema = z.object({
  entityType: z.enum(COMPLAINT_ENTITIES),
  entityId: idSchema,
  reason: z.enum(COMPLAINT_REASONS),
  description: optionalText(3000),
})

// --- verification ------------------------------------------------------------

export const documentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  number: optionalText(80),
  issuedAt: optionalDateSchema,
  expiresAt: optionalDateSchema,
  isPublic: checkbox.optional(),
})

// --- search & filters --------------------------------------------------------

export const productSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().max(120).optional(),
  priceMin: optionalMoneySchema,
  priceMax: optionalMoneySchema,
  unit: z.enum(UNITS).optional(),
  minOrderMax: optionalQuantitySchema,
  district: z.string().max(40).optional(),
  delivery: z.coerce.boolean().optional(),
  pickup: z.coerce.boolean().optional(),
  verified: z.coerce.boolean().optional(),
  origin: z.string().max(80).optional(),
  availability: z.enum(AVAILABILITY).optional(),
  regular: z.coerce.boolean().optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  since: z.enum(['24h', '7d', '30d']).optional(),
  sort: z.enum(PRODUCT_SORTS).default('relevance'),
  page: z.coerce.number().int().min(1).max(500).default(1),
})

export type ProductSearchParams = z.infer<typeof productSearchSchema>

export const requestSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().max(120).optional(),
  district: z.string().max(40).optional(),
  recurring: z.coerce.boolean().optional(),
  urgent: z.coerce.boolean().optional(),
  sort: z.enum(REQUEST_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).max(500).default(1),
})

export type RequestSearchParams = z.infer<typeof requestSearchSchema>

export const supplierSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  district: z.string().max(40).optional(),
  verified: z.coerce.boolean().optional(),
  category: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
})

// --- balance -----------------------------------------------------------------

export const topUpSchema = z.object({
  amountBani: moneySchema.refine((value) => value >= 1000, 'min'),
})

export const promotionSchema = z.object({
  productId: idSchema,
  type: z.enum(['BUMP', 'PIN_CATEGORY', 'HOMEPAGE', 'HIGHLIGHT', 'URGENT', 'NEWSLETTER']),
  days: z.coerce.number().int().min(1).max(30).default(7),
})

// --- moderation & admin ------------------------------------------------------

export const moderationDecisionSchema = z
  .object({
    entityId: idSchema,
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'BLOCK']),
    comment: optionalText(2000),
  })
  .refine((data) => data.decision === 'APPROVE' || (data.comment ?? '').length > 0, {
    message: REQUIRED,
    path: ['comment'],
  })

export const featureFlagSchema = z.object({
  key: z.string().min(1).max(60),
  enabled: checkbox,
})

export const tariffSchema = z.object({
  key: z.string().min(1).max(60),
  priceBani: moneySchema,
  isActive: checkbox.optional(),
})
