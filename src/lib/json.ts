import { z } from 'zod'

/**
 * The schema stores structured values (working hours, audit diffs, notification
 * params) in String columns, because Prisma's Json type is not available on SQLite
 * and the schema has to stay portable. These helpers are the only sanctioned way to
 * cross that boundary — they never throw on malformed data, they fall back.
 */

export function encodeJson(value: unknown): string {
  return JSON.stringify(value)
}

/** Parses a JSON column against a Zod schema, returning `fallback` on any problem. */
export function decodeJson<T>(raw: string | null | undefined, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = schema.safeParse(parsed)
    return result.success ? result.data : fallback
  } catch {
    return fallback
  }
}

/** Convenience for the very common `string[]` columns (delivery zones, languages). */
export function decodeStringArray(raw: string | null | undefined): string[] {
  return decodeJson(raw, z.array(z.string()), [])
}

export function encodeStringArray(values: readonly string[]): string {
  return JSON.stringify([...values])
}

/** Loose record used for audit diffs and notification params. */
export const jsonRecordSchema = z.record(z.unknown())
export type JsonRecord = z.infer<typeof jsonRecordSchema>

export function decodeRecord(raw: string | null | undefined): JsonRecord {
  return decodeJson(raw, jsonRecordSchema, {})
}
