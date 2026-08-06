import 'server-only'
import { headers } from 'next/headers'
import { db } from '@/server/db'
import { decodeRecord, encodeJson, type JsonRecord } from '@/lib/json'

/**
 * Audit trail for staff actions.
 *
 * Every moderator and admin mutation writes exactly one row here. That is not a nice
 * extra: this platform lets a handful of people block a company, hide a review and move
 * money between ledger accounts, and "who changed this, when, and why" has to be
 * answerable months later without reading application logs that have long rotated away.
 *
 * `oldValue` / `newValue` are JSON *strings* — the schema has no Json column type,
 * because it must run on SQLite as well as PostgreSQL (see prisma/schema.prisma). They
 * are written through `encodeJson` and read back through `decodeRecord`, which never
 * throws on malformed data.
 *
 * Action names follow `<surface>.<entity>.<verb>`:
 *   moderation.product.approve, admin.user.role, admin.company.balance
 * The prefix is what makes the moderator decision journal a single indexed query.
 */

export const AUDIT_MODERATION_PREFIX = 'moderation.'
export const AUDIT_ADMIN_PREFIX = 'admin.'

export interface AuditEntryInput {
  /** Null only for system-initiated changes (cron); staff actions always carry an id. */
  actorId: string | null
  action: string
  entityType: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
  reason?: string | null
  /** Omit to have the caller's address read off the request headers. */
  ip?: string | null
}

/**
 * Best-effort caller address.
 *
 * `headers()` throws outside a request scope (a cron script, a unit test), and an audit
 * row without an IP is still a valid audit row — so the failure degrades to null rather
 * than taking the mutation down with it.
 */
export function requestIp(): string | null {
  try {
    const list = headers()
    const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim()
    const value = forwarded || list.get('x-real-ip')?.trim() || null
    return value ? value.slice(0, 64) : null
  } catch {
    return null
  }
}

export async function recordAudit(input: AuditEntryInput): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue === undefined ? null : encodeJson(input.oldValue),
      newValue: input.newValue === undefined ? null : encodeJson(input.newValue),
      reason: input.reason ?? null,
      ip: input.ip === undefined ? requestIp() : input.ip,
    },
  })
}

// --- diffing -----------------------------------------------------------------

export interface FieldDiff {
  before: JsonRecord
  after: JsonRecord
}

/** Dates and undefined do not survive a JSON round trip usefully; normalize first. */
function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined) return null
  return value
}

function sameValue(a: unknown, b: unknown): boolean {
  const left = serializeValue(a)
  const right = serializeValue(b)
  if (left === right) return true
  if (left === null || right === null) return false
  if (typeof left === 'object' || typeof right === 'object') {
    return encodeJson(left) === encodeJson(right)
  }
  return false
}

/**
 * Keeps only the fields that actually changed.
 *
 * A full row snapshot on both sides makes the audit page unreadable and quietly copies
 * personal data into a second table; a two-field diff is what an operator can actually
 * review. Keys are taken from `after`, so a partial update is diffed against the
 * matching subset of `before`.
 */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): FieldDiff {
  const changedBefore: JsonRecord = {}
  const changedAfter: JsonRecord = {}

  for (const key of Object.keys(after)) {
    const previous = before[key]
    const next = after[key]
    if (sameValue(previous, next)) continue
    changedBefore[key] = serializeValue(previous)
    changedAfter[key] = serializeValue(next)
  }

  return { before: changedBefore, after: changedAfter }
}

/** True when `diff()` found nothing — lets a caller skip a pointless audit row. */
export function isEmptyDiff(value: FieldDiff): boolean {
  return Object.keys(value.after).length === 0
}

// --- reading -----------------------------------------------------------------

export interface AuditFilter {
  actorId?: string | undefined
  entityType?: string | undefined
  entityId?: string | undefined
  /** e.g. AUDIT_MODERATION_PREFIX for the moderator decision journal. */
  actionPrefix?: string | undefined
  from?: Date | undefined
  to?: Date | undefined
  page?: number
  pageSize?: number
}

export interface AuditRow {
  id: string
  action: string
  entityType: string
  entityId: string
  reason: string | null
  ip: string | null
  createdAt: Date
  actor: { id: string; name: string } | null
  oldValue: JsonRecord
  newValue: JsonRecord
}

export interface AuditPage {
  items: AuditRow[]
  total: number
  page: number
  pageCount: number
}

export const AUDIT_PAGE_SIZE = 30

export async function listAudit(filter: AuditFilter = {}): Promise<AuditPage> {
  const pageSize = Math.min(Math.max(filter.pageSize ?? AUDIT_PAGE_SIZE, 1), 100)
  const page = Math.max(filter.page ?? 1, 1)

  const createdAt =
    filter.from || filter.to
      ? { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) }
      : undefined

  const where = {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.actionPrefix ? { action: { startsWith: filter.actionPrefix } } : {}),
    ...(createdAt ? { createdAt } : {}),
  }

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
        ip: true,
        createdAt: true,
        oldValue: true,
        newValue: true,
        actor: { select: { id: true, name: true } },
      },
    }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      reason: row.reason,
      ip: row.ip,
      createdAt: row.createdAt,
      actor: row.actor,
      oldValue: decodeRecord(row.oldValue),
      newValue: decodeRecord(row.newValue),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Distinct actors that have ever written an audit row — populates the filter select. */
export async function listAuditActors(): Promise<{ id: string; name: string }[]> {
  const rows = await db.auditLog.findMany({
    where: { actorId: { not: null } },
    distinct: ['actorId'],
    select: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return rows
    .map((row) => row.actor)
    .filter((actor): actor is { id: string; name: string } => actor !== null)
}
