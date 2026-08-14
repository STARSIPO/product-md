'use client'

import { useSyncExternalStore } from 'react'
import { lineTotalBani } from '@/lib/money'

/**
 * The shopper's basket.
 *
 * It lives in `localStorage` and nowhere else. A household buyer is usually signed out —
 * asking them to register before they can put bread in a basket would end the visit — so
 * there is no server-side cart, no cart cookie and no anonymous cart row to garbage-collect.
 *
 * A cart holds exactly one shop. A courier collects from one address: a basket mixing a
 * farm in Orhei with a supermarket in Chișinău describes a delivery nobody can make. Adding
 * an item from another shop therefore asks first and replaces — it never silently merges.
 *
 * Everything stored here is a *snapshot for display*. Prices, minimums and availability are
 * re-read from the database when the order is placed (`placeRetailOrder`), so a basket left
 * open overnight is repriced rather than trusted.
 */

const STORAGE_KEY = 'pmd_retail_cart_v1'

/** Mirrors `retailOrderSchema.lines.max(60)` — the cart cannot build an order the server rejects. */
const MAX_LINES = 60
const MAX_QUANTITY = 100_000

export interface CartShop {
  companyId: string
  slug: string
  name: string
  /** null = the shop has not published a fee; it is quoted on confirmation. */
  deliveryFeeBani: number | null
  freeFromBani: number | null
}

export interface CartLine {
  productId: string
  slug: string
  title: string
  unit: string
  /** The retail price at the moment of adding — `retailPriceOf()` on the server. */
  unitPriceBani: number
  /** Previous price, when this item was on sale as it went into the basket. */
  oldPriceBani: number | null
  /** Doubles as the step of the ± control: a shop selling by 0.5 kg steps in 0.5 kg. */
  minQty: number
  quantity: number
  photoKey: string | null
}

export interface Cart {
  shop: CartShop
  lines: CartLine[]
}

/* -------------------------------------------------------------------------- */
/* store                                                                       */
/* -------------------------------------------------------------------------- */

let snapshot: Cart | null = null
let loaded = false
const listeners = new Set<() => void>()

/** Quantities may be fractional (0.5 kg); three decimals is past any real unit. */
function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNullableInt(value: unknown): number | null {
  const number = asFiniteNumber(value)
  return number === null ? null : Math.round(number)
}

/**
 * `localStorage` is user-editable, so a stored cart is parsed the same way a request body
 * would be: anything that does not match the shape is dropped rather than trusted.
 */
function parseCart(raw: string | null): Cart | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const shopValue = parsed.shop
  const linesValue = parsed.lines
  if (!isRecord(shopValue) || !Array.isArray(linesValue)) return null

  const companyId = typeof shopValue.companyId === 'string' ? shopValue.companyId : null
  const slug = typeof shopValue.slug === 'string' ? shopValue.slug : null
  const name = typeof shopValue.name === 'string' ? shopValue.name : null
  if (companyId === null || slug === null || name === null) return null

  const shop: CartShop = {
    companyId,
    slug,
    name,
    deliveryFeeBani: asNullableInt(shopValue.deliveryFeeBani),
    freeFromBani: asNullableInt(shopValue.freeFromBani),
  }

  const lines: CartLine[] = []
  for (const entry of linesValue) {
    if (!isRecord(entry)) continue

    const productId = typeof entry.productId === 'string' ? entry.productId : null
    const title = typeof entry.title === 'string' ? entry.title : null
    const unitPriceBani = asNullableInt(entry.unitPriceBani)
    const quantity = asFiniteNumber(entry.quantity)
    if (productId === null || title === null || unitPriceBani === null || quantity === null) {
      continue
    }

    const minQty = asFiniteNumber(entry.minQty)

    lines.push({
      productId,
      slug: typeof entry.slug === 'string' ? entry.slug : '',
      title,
      unit: typeof entry.unit === 'string' ? entry.unit : 'PCS',
      unitPriceBani: Math.max(0, unitPriceBani),
      oldPriceBani: asNullableInt(entry.oldPriceBani),
      minQty: minQty !== null && minQty > 0 ? roundQty(minQty) : 1,
      quantity: Math.min(MAX_QUANTITY, Math.max(0, roundQty(quantity))),
      photoKey: typeof entry.photoKey === 'string' ? entry.photoKey : null,
    })

    if (lines.length >= MAX_LINES) break
  }

  if (lines.length === 0) return null
  return { shop, lines }
}

function read(): Cart | null {
  if (typeof window === 'undefined') return null
  try {
    return parseCart(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    // Private-browsing modes throw on access rather than returning null.
    return null
  }
}

function write(next: Cart | null): void {
  snapshot = next
  loaded = true

  try {
    if (next === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A full or blocked storage must not break the basket for this page view.
  }

  for (const listener of listeners) listener()
}

/**
 * A second tab editing the same basket updates this one. The event carries no usable
 * payload across browsers, so the value is simply re-read.
 *
 * One window listener for the whole page, not one per subscriber: a catalogue grid has
 * two dozen add-to-cart controls and each of them subscribes.
 */
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== STORAGE_KEY) return
  snapshot = read()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

/** Must return a stable reference between changes or React re-renders forever. */
function getSnapshot(): Cart | null {
  if (!loaded) {
    snapshot = read()
    loaded = true
  }
  return snapshot
}

/** The server has no basket. Rendering null on both sides keeps hydration honest. */
function getServerSnapshot(): Cart | null {
  return null
}

/**
 * The basket, or null.
 *
 * Null on the server and on the very first client render, which is why every consumer
 * treats "no cart yet" as a normal state rather than a loading one.
 */
export function useCart(): Cart | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** The quantity of one product in the basket, or 0. */
export function useLineQuantity(productId: string): number {
  const cart = useCart()
  return cart?.lines.find((line) => line.productId === productId)?.quantity ?? 0
}

/* -------------------------------------------------------------------------- */
/* mutations                                                                   */
/* -------------------------------------------------------------------------- */

export type AddResult = 'added' | 'other-shop' | 'full'

/**
 * Adds one item.
 *
 * Returns `other-shop` instead of replacing when the basket belongs to somebody else —
 * the decision to throw away a basket belongs to the shopper, so the caller has to ask
 * and come back with `replaceCart`.
 */
export function addLine(shop: CartShop, line: Omit<CartLine, 'quantity'>): AddResult {
  const current = getSnapshot()

  if (current !== null && current.shop.companyId !== shop.companyId) return 'other-shop'

  if (current === null) {
    write({ shop, lines: [{ ...line, quantity: line.minQty }] })
    return 'added'
  }

  const existing = current.lines.find((each) => each.productId === line.productId)
  if (existing) {
    setQuantity(line.productId, roundQty(existing.quantity + line.minQty))
    return 'added'
  }

  if (current.lines.length >= MAX_LINES) return 'full'

  // The shop's own terms are refreshed on every add: a fee changed since the first
  // item went in should not be quoted from a stale snapshot.
  write({ shop, lines: [...current.lines, { ...line, quantity: line.minQty }] })
  return 'added'
}

/** Throws the current basket away and starts a new one at another shop. */
export function replaceCart(shop: CartShop, line: Omit<CartLine, 'quantity'>): void {
  write({ shop, lines: [{ ...line, quantity: line.minQty }] })
}

/** Below the shop's minimum the line is removed — there is no valid quantity between. */
export function setQuantity(productId: string, quantity: number): void {
  const current = getSnapshot()
  if (current === null) return

  const line = current.lines.find((each) => each.productId === productId)
  if (!line) return

  const next = roundQty(Math.min(MAX_QUANTITY, quantity))
  if (next < line.minQty) {
    removeLine(productId)
    return
  }

  write({
    shop: current.shop,
    lines: current.lines.map((each) =>
      each.productId === productId ? { ...each, quantity: next } : each,
    ),
  })
}

export function increaseLine(productId: string): void {
  const line = getSnapshot()?.lines.find((each) => each.productId === productId)
  if (!line) return
  setQuantity(productId, line.quantity + line.minQty)
}

export function decreaseLine(productId: string): void {
  const line = getSnapshot()?.lines.find((each) => each.productId === productId)
  if (!line) return
  setQuantity(productId, line.quantity - line.minQty)
}

export function removeLine(productId: string): void {
  const current = getSnapshot()
  if (current === null) return

  const lines = current.lines.filter((each) => each.productId !== productId)
  write(lines.length === 0 ? null : { shop: current.shop, lines })
}

export function clearCart(): void {
  write(null)
}

/**
 * Replaces the stored snapshot with server-verified rows.
 *
 * The cart page asks the server what these products cost *now*; anything the server did
 * not return has left the storefront and is dropped. This is a convenience for the
 * shopper, not a security measure — `placeRetailOrder` re-reads every price regardless.
 */
export function reconcileCart(shop: CartShop, lines: readonly Omit<CartLine, 'quantity'>[]): void {
  const current = getSnapshot()
  if (current === null || current.shop.companyId !== shop.companyId) return

  const fresh = new Map(lines.map((line) => [line.productId, line]))

  // Iterating the *cart's* order, not the server's: rows must not jump around under the
  // shopper's finger just because the database returned them differently.
  const next: CartLine[] = []
  for (const existing of current.lines) {
    const line = fresh.get(existing.productId)
    if (!line) continue
    next.push({ ...line, quantity: Math.max(existing.quantity, line.minQty) })
  }

  const unchanged =
    next.length === current.lines.length &&
    next.every((line, index) => isSame(line, current.lines[index])) &&
    shop.deliveryFeeBani === current.shop.deliveryFeeBani &&
    shop.freeFromBani === current.shop.freeFromBani &&
    shop.name === current.shop.name

  if (unchanged) return

  write(next.length === 0 ? null : { shop, lines: next })
}

function isSame(line: CartLine, other: CartLine | undefined): boolean {
  if (!other) return false
  return (
    line.productId === other.productId &&
    line.unitPriceBani === other.unitPriceBani &&
    line.oldPriceBani === other.oldPriceBani &&
    line.minQty === other.minQty &&
    line.quantity === other.quantity &&
    line.title === other.title
  )
}

/* -------------------------------------------------------------------------- */
/* totals                                                                      */
/* -------------------------------------------------------------------------- */

export interface CartTotals {
  itemsTotalBani: number
  /** What the delivery costs for this basket — already 0 when the threshold is met. */
  deliveryFeeBani: number
  /** False when the shop publishes no fee: the row reads "quoted by the shop". */
  deliveryKnown: boolean
  /** How much more is needed for free delivery, or 0 when there is nothing to reach. */
  freeFromLeftBani: number
  totalBani: number
  itemCount: number
}

/**
 * The same arithmetic as `placeRetailOrder`, deliberately duplicated on the client so the
 * shopper sees the number before submitting. The server's answer is the one that counts;
 * this one only has to agree with it.
 */
export function cartTotals(cart: Cart | null): CartTotals {
  if (cart === null) {
    return {
      itemsTotalBani: 0,
      deliveryFeeBani: 0,
      deliveryKnown: true,
      freeFromLeftBani: 0,
      totalBani: 0,
      itemCount: 0,
    }
  }

  const itemsTotalBani = cart.lines.reduce(
    (sum, line) => sum + lineTotalBani(line.quantity, line.unitPriceBani),
    0,
  )

  const freeFrom = cart.shop.freeFromBani
  const reachedFreeDelivery = freeFrom !== null && itemsTotalBani >= freeFrom
  const deliveryFeeBani = reachedFreeDelivery ? 0 : (cart.shop.deliveryFeeBani ?? 0)

  return {
    itemsTotalBani,
    deliveryFeeBani,
    deliveryKnown: cart.shop.deliveryFeeBani !== null,
    freeFromLeftBani: freeFrom !== null && !reachedFreeDelivery ? freeFrom - itemsTotalBani : 0,
    totalBani: itemsTotalBani + deliveryFeeBani,
    itemCount: cart.lines.length,
  }
}
