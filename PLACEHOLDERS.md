# Placeholders & data to confirm before launch

The platform is complete and functional, but a handful of **real-world facts and assets
are not ours to invent**. Everything below is flagged in code with the literal string
`PLACEHOLDER` (or an empty env var) so it is impossible to ship by accident.

Nothing here renders as a fabricated fact. Where a value is missing, the page shows an
explicit `PLACEHOLDER` marker with a “Требует заполнения / De completat” badge rather
than a plausible-looking invention. A wrong e-mail address in a privacy policy is a
liability; an obvious gap is a task.

Search for the marker at any time:

```bash
grep -rn "PLACEHOLDER" src/content/
```

---

## 1. Owner identity and contacts ⛔ (required before launch)

All of these live in **one file** — `src/content/legal/ru.ts` and its Romanian twin
`src/content/legal/ro.ts` — under `contacts.channels[]`. Replace `value: PLACEHOLDER`
with the real value and set `isPlaceholder: false` on that channel.

| Channel (`contacts.channels[].label`) | What to supply | Where it also appears |
| --- | --- | --- |
| Общие вопросы / Întrebări generale | General e-mail address | `partners` §“Как начать разговор”, `privacy` §1 |
| Поддержка пользователей / Suport | Support e-mail address | `help.outro` |
| Жалобы и модерация / Reclamații | Moderation e-mail address | `rules` §11 |
| Сообщения об уязвимостях / Vulnerabilități | `security@…` address | `security` §10 |
| Телефон / Telefon | Support phone, `+373 XX XXX XXX` | — |
| Часы работы / Program de lucru | Support hours + time zone (Chișinău, EET/EEST) | — |
| Юридическое лицо / Persoană juridică | Legal entity name + **IDNO** (13 digits) | `terms` §13, `privacy` §1 |
| Юридический адрес / Adresa juridică | Registered address in the Republic of Moldova | `terms` §13 |

Both language files must be edited — they are typed against each other, so forgetting
one is a `npm run typecheck` failure, not a silent half-translated page.

> **No contact form is wired up.** `src/app/[locale]/contacts/page.tsx` deliberately
> ships without one: nothing on the server accepts submissions yet, and a form that
> discards a complaint is worse than no form. Add one only together with a real handler.

---

## 2. Legal review of the documents ⚠️

The four legal documents are written from the actual behaviour of this codebase, not
from a template — but they have **not been reviewed by a lawyer**.

| Document | File key | Needs a lawyer to confirm |
| --- | --- | --- |
| Условия использования | `terms` | §6 liability split, §11 limitation of liability, §13 jurisdiction |
| Политика конфиденциальности | `privacy` | Retention periods (§4), lawful bases (§3), the name of the national data-protection authority (§7) |
| Правила публикации | `rules` | §6 ANSA obligations |
| Безопасность | `security` | §10 safe-harbour wording |

Set a new `updated` date (`YYYY-MM-DD`) at the top of each document after the review —
it is rendered as “Обновлено / Actualizat”.

---

## 3. ANSA and regulatory references ⚠️

`rules` §6 (“Документы и требования ANSA”) currently describes the obligation in general
terms and says the concrete citations are `PLACEHOLDER`.

Supply, after legal review:

- The exact normative acts requiring sanitary-veterinary authorisation for the product
  groups sold on the platform.
- The ANSA register / establishment-registration reference and its public URL.
- Which product categories in `prisma/seed/categories.ts` require a document at all —
  today the platform asks for documents uniformly rather than per category.

---

## 4. Photography ⚠️

Seed data points at **Unsplash** images, allow-listed in `next.config.mjs`:

```js
// next.config.mjs
images: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }] }
```

These are demo placeholders for a demo catalogue. Before launch:

1. Remove the `images.unsplash.com` remote pattern from `next.config.mjs` and add your
   own CDN / S3 public base host instead (`S3_PUBLIC_BASE_URL`).
2. Replace the seeded product photos with real product photography. Anything a supplier
   uploads afterwards goes to the public bucket and is served from your own host.
3. There is no site logo file yet — the header, footer and favicon use a Lucide glyph
   (`LayoutGrid`) as the mark. Drop a real logo into `public/` and swap it in
   `src/components/layout/site-header.tsx` and `site-footer.tsx`.
4. No Open Graph image exists. `openGraph` metadata is generated without one; add
   `public/og.png` (1200×630) and reference it in `src/app/[locale]/layout.tsx`.

---

## 5. Payments and bank details ⛔ (required before enabling billing)

Billing is behind the `BILLING_ENABLED` feature flag and is **off by default**. The
payment provider is an adapter (`src/server/payments/`) and currently runs the `mock`
driver, which approves everything without moving money.

Before switching the flag on:

| Item | Where |
| --- | --- |
| Merchant contract with a provider (`maib`, `victoriabank`, `paynet`, `mia`) | commercial |
| `PAYMENT_DRIVER` set to the real provider | `.env` |
| Provider credentials / merchant id / signing key | `.env` (never committed) |
| `PAYMENT_WEBHOOK_SECRET` — a fresh random value, not the example one | `.env` |
| Company bank details shown on the top-up invoice | not yet displayed anywhere — add to `src/content/legal/*` when the invoice screen exists |
| VAT treatment of the 1 MDL/day listing fee | accountant |

The published prices — 1 MDL/day per active listing, free purchase requests, free seller
trial, promotion tariffs — are stated in `terms` §7 and `help` (“Деньги и тарифы”). If
commercial terms change, change them **there** as well as in `src/lib/constants.ts`;
the pages are the public promise.

---

## 6. Environment and secrets ⛔

`.env.example` documents every variable. For production, at minimum:

| Variable | Note |
| --- | --- |
| `APP_URL` | Real public origin — used for canonical URLs, sitemap, OG and mail links |
| `APP_SECRET` | Fresh 64-char random value; rotating it invalidates all sessions and TOTP secrets |
| `DATABASE_URL` | PostgreSQL in production; SQLite is development only |
| `MAIL_DRIVER` / SMTP credentials | `console` only logs; nothing reaches the user |
| `MAIL_FROM` | Must be an address on a domain with SPF/DKIM/DMARC set up |
| `SMS_DRIVER`, `SMS_API_KEY`, `SMS_SENDER` | `mock` prints the code to the server log |
| `S3_*` | Two buckets: public (photos) and **private** (documents, sealed-offer attachments). The private one must have no public read. |
| `CRON_SECRET` | Guards the daily billing endpoint |

The app refuses to start in production with the example secrets — that check is
intentional, do not weaken it.

---

## 7. Demo accounts ⚠️

The seed creates four accounts with the password `Parola123`:

```
buyer@product.md      seller@product.md      moderator@product.md      admin@product.md
```

They exist for local development and for the e2e suite. **Do not run `npm run db:seed`
against production**, and confirm these accounts do not exist before going live.

---

## 8. Not built yet (so nothing pretends otherwise)

Stated as “in planning” in the public copy rather than promised:

- Bulk product upload (CSV/XLSX) — mentioned as a plan in `partners` §“Интеграции”.
- Public API for large suppliers — same section.
- `https://product.md/.well-known/security.txt` with a PGP key — `security` §10 points
  at the e-mail channel only until this exists.

---

## 9. Quick checklist

- [ ] Legal entity, IDNO, registered address filled in both `ru.ts` and `ro.ts`
- [ ] Four e-mail addresses + phone + support hours filled, `isPlaceholder: false`
- [ ] `grep -rn "PLACEHOLDER" src/content/` returns nothing
- [ ] Legal documents reviewed by a lawyer, `updated` dates bumped
- [ ] ANSA references added to `rules` §6
- [ ] Unsplash remote pattern removed; real photography, logo and OG image in place
- [ ] Production `.env` complete; example secrets replaced
- [ ] Payment provider contracted before `BILLING_ENABLED` is switched on
- [ ] Demo accounts absent from the production database
