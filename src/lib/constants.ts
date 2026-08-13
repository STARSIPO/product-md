/**
 * Domain vocabularies.
 *
 * The database stores these as plain strings (the schema avoids native enums so it
 * can run on both PostgreSQL and SQLite — see prisma/schema.prisma). This module is
 * the single source of truth that gives them back their types: every value is a
 * `const` tuple, so TypeScript narrows to a union and Zod validates at the edge.
 *
 * Labels are never here — they live in the i18n dictionaries, keyed by these codes.
 */

function union<const T extends readonly string[]>(values: T) {
  return values
}

// --- platform & company ------------------------------------------------------

export const USER_ROLES = union(['USER', 'MODERATOR', 'ADMIN'])
export type UserRole = (typeof USER_ROLES)[number]

export const USER_STATUSES = union(['ACTIVE', 'BLOCKED', 'DELETED'])
export type UserStatus = (typeof USER_STATUSES)[number]

export const COMPANY_STATUSES = union(['ACTIVE', 'SUSPENDED', 'BLOCKED'])
export type CompanyStatus = (typeof COMPANY_STATUSES)[number]

export const ORG_TYPES = union(['SRL', 'SA', 'II', 'GT', 'PFA', 'NGO', 'OTHER'])
export type OrgType = (typeof ORG_TYPES)[number]

/**
 * What the business IS, as opposed to which side of the market it plays.
 *
 * A supermarket chain buys wholesale and sells on, so `isBuyer`/`isSeller` cannot
 * express it — those describe the marketplace role, this describes the company.
 */
export const COMPANY_KINDS = union([
  'FARM',
  'PRODUCER',
  'WHOLESALER',
  'RETAIL_CHAIN',
  'HORECA',
  'OTHER',
])
export type CompanyKind = (typeof COMPANY_KINDS)[number]

/** Company kinds that may switch on the consumer-facing delivery storefront. */
export const RETAIL_CAPABLE_KINDS: readonly CompanyKind[] = [
  'RETAIL_CHAIN',
  'PRODUCER',
  'FARM',
  'WHOLESALER',
]

export const COMPANY_MEMBER_ROLES = union(['OWNER', 'MANAGER'])
export type CompanyMemberRole = (typeof COMPANY_MEMBER_ROLES)[number]

// --- verification ------------------------------------------------------------

export const VERIFICATION_TYPES = union([
  'PHONE',
  'EMAIL',
  'COMPANY',
  'IDNO',
  'DOCUMENTS',
  'ANSA',
  'BANK',
  'TRUSTED_SUPPLIER',
])
export type VerificationType = (typeof VERIFICATION_TYPES)[number]

export const VERIFICATION_STATUSES = union(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'])
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const DOCUMENT_TYPES = union([
  'REGISTRATION',
  'PERMIT',
  'CERTIFICATE',
  'ANSA',
  'ORIGIN',
  'BANK',
  'OTHER',
])
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_STATUSES = union([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
  'EXPIRED',
])
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

// --- units -------------------------------------------------------------------

export const UNITS = union(['KG', 'T', 'G', 'L', 'ML', 'PCS', 'BOX', 'PACK', 'PALLET', 'SET'])
export type Unit = (typeof UNITS)[number]

// --- listings ----------------------------------------------------------------

export const PRODUCT_STATUSES = union([
  'DRAFT',
  'PENDING',
  'CHANGES_REQUESTED',
  'ACTIVE',
  'PAUSED',
  'REJECTED',
  'SOLD_OUT',
  'EXPIRED',
  'ARCHIVED',
  'BLOCKED',
])
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

/** Statuses a guest is allowed to see. Used as the default filter on every public query. */
export const PUBLIC_PRODUCT_STATUSES: readonly ProductStatus[] = ['ACTIVE']

export const AVAILABILITY = union(['IN_STOCK', 'PRE_ORDER', 'OUT_OF_STOCK'])
export type Availability = (typeof AVAILABILITY)[number]

export const SUPPLY_REGULARITY = union([
  'ONE_TIME',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'SEASONAL',
  'CONSTANT',
])
export type SupplyRegularity = (typeof SUPPLY_REGULARITY)[number]

// --- purchase requests -------------------------------------------------------

export const REQUEST_STATUSES = union([
  'DRAFT',
  'ACTIVE',
  'RECEIVING_OFFERS',
  'SUPPLIER_SELECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
])
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** A request in one of these states still accepts new offers. */
export const REQUEST_OPEN_STATUSES: readonly RequestStatus[] = ['ACTIVE', 'RECEIVING_OFFERS']

export const REQUEST_VISIBILITY = union(['PUBLIC', 'PRIVATE'])
export type RequestVisibility = (typeof REQUEST_VISIBILITY)[number]

export const REQUEST_FREQUENCY = union(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'])
export type RequestFrequency = (typeof REQUEST_FREQUENCY)[number]

// --- offers ------------------------------------------------------------------

export const OFFER_STATUSES = union([
  'SENT',
  'VIEWED',
  'SHORTLISTED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
])
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export const PAYMENT_METHODS = union(['CASH', 'TRANSFER', 'CARD', 'DEFERRED'])
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

// --- deals -------------------------------------------------------------------

export const DEAL_STATUSES = union([
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
])
export type DealStatus = (typeof DEAL_STATUSES)[number]

/**
 * Allowed state transitions. Both the server action and the UI read this map, so an
 * impossible transition cannot be produced by a crafted request or a stale button.
 */
export const DEAL_TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {
  AWAITING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED', 'DISPUTED'],
  PREPARING: ['SHIPPED', 'CANCELLED', 'DISPUTED'],
  SHIPPED: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ['CONFIRMED', 'CANCELLED', 'COMPLETED'],
}

// --- retail delivery ---------------------------------------------------------

export const RETAIL_ORDER_STATUSES = union([
  'NEW',
  'CONFIRMED',
  'PREPARING',
  'DELIVERING',
  'DELIVERED',
  'CANCELLED',
])
export type RetailOrderStatus = (typeof RETAIL_ORDER_STATUSES)[number]

/**
 * Allowed transitions for a consumer order. Simpler than a Deal: there is no
 * two-sided confirmation, the seller drives the order forward and either side can
 * cancel until it is out for delivery.
 */
export const RETAIL_ORDER_TRANSITIONS: Record<RetailOrderStatus, readonly RetailOrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['DELIVERING', 'CANCELLED'],
  DELIVERING: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

/** Discounts below this are not worth a badge — they read as noise, not a saving. */
export const MIN_DISCOUNT_PERCENT = 3

// --- messaging ---------------------------------------------------------------

export const CONVERSATION_TYPES = union(['PRODUCT', 'REQUEST', 'OFFER', 'DEAL', 'DIRECT'])
export type ConversationType = (typeof CONVERSATION_TYPES)[number]

export const MESSAGE_KINDS = union(['USER', 'SYSTEM'])
export type MessageKind = (typeof MESSAGE_KINDS)[number]

// --- reviews & complaints ----------------------------------------------------

export const REVIEW_DIRECTIONS = union(['BUYER_TO_SELLER', 'SELLER_TO_BUYER'])
export type ReviewDirection = (typeof REVIEW_DIRECTIONS)[number]

export const BUYER_REVIEW_CRITERIA = union([
  'quality',
  'description',
  'delivery',
  'communication',
  'documents',
])
export type BuyerReviewCriterion = (typeof BUYER_REVIEW_CRITERIA)[number]

export const SELLER_REVIEW_CRITERIA = union(['communication', 'payment', 'agreement'])
export type SellerReviewCriterion = (typeof SELLER_REVIEW_CRITERIA)[number]

export const COMPLAINT_ENTITIES = union([
  'PRODUCT',
  'COMPANY',
  'MESSAGE',
  'OFFER',
  'DOCUMENT',
  'REVIEW',
  'DEAL',
  'REQUEST',
])
export type ComplaintEntity = (typeof COMPLAINT_ENTITIES)[number]

export const COMPLAINT_REASONS = union([
  'FRAUD',
  'PROHIBITED',
  'WRONG_PRICE',
  'FAKE_DOCUMENTS',
  'UNSAFE_PRODUCT',
  'SPAM',
  'ABUSE',
  'COPYRIGHT',
  'OTHER',
])
export type ComplaintReason = (typeof COMPLAINT_REASONS)[number]

export const COMPLAINT_STATUSES = union(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'])
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

// --- money -------------------------------------------------------------------

export const LEDGER_TYPES = union([
  'TOP_UP',
  'LISTING_DAILY',
  'PROMOTION',
  'REFUND',
  'BONUS',
  'ADJUSTMENT',
])
export type LedgerType = (typeof LEDGER_TYPES)[number]

export const PAYMENT_STATUSES = union(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'])
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PROMOTION_TYPES = union([
  'BUMP',
  'PIN_CATEGORY',
  'HOMEPAGE',
  'HIGHLIGHT',
  'URGENT',
  'NEWSLETTER',
])
export type PromotionType = (typeof PROMOTION_TYPES)[number]

/** Default catalogue. An admin can override any of these at runtime via Tariff. */
export const DEFAULT_TARIFFS: Record<string, { priceBani: number; unit: 'DAY' | 'ITEM' }> = {
  LISTING_DAILY: { priceBani: 100, unit: 'DAY' },
  PROMO_BUMP: { priceBani: 500, unit: 'ITEM' },
  PROMO_PIN_CATEGORY: { priceBani: 1500, unit: 'DAY' },
  PROMO_HOMEPAGE: { priceBani: 3000, unit: 'DAY' },
  PROMO_HIGHLIGHT: { priceBani: 800, unit: 'DAY' },
  PROMO_URGENT: { priceBani: 600, unit: 'DAY' },
  PROMO_NEWSLETTER: { priceBani: 5000, unit: 'ITEM' },
}

export const TOP_UP_PRESETS_BANI = [3000, 9000, 18000, 36500] as const

// --- feature flags -----------------------------------------------------------

/**
 * Monetisation is flag-gated: the plan is to launch free and switch billing on once
 * there is enough supply. An admin flipping BILLING_ENABLED off makes every listing
 * free immediately, without a deploy.
 */
export const FEATURE_FLAGS = union([
  'BILLING_ENABLED',
  'PROMOTIONS_ENABLED',
  'REQUIRE_MODERATION',
  'PHONE_AUTH_ENABLED',
  'REGISTRATION_OPEN',
  'PUBLIC_REQUESTS_ENABLED',
  'REQUIRE_ADMIN_2FA',
])
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  BILLING_ENABLED: false,
  PROMOTIONS_ENABLED: true,
  REQUIRE_MODERATION: true,
  PHONE_AUTH_ENABLED: true,
  REGISTRATION_OPEN: true,
  PUBLIC_REQUESTS_ENABLED: true,
  // On by default: the admin panel can change roles, adjust balances and switch
  // billing off, so a stolen password alone must not be enough. The owner can turn it
  // off from Feature flags for a demo, which is a deliberate, audited choice rather
  // than a gap.
  REQUIRE_ADMIN_2FA: true,
}

// --- notifications -----------------------------------------------------------

export const NOTIFICATION_TYPES = union([
  'NEW_MESSAGE',
  'NEW_OFFER',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'NEW_REQUEST_MATCH',
  'NEW_PRODUCT_MATCH',
  'PRICE_DROP',
  'DEAL_STATUS',
  'REVIEW_RECEIVED',
  'LISTING_EXPIRING',
  'LOW_BALANCE',
  'DOCUMENT_EXPIRING',
  'MODERATION_RESULT',
  'COMPLAINT_RESULT',
])
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_CHANNELS = union(['IN_APP', 'EMAIL', 'SMS', 'PUSH', 'TELEGRAM'])
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

// --- search ------------------------------------------------------------------

export const PRODUCT_SORTS = union([
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'rating',
  'popular',
])
export type ProductSort = (typeof PRODUCT_SORTS)[number]

export const REQUEST_SORTS = union(['newest', 'deadline', 'budget_desc', 'offers'])
export type RequestSort = (typeof REQUEST_SORTS)[number]

export const PAGE_SIZE = 24
export const MAX_PAGE_SIZE = 60

// --- uploads -----------------------------------------------------------------

export const IMAGE_MIME_TYPES = union(['image/jpeg', 'image/png', 'image/webp'])
export const DOCUMENT_MIME_TYPES = union(['application/pdf', 'image/jpeg', 'image/png'])

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_PRODUCT_PHOTOS = 10
