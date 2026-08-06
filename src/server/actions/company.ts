'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { db, transaction } from '@/server/db'
import { env } from '@/env'
import { assertCompany, assertUser } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { destroySession, revokeOtherSessions } from '@/server/auth/session'
import { formatSecretForDisplay } from '@/server/auth/totp'
import { issueLinkToken } from '@/server/auth/tokens'
import { beginTotpEnrollment } from '@/server/actions/auth'
import { sendTemplateEmail } from '@/server/mail'
import {
  assertUploadAllowed,
  buildStorageKey,
  sniffMimeType,
  storage,
} from '@/server/storage'
import { getDictionary } from '@/lib/i18n'
import { localePath, LOCALES, type Locale } from '@/lib/i18n/config'
import { slugify } from '@/lib/normalize'
import { addDays } from '@/lib/utils'
import { encodeJson } from '@/lib/json'
import { MAX_IMAGE_BYTES } from '@/lib/constants'
import {
  companySchema,
  emailSchema,
  localeSchema,
  phoneSchema,
  workingHoursSchema,
} from '@/lib/validation'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Company profile and account-level settings — the two things a signed-in user owns
 * about themselves.
 *
 * Nothing here trusts a company id or a role from the caller: `assertCompany()`
 * re-resolves both from the session on every call, so a crafted request can only ever
 * edit the company the session actually belongs to. `completeOnboarding` is the single
 * place a Company row is created, and it refuses to run twice for the same user.
 */

const MAX_COMPANY_PHOTOS = 12

/** Company profile + the working-hours JSON column, which lives outside companySchema. */
const companyProfileSchema = companySchema.extend({
  workingHours: workingHoursSchema.optional(),
})

/** The raw shape the wizard and the profile form submit, before coercion. */
export type CompanyFormInput = z.input<typeof companyProfileSchema>

const accountSettingsSchema = z.object({
  name: z.string().trim().min(2, 'minLength').max(120, 'maxLength'),
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  phone: phoneSchema.optional().or(z.literal('').transform(() => undefined)),
  locale: localeSchema,
})

const deleteAccountSchema = z.object({
  confirm: z.string().trim().min(1, 'required'),
})

const idSchema = z.string().min(1, 'required').max(40)

async function uniqueCompanySlug(displayName: string): Promise<string> {
  const base = slugify(displayName)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`
    const existing = await db.company.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }

  return `${base}-${Date.now().toString(36)}`
}

/** The column values shared by "create profile" and "edit profile". */
function toCompanyColumns(input: z.output<typeof companyProfileSchema>) {
  return {
    legalName: input.legalName,
    displayName: input.displayName,
    idno: input.idno ?? null,
    orgType: input.orgType,
    description: input.description ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    contactPerson: input.contactPerson ?? null,
    districtId: input.districtId ?? null,
    localityId: input.localityId ?? null,
    address: input.address ?? null,
    // JSON lives in String columns — the schema has to stay portable to SQLite.
    workingHours: input.workingHours ? encodeJson(input.workingHours) : null,
    paymentMethods: input.paymentMethods ? encodeJson(input.paymentMethods) : null,
    languages: input.languages ? encodeJson(input.languages) : null,
    deliveryZones: input.deliveryZones ? encodeJson(input.deliveryZones) : null,
    deliveryTerms: input.deliveryTerms ?? null,
    minOrderBani: input.minOrderBani ?? 0,
    pickupAvailable: input.pickupAvailable ?? false,
    isBuyer: input.isBuyer,
    isSeller: input.isSeller,
  }
}

/**
 * Verifies that a locality really belongs to the chosen district.
 *
 * The pair arrives from two dependent <select>s, and the second one is trivially
 * forgeable; an inconsistent pair would put a Chișinău supplier in Briceni on the map.
 */
async function assertGeographyConsistent(
  districtId: string | undefined,
  localityId: string | undefined,
): Promise<boolean> {
  if (!localityId) return true

  const locality = await db.locality.findUnique({
    where: { id: localityId },
    select: { districtId: true },
  })

  if (!locality) return false
  return districtId === undefined || locality.districtId === districtId
}

// --- onboarding --------------------------------------------------------------

export interface OnboardingResult {
  companyId: string
  slug: string
  isSeller: boolean
  isBuyer: boolean
  trialDays: number | null
}

export async function completeOnboarding(
  raw: unknown,
): Promise<ActionResult<OnboardingResult>> {
  return runAction(async () => {
    const user = await assertUser()

    // One company per user in this release. Re-submitting the wizard (double click,
    // stale tab, back button) must not mint a second one.
    if (user.companyId) return fail('conflict')

    const limit = await checkWriteRateLimit(user.id, 'onboarding')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const input = parseInput(companyProfileSchema, raw)

    if (!(await assertGeographyConsistent(input.districtId, input.localityId))) {
      return fail('validation', { fields: { localityId: 'selectOption' } })
    }

    const slug = await uniqueCompanySlug(input.displayName)
    const trialEndsAt = input.isSeller ? addDays(new Date(), env.SELLER_TRIAL_DAYS) : null

    const company = await transaction(async (tx) => {
      const created = await tx.company.create({
        data: { ...toCompanyColumns(input), slug, trialEndsAt },
        select: { id: true, slug: true },
      })

      await tx.companyMember.create({
        data: { companyId: created.id, userId: user.id, role: 'OWNER' },
      })

      // The company claims to exist; a moderator decides whether it does. Only the
      // badge is ever public — never the paperwork behind it.
      await tx.verificationBadge.create({
        data: { companyId: created.id, type: 'COMPANY', status: 'PENDING' },
      })

      await tx.user.update({
        where: { id: user.id },
        data: { onboardedAt: new Date() },
      })

      return created
    })

    revalidatePath('/[locale]/dashboard', 'layout')

    return ok({
      companyId: company.id,
      slug: company.slug,
      isSeller: input.isSeller,
      isBuyer: input.isBuyer,
      trialDays: trialEndsAt ? env.SELLER_TRIAL_DAYS : null,
    })
  })
}

// --- profile -----------------------------------------------------------------

export async function updateCompanyProfile(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkWriteRateLimit(user.id, 'company')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const input = parseInput(companyProfileSchema, raw)

    if (!(await assertGeographyConsistent(input.districtId, input.localityId))) {
      return fail('validation', { fields: { localityId: 'selectOption' } })
    }

    // The slug is deliberately not recomputed from a renamed company: it is a public,
    // indexed URL that other people have already linked to.
    await db.company.update({
      where: { id: user.companyId },
      data: toCompanyColumns(input),
    })

    revalidatePath('/[locale]/dashboard/company', 'page')
    revalidatePath('/[locale]/suppliers/[slug]', 'page')

    return ok()
  })
}

// --- images ------------------------------------------------------------------

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

interface AcceptedImage {
  buffer: Buffer
  mimeType: string
  extension: string
}

/**
 * Both upload gates in one place: what the browser claims, then what the bytes are.
 *
 * A declared Content-Type is attacker-controlled, so it is only ever used as a cheap
 * first filter and then compared against the sniffed format. A mismatch is a rejection,
 * never a correction — that is the path from "logo upload" to serving an executable.
 */
function acceptImage(file: File, buffer: Buffer): AcceptedImage | { error: 'fileTooLarge' | 'fileTypeNotAllowed' } {
  if (buffer.byteLength > MAX_IMAGE_BYTES) return { error: 'fileTooLarge' }

  const sniffed = sniffMimeType(buffer)
  const extension = sniffed === null ? undefined : IMAGE_EXTENSIONS[sniffed]

  if (sniffed === null || extension === undefined || sniffed !== file.type) {
    return { error: 'fileTypeNotAllowed' }
  }

  try {
    assertUploadAllowed(sniffed, buffer.byteLength, 'image')
  } catch {
    return { error: 'fileTypeNotAllowed' }
  }

  return { buffer, mimeType: sniffed, extension }
}

export interface UploadedImage {
  key: string
  url: string
}

export async function uploadCompanyLogo(
  formData: FormData,
): Promise<ActionResult<UploadedImage>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkWriteRateLimit(user.id, 'companyLogo')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const entry = formData.get('file')
    if (!(entry instanceof File)) return fail('validation')

    const accepted = acceptImage(entry, Buffer.from(await entry.arrayBuffer()))
    if ('error' in accepted) {
      return accepted.error === 'fileTooLarge'
        ? fail('fileTooLarge', { params: { size: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)) } })
        : fail('fileTypeNotAllowed')
    }

    // The key is minted server-side from the sniffed format; the uploader's filename is
    // never reused for anything.
    const key = buildStorageKey('company', user.companyId, `logo${accepted.extension}`)
    await storage.put({
      key,
      body: accepted.buffer,
      contentType: accepted.mimeType,
      visibility: 'public',
    })

    const previous = await db.company.findUnique({
      where: { id: user.companyId },
      select: { logoKey: true },
    })

    await db.company.update({ where: { id: user.companyId }, data: { logoKey: key } })

    if (previous?.logoKey && previous.logoKey !== key) {
      await storage.delete(previous.logoKey, 'public').catch(() => undefined)
    }

    revalidatePath('/[locale]/dashboard/company', 'page')
    return ok({ key, url: storage.publicUrl(key) })
  })
}

export async function removeCompanyLogo(): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertCompany()

    const company = await db.company.findUnique({
      where: { id: user.companyId },
      select: { logoKey: true },
    })

    await db.company.update({ where: { id: user.companyId }, data: { logoKey: null } })

    if (company?.logoKey) {
      await storage.delete(company.logoKey, 'public').catch(() => undefined)
    }

    revalidatePath('/[locale]/dashboard/company', 'page')
    return ok()
  })
}

export interface CompanyPhotoView {
  id: string
  key: string
  url: string
}

export async function uploadCompanyPhotos(
  formData: FormData,
): Promise<ActionResult<CompanyPhotoView[]>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkWriteRateLimit(user.id, 'companyPhoto')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)
    if (files.length === 0) return ok([])

    const existing = await db.companyPhoto.count({ where: { companyId: user.companyId } })
    if (existing + files.length > MAX_COMPANY_PHOTOS) {
      return fail('tooManyPhotos', { params: { max: MAX_COMPANY_PHOTOS } })
    }

    const saved: CompanyPhotoView[] = []
    let sortOrder = existing

    for (const file of files) {
      const accepted = acceptImage(file, Buffer.from(await file.arrayBuffer()))
      if ('error' in accepted) {
        return accepted.error === 'fileTooLarge'
          ? fail('fileTooLarge', { params: { size: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)) } })
          : fail('fileTypeNotAllowed')
      }

      const key = buildStorageKey('company', user.companyId, `photo${accepted.extension}`)
      await storage.put({
        key,
        body: accepted.buffer,
        contentType: accepted.mimeType,
        visibility: 'public',
      })

      const row = await db.companyPhoto.create({
        data: { companyId: user.companyId, key, sortOrder },
        select: { id: true, key: true },
      })

      sortOrder += 1
      saved.push({ id: row.id, key: row.key, url: storage.publicUrl(row.key) })
    }

    revalidatePath('/[locale]/dashboard/company', 'page')
    return ok(saved)
  })
}

export async function deleteCompanyPhoto(photoId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertCompany()
    const id = parseInput(idSchema, photoId)

    // Scoped by companyId, so an id belonging to someone else simply does not resolve.
    const photo = await db.companyPhoto.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, key: true },
    })
    if (!photo) return fail('notFound')

    await db.companyPhoto.delete({ where: { id: photo.id } })
    await storage.delete(photo.key, 'public').catch(() => undefined)

    revalidatePath('/[locale]/dashboard/company', 'page')
    return ok()
  })
}

// --- account -----------------------------------------------------------------

export interface AccountUpdateResult {
  /** True when the address changed and now needs a fresh confirmation link. */
  emailNeedsVerification: boolean
}

export async function updateAccountSettings(
  raw: unknown,
): Promise<ActionResult<AccountUpdateResult>> {
  return runAction(async () => {
    const user = await assertUser()

    const limit = await checkWriteRateLimit(user.id, 'account')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const input = parseInput(accountSettingsSchema, raw)

    const emailChanged = (input.email ?? null) !== user.email
    const phoneChanged = (input.phone ?? null) !== user.phone

    // An account with neither contact channel can never be recovered.
    if (!input.email && !input.phone) {
      return fail('validation', { fields: { email: 'required' } })
    }

    if (emailChanged && input.email) {
      const taken = await db.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      })
      if (taken && taken.id !== user.id) {
        return fail('emailTaken', { fields: { email: 'email' } })
      }
    }

    if (phoneChanged && input.phone) {
      const taken = await db.user.findUnique({
        where: { phone: input.phone },
        select: { id: true },
      })
      if (taken && taken.id !== user.id) {
        return fail('phoneTaken', { fields: { phone: 'phone' } })
      }
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        locale: input.locale,
        // A new address is unproven until its link is clicked; the old confirmation
        // says nothing about it.
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
        ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
      },
    })

    if (emailChanged && input.email) {
      const token = await issueLinkToken('EMAIL_VERIFY', input.email, user.id)
      await sendTemplateEmail(input.email, 'verifyEmail', input.locale, {
        url: `${env.APP_URL}${localePath(input.locale, 'register')}/verify?token=${token}`,
        expiresInHours: 24,
      })
    }

    // Keep the URL language and the stored preference from drifting apart.
    cookies().set('NEXT_LOCALE', input.locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })

    revalidatePath('/[locale]/dashboard/settings', 'page')
    return ok({ emailNeedsVerification: emailChanged && input.email !== undefined })
  })
}

export interface TotpEnrollment {
  /** Grouped into 4-character blocks; nobody types 32 unbroken base32 characters. */
  secret: string
  uri: string
}

/**
 * Starts TOTP enrolment and returns the secret in a form a human can transcribe.
 *
 * No QR code: there is no QR library in this project, and a fake image would be worse
 * than none. The `otpauth://` URI is offered as selectable text — opening it on the
 * phone that holds the authenticator does the same job as scanning.
 */
export async function startTotpEnrollment(): Promise<ActionResult<TotpEnrollment>> {
  const result = await beginTotpEnrollment()
  if (!result.ok) return result

  return ok({
    secret: formatSecretForDisplay(result.data.secret),
    uri: result.data.uri,
  })
}

export async function revokeSession(sessionId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertUser()
    const id = parseInput(idSchema, sessionId)

    // Scoped to the caller's own sessions — an id from another account cannot match.
    const result = await db.session.updateMany({
      where: { id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    if (result.count === 0) return fail('notFound')

    revalidatePath('/[locale]/dashboard/settings', 'page')
    return ok()
  })
}

export async function revokeAllOtherSessions(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const user = await assertUser()
    const count = await revokeOtherSessions(user.id)

    revalidatePath('/[locale]/dashboard/settings', 'page')
    return ok(count)
  })
}

/**
 * Soft-deletes the account.
 *
 * Rows are not dropped: a completed deal is a commercial record the counterparty is
 * also a party to, and the accounting requirements outlive the account. What goes is
 * the identity — the login channels are released, the sessions die, and the company
 * disappears from the catalogue.
 */
export async function deleteAccount(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertUser()
    const input = parseInput(deleteAccountSchema, raw)

    // The typed word is localized, and the server does not know which language the
    // form was rendered in — so both spellings are accepted, and nothing else is.
    const dictionaries = await Promise.all(LOCALES.map((locale) => getDictionary(locale)))
    const keywords = dictionaries.map((dictionary) =>
      dictionary.settings.deleteAccountKeyword.trim().toLocaleUpperCase(),
    )

    if (!keywords.includes(input.confirm.toLocaleUpperCase())) {
      return fail('validation', { fields: { confirm: 'required' } })
    }

    const now = new Date()

    await transaction(async (tx) => {
      const memberships = await tx.companyMember.findMany({
        where: { userId: user.id },
        select: { companyId: true },
      })

      for (const membership of memberships) {
        const otherOwners = await tx.companyMember.count({
          where: { companyId: membership.companyId, userId: { not: user.id }, role: 'OWNER' },
        })
        // A company with another owner keeps trading; only a company left without one
        // is withdrawn from the catalogue.
        if (otherOwners === 0) {
          await tx.company.update({
            where: { id: membership.companyId },
            data: { status: 'SUSPENDED', deletedAt: now },
          })
        }
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          status: 'DELETED',
          deletedAt: now,
          // Freeing the unique columns lets the person sign up again later.
          email: null,
          phone: null,
          passwordHash: null,
          totpSecretEnc: null,
          totpEnabledAt: null,
          name: 'Deleted account',
        },
      })

      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      })
    })

    await destroySession()

    return ok()
  })
}
