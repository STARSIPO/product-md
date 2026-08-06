import 'server-only'
import { env } from '@/env'
import type { Locale } from '@/lib/i18n/config'
import { formatDate } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'

/**
 * Every transactional email the platform sends, in Russian and Romanian.
 *
 * Copy lives here rather than in the i18n dictionaries because an email is a whole
 * document — subject, body and call to action have to be written together to read like
 * one message, and mixing them into the UI dictionary produces stilted mail assembled
 * from button labels.
 *
 * Layout notes: no <table>. The classic table scaffolding exists for Outlook 2007-2013
 * on desktop; this audience reads mail in Gmail, Yandex and iOS Mail, where a max-width
 * block with inline styles renders correctly and stays readable when a client strips
 * the styles entirely.
 */

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * Params per template. `renderEmail` is keyed off this map, so calling
 * renderEmail('lowBalance', 'ru', { url }) is a compile error, not a broken email.
 *
 * Amounts arrive as bani and dates as Date: formatting belongs to the locale, and the
 * template already knows it. Labels that come from the domain vocabulary (deal status)
 * are passed pre-translated, because their wording lives in the i18n dictionary.
 */
export interface EmailTemplateParams {
  verifyEmail: { url: string; expiresInHours: number }
  resetPassword: { url: string; expiresInMinutes: number }
  newMessage: { senderName: string; preview: string; url: string }
  newOffer: { requestTitle: string; supplierName: string; totalBani: number; url: string }
  offerAccepted: { requestTitle: string; buyerName: string; url: string }
  dealStatusChanged: { dealNumber: string; statusLabel: string; url: string }
  listingExpiring: { productTitle: string; daysLeft: number; url: string }
  lowBalance: { balanceBani: number; dailyCostBani: number; url: string }
  documentExpiring: { documentName: string; expiresOn: Date; daysLeft: number; url: string }
  moderationDecision: { subjectTitle: string; approved: boolean; reason?: string; url: string }
}

export type EmailTemplateName = keyof EmailTemplateParams

// --- layout ------------------------------------------------------------------

const BRAND_GREEN = '#0F6B45'
const INK = '#111827'
const MUTED = '#6B7280'
const BORDER = '#E5E7EB'
const PAGE_BG = '#F4F6F5'

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

interface EmailContent {
  subject: string
  heading: string
  paragraphs: readonly string[]
  facts?: readonly { label: string; value: string }[]
  action?: { label: string; url: string }
  note?: string
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Company names, message previews and listing titles are user input that ends up in an
 * HTML document. Escaped on the way in, always — a webmail client that renders injected
 * markup is a phishing vector aimed at the very people this platform asks to trust it.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)
}

const FOOTER: Record<Locale, readonly string[]> = {
  ru: [
    'Product.md — информационная площадка оптовой торговли продуктами питания. Мы не являемся стороной сделки и не участвуем в расчётах: договор поставки заключается напрямую между покупателем и продавцом.',
    'Письмо отправлено автоматически, отвечать на него не нужно.',
  ],
  ro: [
    'Product.md este o platformă informațională pentru comerțul angro cu produse alimentare. Nu suntem parte în tranzacție și nu participăm la plăți: contractul de livrare se încheie direct între cumpărător și vânzător.',
    'Acest mesaj este generat automat, nu este necesar să răspundeți.',
  ],
}

function layout(locale: Locale, content: EmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:${INK};">${escapeHtml(text)}</p>`,
    )
    .join('')

  const facts = content.facts?.length
    ? `<div style="margin:18px 0 4px;border-top:1px solid ${BORDER};">${content.facts
        .map(
          (fact) =>
            `<div style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px;line-height:20px;">` +
            `<span style="color:${MUTED};">${escapeHtml(fact.label)}</span><br>` +
            `<strong style="color:${INK};font-weight:600;">${escapeHtml(fact.value)}</strong>` +
            `</div>`,
        )
        .join('')}</div>`
    : ''

  const action = content.action
    ? `<div style="margin:24px 0 4px;">` +
      `<a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:${BRAND_GREEN};color:#FFFFFF;` +
      `text-decoration:none;font-size:15px;font-weight:600;line-height:20px;padding:13px 22px;border-radius:8px;">` +
      `${escapeHtml(content.action.label)}</a></div>` +
      // Mail clients strip the anchor often enough that the raw URL has to be visible.
      `<p style="margin:12px 0 0;font-size:12px;line-height:18px;color:${MUTED};word-break:break-all;">` +
      `${escapeHtml(content.action.url)}</p>`
    : ''

  const note = content.note
    ? `<p style="margin:18px 0 0;font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(content.note)}</p>`
    : ''

  const footer = FOOTER[locale]
    .map(
      (line) =>
        `<p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(line)}</p>`,
    )
    .join('')

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-font-smoothing:antialiased;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px 32px;font-family:${FONT_STACK};">
<div style="padding:4px 2px 18px;">
<a href="${escapeHtml(env.APP_URL)}" style="text-decoration:none;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${BRAND_GREEN};">Product<span style="color:${INK};">.md</span></a>
</div>
<div style="background:#FFFFFF;border:1px solid ${BORDER};border-radius:12px;padding:26px 26px 24px;">
<h1 style="margin:0 0 14px;font-size:20px;line-height:28px;font-weight:600;color:${INK};">${escapeHtml(content.heading)}</h1>
${paragraphs}${facts}${action}${note}
</div>
<div style="padding:20px 2px 0;">
${footer}
</div>
</div>
</body>
</html>`
}

function plainText(locale: Locale, content: EmailContent): string {
  const blocks: string[] = [content.heading, '', ...content.paragraphs]

  for (const fact of content.facts ?? []) {
    blocks.push(`${fact.label}: ${fact.value}`)
  }

  if (content.action) {
    blocks.push('', `${content.action.label}: ${content.action.url}`)
  }

  if (content.note) blocks.push('', content.note)

  blocks.push('', '—', ...FOOTER[locale])

  return blocks.join('\n')
}

function compose(locale: Locale, content: EmailContent): RenderedEmail {
  return {
    subject: content.subject,
    html: layout(locale, content),
    text: plainText(locale, content),
  }
}

// --- small language helpers --------------------------------------------------

function pluralRu(count: number, forms: readonly [string, string, string]): string {
  const mod100 = Math.abs(count) % 100
  const mod10 = mod100 % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

function daysRu(days: number): string {
  return `${days} ${pluralRu(days, ['день', 'дня', 'дней'])}`
}

/** Romanian inserts "de" before the noun from 20 upwards: 3 zile, 20 de zile. */
function daysRo(days: number): string {
  if (days === 1) return 'o zi'
  const mod100 = days % 100
  return mod100 === 0 || mod100 >= 20 ? `${days} de zile` : `${days} zile`
}

function hoursRu(hours: number): string {
  return `${hours} ${pluralRu(hours, ['час', 'часа', 'часов'])}`
}

function hoursRo(hours: number): string {
  if (hours === 1) return 'o oră'
  const mod100 = hours % 100
  return mod100 === 0 || mod100 >= 20 ? `${hours} de ore` : `${hours} ore`
}

function minutesRu(minutes: number): string {
  return `${minutes} ${pluralRu(minutes, ['минуту', 'минуты', 'минут'])}`
}

function minutesRo(minutes: number): string {
  if (minutes === 1) return 'un minut'
  const mod100 = minutes % 100
  return mod100 === 0 || mod100 >= 20 ? `${minutes} de minute` : `${minutes} minute`
}

/** Message previews are quoted inline; a whole message would bury the call to action. */
function truncate(value: string, max = 180): string {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}

// --- templates ---------------------------------------------------------------

type TemplateBuilder<K extends EmailTemplateName> = (
  locale: Locale,
  params: EmailTemplateParams[K],
) => EmailContent

const BUILDERS: { [K in EmailTemplateName]: TemplateBuilder<K> } = {
  verifyEmail: (locale, params) =>
    locale === 'ru'
      ? {
          subject: 'Подтвердите email — Product.md',
          heading: 'Подтвердите ваш email',
          paragraphs: [
            'Вы создали аккаунт на Product.md — площадке оптовой торговли продуктами питания в Молдове.',
            'Подтвердите адрес, чтобы получать сообщения от покупателей и поставщиков и восстанавливать доступ к аккаунту.',
          ],
          action: { label: 'Подтвердить email', url: params.url },
          note: `Ссылка действует ${hoursRu(params.expiresInHours)}. Если аккаунт создавали не вы — просто удалите это письмо.`,
        }
      : {
          subject: 'Confirmați adresa de email — Product.md',
          heading: 'Confirmați adresa de email',
          paragraphs: [
            'Ați creat un cont pe Product.md — platforma de comerț angro cu produse alimentare din Moldova.',
            'Confirmați adresa pentru a primi mesaje de la cumpărători și furnizori și pentru a putea recupera accesul la cont.',
          ],
          action: { label: 'Confirmă adresa', url: params.url },
          note: `Linkul este valabil ${hoursRo(params.expiresInHours)}. Dacă nu dumneavoastră ați creat contul, ignorați acest mesaj.`,
        },

  resetPassword: (locale, params) =>
    locale === 'ru'
      ? {
          subject: 'Восстановление пароля — Product.md',
          heading: 'Смена пароля',
          paragraphs: ['Мы получили запрос на смену пароля для вашего аккаунта на Product.md.'],
          action: { label: 'Задать новый пароль', url: params.url },
          note: `Ссылка действует ${minutesRu(params.expiresInMinutes)} и срабатывает один раз. Если запрос делали не вы, ничего делать не нужно — пароль останется прежним.`,
        }
      : {
          subject: 'Resetarea parolei — Product.md',
          heading: 'Schimbarea parolei',
          paragraphs: [
            'Am primit o solicitare de schimbare a parolei pentru contul dumneavoastră pe Product.md.',
          ],
          action: { label: 'Setează o parolă nouă', url: params.url },
          note: `Linkul este valabil ${minutesRo(params.expiresInMinutes)} și poate fi folosit o singură dată. Dacă nu dumneavoastră ați făcut solicitarea, nu trebuie să faceți nimic — parola rămâne neschimbată.`,
        },

  newMessage: (locale, params) =>
    locale === 'ru'
      ? {
          subject: `Новое сообщение от ${params.senderName} — Product.md`,
          heading: 'Новое сообщение',
          paragraphs: [
            `${params.senderName} написал вам на Product.md:`,
            `«${truncate(params.preview)}»`,
          ],
          action: { label: 'Открыть переписку', url: params.url },
          note: 'Отвечайте в личном кабинете — так переписка останется привязанной к сделке.',
        }
      : {
          subject: `Mesaj nou de la ${params.senderName} — Product.md`,
          heading: 'Mesaj nou',
          paragraphs: [
            `${params.senderName} v-a scris pe Product.md:`,
            `„${truncate(params.preview)}”`,
          ],
          action: { label: 'Deschide conversația', url: params.url },
          note: 'Răspundeți din cabinetul personal — astfel conversația rămâne legată de tranzacție.',
        },

  newOffer: (locale, params) =>
    locale === 'ru'
      ? {
          subject: `Новое предложение по заявке «${params.requestTitle}»`,
          heading: 'Получено новое предложение',
          paragraphs: ['На вашу заявку ответил поставщик.'],
          facts: [
            { label: 'Заявка', value: params.requestTitle },
            { label: 'Поставщик', value: params.supplierName },
            { label: 'Сумма предложения', value: formatMoney(params.totalBani, locale) },
          ],
          action: { label: 'Посмотреть предложение', url: params.url },
          note: 'Условия поставки и оплату согласуйте напрямую с поставщиком.',
        }
      : {
          subject: `Ofertă nouă la cererea „${params.requestTitle}”`,
          heading: 'Ați primit o ofertă nouă',
          paragraphs: ['Un furnizor a răspuns la cererea dumneavoastră.'],
          facts: [
            { label: 'Cerere', value: params.requestTitle },
            { label: 'Furnizor', value: params.supplierName },
            { label: 'Valoarea ofertei', value: formatMoney(params.totalBani, locale) },
          ],
          action: { label: 'Vezi oferta', url: params.url },
          note: 'Condițiile de livrare și plata se convin direct cu furnizorul.',
        },

  offerAccepted: (locale, params) =>
    locale === 'ru'
      ? {
          subject: `Ваше предложение принято — «${params.requestTitle}»`,
          heading: 'Предложение принято',
          paragraphs: [
            `${params.buyerName} принял ваше предложение по заявке «${params.requestTitle}».`,
            'Свяжитесь с покупателем, согласуйте сроки поставки и оформите договор — Product.md в расчётах не участвует.',
          ],
          action: { label: 'Открыть сделку', url: params.url },
        }
      : {
          subject: `Oferta dumneavoastră a fost acceptată — „${params.requestTitle}”`,
          heading: 'Oferta a fost acceptată',
          paragraphs: [
            `${params.buyerName} a acceptat oferta dumneavoastră la cererea „${params.requestTitle}”.`,
            'Contactați cumpărătorul, stabiliți termenele de livrare și încheiați contractul — Product.md nu participă la plăți.',
          ],
          action: { label: 'Deschide tranzacția', url: params.url },
        },

  dealStatusChanged: (locale, params) =>
    locale === 'ru'
      ? {
          subject: `Сделка №${params.dealNumber}: ${params.statusLabel}`,
          heading: 'Статус сделки изменился',
          paragraphs: ['Вторая сторона обновила статус сделки.'],
          facts: [
            { label: 'Сделка', value: `№${params.dealNumber}` },
            { label: 'Новый статус', value: params.statusLabel },
          ],
          action: { label: 'Открыть сделку', url: params.url },
        }
      : {
          subject: `Tranzacția nr. ${params.dealNumber}: ${params.statusLabel}`,
          heading: 'Statutul tranzacției s-a schimbat',
          paragraphs: ['Cealaltă parte a actualizat statutul tranzacției.'],
          facts: [
            { label: 'Tranzacție', value: `nr. ${params.dealNumber}` },
            { label: 'Statut nou', value: params.statusLabel },
          ],
          action: { label: 'Deschide tranzacția', url: params.url },
        },

  listingExpiring: (locale, params) =>
    locale === 'ru'
      ? {
          subject: `Объявление «${params.productTitle}» скоро снимется с публикации`,
          heading: 'Публикация заканчивается',
          paragraphs: [
            `Объявление «${params.productTitle}» останется в каталоге ещё ${daysRu(params.daysLeft)}.`,
            'После этого оно перестанет показываться в каталоге и в поиске, но останется в личном кабинете — продлить можно в любой момент.',
          ],
          action: { label: 'Продлить публикацию', url: params.url },
        }
      : {
          subject: `Anunțul „${params.productTitle}” expiră în curând`,
          heading: 'Publicarea se încheie',
          paragraphs: [
            `Anunțul „${params.productTitle}” mai rămâne în catalog ${daysRo(params.daysLeft)}.`,
            'După aceea nu va mai apărea în catalog și în căutare, dar rămâne în cabinetul personal — îl puteți prelungi oricând.',
          ],
          action: { label: 'Prelungește publicarea', url: params.url },
        },

  lowBalance: (locale, params) =>
    locale === 'ru'
      ? {
          subject: 'Низкий баланс — Product.md',
          heading: 'На балансе заканчиваются средства',
          paragraphs: [
            'Когда средства закончатся, активные объявления автоматически встанут на паузу.',
          ],
          facts: [
            { label: 'Текущий баланс', value: formatMoney(params.balanceBani, locale) },
            { label: 'Списание в день', value: formatMoney(params.dailyCostBani, locale) },
          ],
          action: { label: 'Пополнить баланс', url: params.url },
        }
      : {
          subject: 'Sold redus — Product.md',
          heading: 'Soldul este pe terminate',
          paragraphs: ['Când fondurile se epuizează, anunțurile active se pun automat pe pauză.'],
          facts: [
            { label: 'Sold curent', value: formatMoney(params.balanceBani, locale) },
            { label: 'Costul zilnic', value: formatMoney(params.dailyCostBani, locale) },
          ],
          action: { label: 'Alimentează contul', url: params.url },
        },

  documentExpiring: (locale, params) =>
    locale === 'ru'
      ? {
          subject: `Истекает срок документа «${params.documentName}»`,
          heading: 'Документ скоро станет недействительным',
          paragraphs: [
            `Срок действия документа заканчивается через ${daysRu(params.daysLeft)}.`,
            'Загрузите обновлённую версию, чтобы компания не потеряла отметку о проверке.',
          ],
          facts: [
            { label: 'Документ', value: params.documentName },
            { label: 'Действует до', value: formatDate(params.expiresOn, locale) },
          ],
          action: { label: 'Обновить документ', url: params.url },
        }
      : {
          subject: `Documentul „${params.documentName}” expiră`,
          heading: 'Documentul expiră în curând',
          paragraphs: [
            `Valabilitatea documentului se încheie peste ${daysRo(params.daysLeft)}.`,
            'Încărcați versiunea actualizată pentru ca firma să nu piardă marcajul de verificare.',
          ],
          facts: [
            { label: 'Document', value: params.documentName },
            { label: 'Valabil până la', value: formatDate(params.expiresOn, locale) },
          ],
          action: { label: 'Actualizează documentul', url: params.url },
        },

  moderationDecision: (locale, params) => {
    if (locale === 'ru') {
      return params.approved
        ? {
            subject: `«${params.subjectTitle}» опубликовано`,
            heading: 'Модерация пройдена',
            paragraphs: [
              `Модератор одобрил «${params.subjectTitle}». Материал уже доступен в каталоге и в поиске.`,
            ],
            action: { label: 'Открыть', url: params.url },
          }
        : {
            subject: `«${params.subjectTitle}»: нужны изменения`,
            heading: 'Модерация не пройдена',
            paragraphs: [
              `Модератор отклонил «${params.subjectTitle}».`,
              params.reason
                ? `Причина: ${params.reason}`
                : 'Причина не указана — напишите в поддержку, если она непонятна.',
              'Исправьте замечания и отправьте на повторную проверку.',
            ],
            action: { label: 'Исправить', url: params.url },
          }
    }

    return params.approved
      ? {
          subject: `„${params.subjectTitle}” a fost publicat`,
          heading: 'Moderare finalizată cu succes',
          paragraphs: [
            `Moderatorul a aprobat „${params.subjectTitle}”. Materialul este deja disponibil în catalog și în căutare.`,
          ],
          action: { label: 'Deschide', url: params.url },
        }
      : {
          subject: `„${params.subjectTitle}”: sunt necesare modificări`,
          heading: 'Moderarea nu a fost trecută',
          paragraphs: [
            `Moderatorul a respins „${params.subjectTitle}”.`,
            params.reason
              ? `Motiv: ${params.reason}`
              : 'Motivul nu a fost indicat — scrieți la suport dacă nu este clar.',
            'Corectați observațiile și trimiteți din nou spre verificare.',
          ],
          action: { label: 'Corectează', url: params.url },
        }
  },
}

/**
 * Renders a template. The generic ties `params` to `template`, so a mismatch is caught
 * at compile time rather than producing an email full of "undefined".
 */
export function renderEmail<T extends EmailTemplateName>(
  template: T,
  locale: Locale,
  params: EmailTemplateParams[T],
): RenderedEmail {
  // TypeScript cannot see that the map entry and `params` share the same key while T is
  // still generic; the map's own type guarantees it.
  const build = BUILDERS[template] as TemplateBuilder<T>
  return compose(locale, build(locale, params))
}
