/**
 * Demo dataset for Product.md.
 *
 * Everything here is invented: the companies, the people, the IDNO numbers and the
 * phone numbers do not belong to anyone. Prices, however, are realistic Moldovan
 * wholesale levels in bani (1 MDL = 100 bani), because a demo that quotes beef at
 * 3 MDL/kg teaches nothing about how the catalogue reads.
 *
 * The module is one big data table plus a thin writer. Aggregates are never typed in
 * by hand — `ratingAvg`/`ratingCount`/`dealsCompleted`/`offersCount` are computed from
 * the rows this file creates, exactly the way the services recompute them at runtime.
 */

import type { PrismaClient } from '@prisma/client'
import { normalize, slugify } from '../../src/lib/normalize'
import { hashPassword } from '../../src/server/auth/password'
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_TARIFFS,
  type CompanyKind,
  type RetailOrderStatus,
} from '../../src/lib/constants'
import { centreOf } from './geo'
import { categorySearchParts, CATEGORY_BY_SLUG, optionId, resolveAttribute } from './categories'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const MS_DAY = 86_400_000
const NOW = new Date()

function at(offsetDays: number, hour = 10, minute = 0): Date {
  const date = new Date(NOW.getTime() + offsetDays * MS_DAY)
  date.setHours(hour, minute, 0, 0)
  return date
}

const ago = (days: number, hour = 10): Date => at(-days, hour)
const ahead = (days: number, hour = 18): Date => at(days, hour)

function must<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(`demo seed: ${message}`)
  return value
}

const json = (value: unknown): string => JSON.stringify(value)

/** `PMD-2026-000001` */
function dealNumber(index: number): string {
  return `PMD-${NOW.getFullYear()}-${String(index + 1).padStart(6, '0')}`
}

/** Slug plus a short deterministic suffix — titles repeat across suppliers. */
function uniqueSlug(title: string, index: number): string {
  return `${slugify(title, 60)}-${(index + 1296).toString(36)}`
}

function searchTextFor(title: string, description: string | null, categorySlug: string): string {
  return normalize([title, description ?? '', ...categorySearchParts(categorySlug)].join(' '))
}

const photoUrl = (id: string): string => `https://images.unsplash.com/${id}?w=800&q=80`

// ---------------------------------------------------------------------------
// Working hours presets (JSON string columns, see src/lib/validation.ts)
// ---------------------------------------------------------------------------

type DayHours = { from: string; to: string } | null

interface WeekHours {
  mon: DayHours
  tue: DayHours
  wed: DayHours
  thu: DayHours
  fri: DayHours
  sat: DayHours
  sun: DayHours
}

function week(weekday: DayHours, saturday: DayHours = null, sunday: DayHours = null): WeekHours {
  return {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: saturday,
    sun: sunday,
  }
}

const HOURS = {
  OFFICE: week({ from: '08:00', to: '17:00' }),
  TRADE: week({ from: '08:00', to: '18:00' }, { from: '09:00', to: '14:00' }),
  EARLY: week({ from: '06:00', to: '15:00' }, { from: '06:00', to: '12:00' }),
  ALWAYS: week({ from: '00:00', to: '23:59' }, { from: '00:00', to: '23:59' }, { from: '00:00', to: '23:59' }),
  HORECA: week({ from: '09:00', to: '20:00' }, { from: '10:00', to: '18:00' }, { from: '10:00', to: '16:00' }),
} satisfies Record<string, WeekHours>

type HoursKey = keyof typeof HOURS

// ---------------------------------------------------------------------------
// Photos — every id below was checked against images.unsplash.com
// ---------------------------------------------------------------------------

const PHOTO = {
  potatoes: ['photo-1518977676601-b53f82aba655', 'photo-1508313880080-c4bef0730395'],
  carrots: ['photo-1445282768818-728615cc910a'],
  cabbage: ['photo-1594282486552-05b4d80fbb9f'],
  onions: ['photo-1518977956812-cd3dbadaaf31', 'photo-1580201092675-a0a6a6cafbb1'],
  tomatoes: ['photo-1592841200221-a6898f307baa', 'photo-1561136594-7f68413baa99', 'photo-1546094096-0df4bcaaa337'],
  greens: ['photo-1615485500704-8e990f9900f7', 'photo-1466637574441-749b8f19452f'],
  cucumbers: ['photo-1449300079323-02e209d9d3a6', 'photo-1604977042946-1eecc30f269e'],
  apples: ['photo-1567306226416-28f0efdc88ce', 'photo-1619546813926-a78fa6372cd2'],
  pears: ['photo-1514756331096-242fdeb70d4a'],
  plums: ['photo-1595231776515-ddffb1f4eb73'],
  berries: ['photo-1464965911861-746a04b4bca6', 'photo-1518635017498-87f514b751ba'],
  grapes: ['photo-1537640538966-79f369143f8f'],
  milk: ['photo-1550583724-b2692b85b150', 'photo-1563636619-e9143da7973b'],
  cheese: ['photo-1486297678162-eb2a19b0a32d', 'photo-1552767059-ce182ead6c1b'],
  cottage: ['photo-1559561853-08451507cbe7'],
  sourCream: ['photo-1488477181946-6428a0291777'],
  butter: ['photo-1589985270826-4b7bb135bc9d'],
  beef: ['photo-1603048297172-c92544798d5a', 'photo-1615937691194-97dbd3f3dc29'],
  beefFrozen: ['photo-1607623814075-e51df1bdc82f'],
  pork: ['photo-1602470520998-f4a52199a3d6'],
  veal: ['photo-1529692236671-f1f6cf9683ba'],
  chickenRaw: ['photo-1587593810167-a84920ea0781', 'photo-1604503468506-a8da13d82791'],
  chickenFillet: ['photo-1594221708779-94832f4320d1'],
  turkey: ['photo-1518492104633-130d0cc84637'],
  eggs: ['photo-1506976785307-8732e854ad03', 'photo-1587486913049-53fc88980cfc'],
  fishFresh: ['photo-1498654200943-1088dd4438ae'],
  trout: ['photo-1519708227418-c8fd9a32b7a2', 'photo-1615141982883-c7ad0e69fd62'],
  fishSalted: ['photo-1615141982883-c7ad0e69fd62'],
  seafood: ['photo-1615141982883-c7ad0e69fd62'],
  bread: ['photo-1509440159596-0249088772ff', 'photo-1549931319-a545dcf3bc73'],
  pastry: ['photo-1555507036-ab1f4038808a'],
  flour: ['photo-1574323347407-f5e1ad6d020b'],
  grain: ['photo-1536304993881-ff6e9eefa2a6'],
  honey: ['photo-1471943311424-646960669fbc', 'photo-1558642452-9d2a7deb7f62'],
  honeyJar: ['photo-1587049352851-8d4e89133924'],
  oil: ['photo-1474979266404-7eaacbcd87c5'],
  water: ['photo-1548839140-29a749e1cf4d', 'photo-1523362628745-0c100150b504'],
  boxes: ['photo-1595246140625-573b715d11dc', 'photo-1553413077-190dd305871c'],
  warehouse: ['photo-1586528116311-ad8dd3c8310d'],
  cups: ['photo-1495474472287-4d71bcdd2085'],
  cleaning: ['photo-1563453392212-326f5e854473'],
  kitchen: ['photo-1556909212-d5b604d0c90d', 'photo-1517248135467-4c7edcad34c4'],
  truck: ['photo-1601584115197-04ecc0da31d7', 'photo-1519003722824-194d4455a60c'],
  frozenVeg: ['photo-1590779033100-9f60a05a013d'],
  canned: ['photo-1596040033229-a9821ebd058d'],
  dumplings: ['photo-1533089860892-a7c6f0a88666'],
  legumes: ['photo-1586201375761-83865001e31c'],
  market: ['photo-1550989460-0adf9ea622e2'],
  restaurant: ['photo-1414235077428-338989a2e8c0'],
  field: ['photo-1560493676-04071c5f467b'],
} satisfies Record<string, string[]>

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface UserSpec {
  key: string
  name: string
  email: string
  phone: string
  role: 'USER' | 'MODERATOR' | 'ADMIN'
  locale: 'ru' | 'ro'
}

/** The four documented logins. Everything else is an ordinary company owner. */
const TEST_PASSWORD = 'Parola123'

const STAFF: UserSpec[] = [
  { key: 'buyer', name: 'Александру Попа', email: 'buyer@product.md', phone: '+37379000001', role: 'USER', locale: 'ru' },
  { key: 'seller', name: 'Ion Rusu', email: 'seller@product.md', phone: '+37379000002', role: 'USER', locale: 'ro' },
  { key: 'moderator', name: 'Diana Vieru', email: 'moderator@product.md', phone: '+37379000003', role: 'MODERATOR', locale: 'ru' },
  { key: 'admin', name: 'Victor Andronic', email: 'admin@product.md', phone: '+37379000004', role: 'ADMIN', locale: 'ru' },
]

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

type BadgeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
type BadgeSpec = readonly [string, BadgeStatus]

const FULL_BADGES: readonly BadgeSpec[] = [
  ['PHONE', 'APPROVED'],
  ['EMAIL', 'APPROVED'],
  ['COMPANY', 'APPROVED'],
  ['IDNO', 'APPROVED'],
  ['DOCUMENTS', 'APPROVED'],
  ['ANSA', 'APPROVED'],
  ['BANK', 'APPROVED'],
  ['TRUSTED_SUPPLIER', 'APPROVED'],
]

const CORE_BADGES: readonly BadgeSpec[] = [
  ['PHONE', 'APPROVED'],
  ['EMAIL', 'APPROVED'],
  ['COMPANY', 'APPROVED'],
  ['IDNO', 'APPROVED'],
]

const STARTER_BADGES: readonly BadgeSpec[] = [
  ['PHONE', 'APPROVED'],
  ['EMAIL', 'APPROVED'],
]

/**
 * Consumer-facing delivery terms. Present exactly when the company has switched the
 * retail storefront on — `isRetail` is derived from it rather than typed twice, so a
 * shop with a delivery fee and no storefront cannot exist in the demo data.
 */
interface RetailSpec {
  /** What the shopper pays for delivery. 0 means the shop always delivers free. */
  deliveryFeeBani: number
  /** Order total from which delivery is free. */
  freeFromBani: number
  note: string
}

interface CompanySpec {
  key: string
  /** FARM | PRODUCER | WHOLESALER | RETAIL_CHAIN | HORECA | OTHER */
  kind: CompanyKind
  legalName: string
  displayName: string
  orgType: string
  description: string
  districtId: string
  /** Defaults to the administrative centre of `districtId`. */
  localityId?: string
  address: string
  contactPerson: string
  /** Owner user; `staff` reuses one of the four documented logins. */
  owner: { name: string; email: string; phone: string; locale: 'ru' | 'ro'; staffKey?: string }
  website?: string
  isSeller: boolean
  isBuyer: boolean
  hours: HoursKey
  paymentMethods: string[]
  languages: string[]
  deliveryZones: string[]
  deliveryTerms: string
  minOrderBani: number
  pickupAvailable: boolean
  deliveryPriceHint: string
  balanceBani: number
  trialDays?: number
  dealsCompleted: number
  avgResponseMinutes: number | null
  badges: readonly BadgeSpec[]
  photos: string[]
  /** Omitted for everyone who sells only to businesses. */
  retail?: RetailSpec
}

const COMPANIES: CompanySpec[] = [
  {
    key: 'agro-prim',
    kind: 'FARM',
    legalName: 'Agro Prim SRL',
    displayName: 'Agro Prim',
    orgType: 'SRL',
    description:
      'Овощеводческое хозяйство в Оргеевском районе. Выращиваем картофель, морковь, лук и капусту на 320 га, храним урожай в собственном хранилище с климат-контролем на 4 500 тонн. Отгружаем сеткой, ящиком и биг-бэгом, работаем с сетями и переработчиками круглый год.',
    districtId: 'orhei',
    address: 'ул. Василе Лупу, 14',
    contactPerson: 'Ion Rusu',
    owner: { name: 'Ion Rusu', email: 'seller@product.md', phone: '+37379000002', locale: 'ro', staffKey: 'seller' },
    website: 'https://agroprim.md',
    isSeller: true,
    isBuyer: false,
    hours: 'TRADE',
    paymentMethods: ['TRANSFER', 'CASH', 'DEFERRED'],
    languages: ['ru', 'ro'],
    deliveryZones: ['orhei', 'chisinau', 'straseni', 'criuleni', 'telenesti'],
    deliveryTerms: 'Доставка по Кишинёву и Оргеевскому району собственным транспортом от 500 кг. Отгрузка со склада ежедневно с 07:00.',
    minOrderBani: 200000,
    pickupAvailable: true,
    deliveryPriceHint: 'Бесплатно от 1 000 кг, далее 4 MDL/км',
    balanceBani: 29_500,
    dealsCompleted: 34,
    avgResponseMinutes: 25,
    badges: FULL_BADGES,
    photos: [...PHOTO.field, ...PHOTO.potatoes],
  },
  {
    key: 'codru-fresh',
    kind: 'FARM',
    legalName: 'Codru Fresh SRL',
    displayName: 'Codru Fresh',
    orgType: 'SRL',
    description:
      'Садоводческое предприятие в Страшенском районе: яблоки, груши, сливы и ягоды. Сортировочная линия с фотокалибровкой, холодильники с регулируемой атмосферой на 2 000 тонн. Поставляем как в сети Молдовы, так и на экспорт.',
    districtId: 'straseni',
    address: 'ул. Штефан чел Маре, 78',
    contactPerson: 'Vasile Ciobanu',
    owner: { name: 'Vasile Ciobanu', email: 'vasile.ciobanu@codru-fresh.md', phone: '+37369000101', locale: 'ro' },
    website: 'https://codrufresh.md',
    isSeller: true,
    isBuyer: false,
    hours: 'TRADE',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ro', 'ru', 'en'],
    deliveryZones: ['straseni', 'chisinau', 'calarasi', 'nisporeni', 'ungheni'],
    deliveryTerms: 'Отгрузка паллетами со склада в Страшенах. Доставка по Кишинёву — на следующий рабочий день.',
    minOrderBani: 500000,
    pickupAvailable: true,
    deliveryPriceHint: 'От 300 MDL за рейс по Кишинёву',
    balanceBani: 12_400,
    dealsCompleted: 21,
    avgResponseMinutes: 45,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['ANSA', 'APPROVED'], ['TRUSTED_SUPPLIER', 'APPROVED']],
    photos: [...PHOTO.apples],
  },
  {
    key: 'lactate-nistru',
    kind: 'PRODUCER',
    legalName: 'Lactate Nistru SRL',
    displayName: 'Lactate Nistru',
    orgType: 'SRL',
    description:
      'Молочный завод в Криулянах. Перерабатываем 40 тонн сырого молока в сутки: пастеризованное молоко, сметана, творог, сыры и сливочное масло. Собственная лаборатория, сертификация ANSA, доставка рефрижераторами каждое утро.',
    districtId: 'criuleni',
    address: 'ул. Индустриалэ, 3',
    contactPerson: 'Maria Croitoru',
    owner: { name: 'Maria Croitoru', email: 'maria.croitoru@lactate-nistru.md', phone: '+37369000102', locale: 'ru' },
    website: 'https://lactatenistru.md',
    isSeller: true,
    isBuyer: false,
    hours: 'EARLY',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ru', 'ro'],
    deliveryZones: ['criuleni', 'chisinau', 'anenii-noi', 'dubasari', 'orhei'],
    deliveryTerms: 'Ежедневная доставка рефрижератором до 09:00. Минимальная партия — 200 л.',
    minOrderBani: 280000,
    pickupAvailable: false,
    deliveryPriceHint: 'Включена в стоимость от 200 л',
    balanceBani: 14_000,
    dealsCompleted: 57,
    avgResponseMinutes: 18,
    badges: FULL_BADGES,
    photos: [...PHOTO.milk, ...PHOTO.cheese],
    // A producer selling straight to households alongside its wholesale business — the
    // storefront is not only for chains, and the demo has to show that.
    retail: {
      deliveryFeeBani: 4_000,
      freeFromBani: 25_000,
      note: 'Развозим по Кишинёву и Криулянам по вторникам и пятницам до 12:00. Заказ принимаем накануне до 18:00.',
    },
  },
  {
    key: 'carne-balti',
    kind: 'PRODUCER',
    legalName: 'Carne Bălți SA',
    displayName: 'Carne Bălți',
    orgType: 'SA',
    description:
      'Мясокомбинат в Бельцах: убой, разделка и обвалка говядины, свинины и баранины. Охлаждённое мясо отгружаем в течение 24 часов после убоя, замороженное — блоками по 20 кг. Ветеринарные сертификаты ANSA на каждую партию.',
    districtId: 'balti',
    address: 'ул. Индустриалэ, 22',
    contactPerson: 'Andrei Postică',
    owner: { name: 'Andrei Postică', email: 'andrei.postica@carne-balti.md', phone: '+37369000103', locale: 'ru' },
    isSeller: true,
    isBuyer: false,
    hours: 'EARLY',
    paymentMethods: ['TRANSFER', 'CASH'],
    languages: ['ru', 'ro'],
    deliveryZones: ['balti', 'singerei', 'falesti', 'riscani', 'drochia', 'chisinau'],
    deliveryTerms: 'Рефрижераторная доставка по северу Молдовы ежедневно, в Кишинёв — по вторникам и пятницам.',
    minOrderBani: 400000,
    pickupAvailable: true,
    deliveryPriceHint: '350 MDL по Бельцам, 900 MDL до Кишинёва',
    balanceBani: 3_000,
    dealsCompleted: 48,
    avgResponseMinutes: 32,
    badges: FULL_BADGES,
    photos: [...PHOTO.beef],
  },
  {
    key: 'legume-de-orhei',
    kind: 'FARM',
    legalName: 'Legume de Orhei SRL',
    displayName: 'Legume de Orhei',
    orgType: 'SRL',
    description:
      'Тепличный комбинат под Оргеевом: огурцы, помидоры и зелень круглый год. 4,2 га теплиц пятого поколения, капельный полив, шмелиное опыление. Срезка утром — отгрузка в тот же день.',
    districtId: 'orhei',
    localityId: 'orhei-peresecina',
    address: 'ул. Ливезилор, 41',
    contactPerson: 'Nicolae Bejan',
    owner: { name: 'Nicolae Bejan', email: 'nicolae.bejan@legume-orhei.md', phone: '+37369000104', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'TRADE',
    paymentMethods: ['TRANSFER', 'CASH'],
    languages: ['ro', 'ru'],
    deliveryZones: ['orhei', 'chisinau', 'telenesti', 'rezina'],
    deliveryTerms: 'Доставка в Кишинёв ежедневно, кроме воскресенья. Лоток и паллета — оборотная тара.',
    minOrderBani: 150000,
    pickupAvailable: true,
    deliveryPriceHint: '250 MDL за рейс до Кишинёва',
    balanceBani: 6_800,
    trialDays: 21,
    dealsCompleted: 12,
    avgResponseMinutes: 60,
    badges: [...CORE_BADGES, ['ANSA', 'PENDING'], ['DOCUMENTS', 'PENDING']],
    photos: [...PHOTO.cucumbers],
  },
  {
    key: 'pescuit-prut',
    kind: 'WHOLESALER',
    legalName: 'Pescuit Prut SRL',
    displayName: 'Pescuit Prut',
    orgType: 'SRL',
    description:
      'Рыбное хозяйство и оптовая база в Кагуле. Живой карп и толстолобик из собственных прудов, замороженная форель, сельдь и морепродукты от европейских поставщиков. Отгрузка в изотермических ящиках со льдом.',
    districtId: 'cahul',
    address: 'ул. Прутулуй, 9',
    contactPerson: 'Sergiu Cazacu',
    owner: { name: 'Sergiu Cazacu', email: 'sergiu.cazacu@pescuit-prut.md', phone: '+37369000105', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'TRADE',
    paymentMethods: ['TRANSFER', 'CASH', 'CARD'],
    languages: ['ro', 'ru'],
    deliveryZones: ['cahul', 'cantemir', 'taraclia', 'leova', 'chisinau'],
    deliveryTerms: 'Доставка по югу Молдовы дважды в неделю, в Кишинёв — по средам.',
    minOrderBani: 300000,
    pickupAvailable: true,
    deliveryPriceHint: '600 MDL до Кишинёва',
    balanceBani: 21_300,
    dealsCompleted: 19,
    avgResponseMinutes: 90,
    badges: [...CORE_BADGES, ['ANSA', 'APPROVED'], ['DOCUMENTS', 'APPROVED']],
    photos: [...PHOTO.trout],
  },
  {
    key: 'ambalaje-chisinau',
    kind: 'PRODUCER',
    legalName: 'Ambalaje Chișinău SRL',
    displayName: 'Ambalaje Chișinău',
    orgType: 'SRL',
    description:
      'Производство и продажа пищевой упаковки: коробки для пиццы, гофрокороба, контейнеры, пакеты, стретч-плёнка и этикетки. Собственная флексопечать в четыре краски, тираж от 1 000 штук, макет — бесплатно.',
    districtId: 'chisinau',
    localityId: 'chisinau-ciocana',
    address: 'ул. Узинелор, 108',
    contactPerson: 'Elena Grosu',
    owner: { name: 'Elena Grosu', email: 'elena.grosu@ambalaje.md', phone: '+37369000106', locale: 'ru' },
    website: 'https://ambalaje-chisinau.md',
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'CARD', 'DEFERRED'],
    languages: ['ru', 'ro', 'en'],
    deliveryZones: ['chisinau', 'ialoveni', 'straseni', 'anenii-noi', 'criuleni', 'balti'],
    deliveryTerms: 'Со склада в Чеканах — самовывоз в день заказа. Доставка по Кишинёву на следующий день.',
    minOrderBani: 100000,
    pickupAvailable: true,
    deliveryPriceHint: 'Бесплатно от 3 000 MDL по Кишинёву',
    balanceBani: 24_500,
    dealsCompleted: 73,
    avgResponseMinutes: 22,
    badges: FULL_BADGES,
    photos: [...PHOTO.boxes],
  },
  {
    key: 'brutaria-veche',
    kind: 'PRODUCER',
    legalName: 'Brutăria Veche SRL',
    displayName: 'Brutăria Veche',
    orgType: 'SRL',
    description:
      'Пекарня полного цикла в Кишинёве. Хлеб на закваске, багеты, чиабатта и замороженные полуфабрикаты выпечки для HoReCa. Ночная смена — утренняя доставка в кафе и отели до 07:00.',
    districtId: 'chisinau',
    localityId: 'chisinau-botanica',
    address: 'ул. Мунчешть, 121',
    contactPerson: 'Tudor Melnic',
    owner: { name: 'Tudor Melnic', email: 'tudor.melnic@brutaria-veche.md', phone: '+37369000107', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'EARLY',
    paymentMethods: ['TRANSFER', 'CASH'],
    languages: ['ro', 'ru'],
    deliveryZones: ['chisinau', 'ialoveni', 'straseni'],
    deliveryTerms: 'Доставка ежедневно до 07:00 по Кишинёву. Заказ принимается до 16:00 предыдущего дня.',
    minOrderBani: 50000,
    pickupAvailable: true,
    deliveryPriceHint: 'Бесплатно от 800 MDL',
    balanceBani: 4_150,
    trialDays: 12,
    dealsCompleted: 15,
    avgResponseMinutes: 40,
    badges: [...CORE_BADGES, ['ANSA', 'APPROVED']],
    photos: [...PHOTO.bread],
  },
  {
    key: 'miere-de-codru',
    kind: 'FARM',
    legalName: 'Miere de Codru GȚ',
    displayName: 'Miere de Codru',
    orgType: 'GT',
    description:
      'Пасека на 900 ульев в Кодрах. Акациевый, липовый и полифлорный мёд, перга и воск. Кочуем за цветением с апреля по август, каждая партия проходит анализ на влажность и диастазное число.',
    districtId: 'calarasi',
    address: 'ул. Александру чел Бун, 5',
    contactPerson: 'Grigore Cebotari',
    owner: { name: 'Grigore Cebotari', email: 'grigore.cebotari@miere-codru.md', phone: '+37369000108', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'CASH'],
    languages: ['ro', 'ru'],
    deliveryZones: ['calarasi', 'chisinau', 'straseni', 'ungheni', 'nisporeni'],
    deliveryTerms: 'Отгрузка флягами по 40 кг и вёдрами по 25 кг. Доставка в Кишинёв по четвергам.',
    minOrderBani: 250000,
    pickupAvailable: true,
    deliveryPriceHint: '400 MDL до Кишинёва',
    balanceBani: 8_900,
    dealsCompleted: 9,
    avgResponseMinutes: 120,
    badges: [...STARTER_BADGES, ['COMPANY', 'APPROVED'], ['ANSA', 'APPROVED'], ['DOCUMENTS', 'PENDING']],
    photos: [...PHOTO.honey],
  },
  {
    key: 'avicola-singerei',
    kind: 'FARM',
    legalName: 'Avicola Sîngerei SA',
    displayName: 'Avicola Sîngerei',
    orgType: 'SA',
    description:
      'Птицефабрика полного цикла: инкубаторий, откорм бройлера, убойный цех и яичное производство. 180 000 голов единовременного содержания, 350 000 яиц в сутки. Собственный автопарк рефрижераторов.',
    districtId: 'singerei',
    address: 'ул. Индепенденцей, 62',
    contactPerson: 'Oleg Rotaru',
    owner: { name: 'Oleg Rotaru', email: 'oleg.rotaru@avicola-singerei.md', phone: '+37369000109', locale: 'ru' },
    website: 'https://avicola-singerei.md',
    isSeller: true,
    isBuyer: false,
    hours: 'EARLY',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ru', 'ro'],
    deliveryZones: ['singerei', 'balti', 'floresti', 'telenesti', 'chisinau', 'orhei'],
    deliveryTerms: 'Доставка по всей стране от 500 кг. График отгрузки согласуется на неделю вперёд.',
    minOrderBani: 350000,
    pickupAvailable: true,
    deliveryPriceHint: 'Бесплатно от 2 000 кг',
    balanceBani: 41_200,
    dealsCompleted: 64,
    avgResponseMinutes: 28,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['ANSA', 'APPROVED'], ['BANK', 'APPROVED'], ['TRUSTED_SUPPLIER', 'APPROVED']],
    photos: [...PHOTO.chickenRaw, ...PHOTO.eggs],
  },
  {
    key: 'moara-de-sus',
    kind: 'PRODUCER',
    legalName: 'Moara de Sus SRL',
    displayName: 'Moara de Sus',
    orgType: 'SRL',
    description:
      'Мельничный комплекс в Единецком районе. Пшеничная мука высшего и первого сорта, кукурузная мука (мэлай), отруби и манная крупа. Помол 120 тонн в сутки, силосы на 8 000 тонн зерна.',
    districtId: 'edinet',
    address: 'ул. Индустриалэ, 4',
    contactPerson: 'Petru Ceban',
    owner: { name: 'Petru Ceban', email: 'petru.ceban@moara-de-sus.md', phone: '+37369000110', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ro', 'ru'],
    deliveryZones: ['edinet', 'briceni', 'ocnita', 'donduseni', 'riscani', 'balti'],
    deliveryTerms: 'Отгрузка мешками по 50 кг и биг-бэгами по 1 тонне. Самовывоз круглосуточно.',
    minOrderBani: 500000,
    pickupAvailable: true,
    deliveryPriceHint: '5 MDL/км от склада',
    balanceBani: 0,
    dealsCompleted: 27,
    avgResponseMinutes: 75,
    badges: [...CORE_BADGES, ['BANK', 'APPROVED']],
    photos: [...PHOTO.flour, ...PHOTO.grain],
  },
  {
    key: 'struguri-de-sud',
    kind: 'FARM',
    legalName: 'Struguri de Sud SRL',
    displayName: 'Struguri de Sud',
    orgType: 'SRL',
    description:
      'Виноградарское хозяйство в Комрате. Столовые сорта Молдова, Кардинал и Августин, 140 га насаждений. Ящик 10 кг с подложкой, холодильник на 600 тонн, отгрузка с сентября по февраль.',
    districtId: 'comrat',
    address: 'ул. Победы, 118',
    contactPerson: 'Dmitrii Curdov',
    owner: { name: 'Dmitrii Curdov', email: 'dmitrii.curdov@struguri-sud.md', phone: '+37369000111', locale: 'ru' },
    isSeller: true,
    isBuyer: false,
    hours: 'TRADE',
    paymentMethods: ['TRANSFER', 'CASH'],
    languages: ['ru', 'ro'],
    deliveryZones: ['comrat', 'ceadir-lunga', 'gagauzia', 'cimislia', 'chisinau'],
    deliveryTerms: 'Отгрузка паллетами, 60 ящиков на паллету. Доставка в Кишинёв — от 2 паллет.',
    minOrderBani: 400000,
    pickupAvailable: true,
    deliveryPriceHint: '800 MDL до Кишинёва',
    balanceBani: 15_600,
    dealsCompleted: 11,
    avgResponseMinutes: null,
    badges: [...STARTER_BADGES],
    photos: [...PHOTO.grapes],
  },
  {
    key: 'oleo-sud',
    kind: 'PRODUCER',
    legalName: 'Oleo Sud SRL',
    displayName: 'Oleo Sud',
    orgType: 'SRL',
    description:
      'Маслоэкстракционный завод в Чимишлии. Подсолнечное масло рафинированное дезодорированное и нерафинированное первого отжима, жмых и шрот. Налив в канистры 5 и 10 л, бутылки 1 и 5 л, автоцистерны.',
    districtId: 'cimislia',
    address: 'ул. Штефан чел Маре, 190',
    contactPerson: 'Valeriu Munteanu',
    owner: { name: 'Valeriu Munteanu', email: 'valeriu.munteanu@oleo-sud.md', phone: '+37369000112', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER'],
    languages: ['ro', 'ru'],
    deliveryZones: ['cimislia', 'hincesti', 'leova', 'basarabeasca', 'chisinau'],
    deliveryTerms: 'Отгрузка паллетами по 640 л. Доставка по стране от 2 паллет.',
    minOrderBani: 600000,
    pickupAvailable: true,
    deliveryPriceHint: '4,5 MDL/км',
    balanceBani: 33_400,
    dealsCompleted: 30,
    avgResponseMinutes: 55,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['ANSA', 'APPROVED']],
    photos: [...PHOTO.oil],
  },
  {
    key: 'frigo-market',
    kind: 'WHOLESALER',
    legalName: 'Frigo Market SRL',
    displayName: 'Frigo Market',
    orgType: 'SRL',
    description:
      'Оптовая база замороженных продуктов в Кишинёве. Овощные смеси, ягоды шоковой заморозки, картофель фри и полуфабрикаты. Склад на 1 200 паллето-мест при −22 °C, отгрузка рефрижератором.',
    districtId: 'chisinau',
    localityId: 'chisinau-riscani',
    address: 'ул. Каля Мошилор, 12/1',
    contactPerson: 'Radu Sîrbu',
    owner: { name: 'Radu Sîrbu', email: 'radu.sirbu@frigomarket.md', phone: '+37369000113', locale: 'ru' },
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'CARD', 'DEFERRED'],
    languages: ['ru', 'ro'],
    deliveryZones: ['chisinau', 'ialoveni', 'anenii-noi', 'straseni', 'criuleni', 'orhei'],
    deliveryTerms: 'Доставка рефрижератором по Кишинёву в день заказа при оформлении до 12:00.',
    minOrderBani: 200000,
    pickupAvailable: true,
    deliveryPriceHint: 'Бесплатно от 5 000 MDL',
    balanceBani: 9_700,
    dealsCompleted: 42,
    avgResponseMinutes: 35,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['TRUSTED_SUPPLIER', 'APPROVED']],
    photos: [...PHOTO.frozenVeg, ...PHOTO.warehouse],
  },
  {
    key: 'conserve-nistrene',
    kind: 'PRODUCER',
    legalName: 'Conserve Nistrene SRL',
    displayName: 'Conserve Nistrene',
    orgType: 'SRL',
    description:
      'Консервный завод в Анений Ной. Кабачковая икра, лечо, зэкускэ, маринованные огурцы и томаты, варенье. Сырьё — только молдавское, стерилизация в автоклавах, стеклобанка 0,72 и 1,5 л.',
    districtId: 'anenii-noi',
    address: 'ул. Кишинэулуй, 27',
    contactPerson: 'Svetlana Lungu',
    owner: { name: 'Svetlana Lungu', email: 'svetlana.lungu@conserve-nistrene.md', phone: '+37369000114', locale: 'ru' },
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ru', 'ro'],
    deliveryZones: ['anenii-noi', 'chisinau', 'causeni', 'stefan-voda', 'criuleni'],
    deliveryTerms: 'Отгрузка коробами по 8 банок, паллета — 720 банок.',
    minOrderBani: 300000,
    pickupAvailable: true,
    deliveryPriceHint: '300 MDL до Кишинёва',
    balanceBani: 2_450,
    trialDays: 5,
    dealsCompleted: 17,
    avgResponseMinutes: 110,
    badges: [...CORE_BADGES, ['ANSA', 'APPROVED']],
    photos: [...PHOTO.canned],
  },
  {
    key: 'apa-izvor',
    kind: 'PRODUCER',
    legalName: 'Apă Izvor SRL',
    displayName: 'Apă Izvor',
    orgType: 'SRL',
    description:
      'Розлив питьевой и минеральной воды из артезианской скважины в Яловенском районе. ПЭТ 0,5 / 1,5 / 5 л и бутыли 19 л для кулеров. Доставка воды в офисы и HoReCa по графику.',
    districtId: 'ialoveni',
    address: 'ул. Александру чел Бун, 44',
    contactPerson: 'Anatol Guțu',
    owner: { name: 'Anatol Guțu', email: 'anatol.gutu@apa-izvor.md', phone: '+37369000115', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'CASH', 'CARD'],
    languages: ['ro', 'ru'],
    deliveryZones: ['ialoveni', 'chisinau', 'straseni', 'hincesti'],
    deliveryTerms: 'Доставка по Кишинёву и Яловенам два раза в неделю по маршруту.',
    minOrderBani: 60000,
    pickupAvailable: true,
    deliveryPriceHint: 'Бесплатно от 1 000 MDL',
    balanceBani: 18_050,
    dealsCompleted: 25,
    avgResponseMinutes: 50,
    badges: [...CORE_BADGES, ['ANSA', 'APPROVED'], ['DOCUMENTS', 'APPROVED']],
    photos: [...PHOTO.water],
  },
  {
    key: 'horeca-service-md',
    kind: 'WHOLESALER',
    legalName: 'HoReCa Service MD SRL',
    displayName: 'HoReCa Service MD',
    orgType: 'SRL',
    description:
      'Оснащение ресторанов, кафе и отелей: холодильное и тепловое оборудование, нержавеющая мебель, посуда и расходные материалы. Проектирование кухни, монтаж, сервис и гарантия 12 месяцев. Сами закупаем продукты для кейтеринговых проектов.',
    districtId: 'chisinau',
    localityId: 'chisinau-centru',
    address: 'бул. Дачия, 49/3',
    contactPerson: 'Cristina Damian',
    owner: { name: 'Cristina Damian', email: 'cristina.damian@horeca-service.md', phone: '+37369000116', locale: 'ru' },
    website: 'https://horeca-service.md',
    isSeller: true,
    isBuyer: true,
    hours: 'HORECA',
    paymentMethods: ['TRANSFER', 'CARD', 'DEFERRED'],
    languages: ['ru', 'ro', 'en'],
    deliveryZones: ['chisinau', 'ialoveni', 'anenii-noi', 'straseni', 'balti', 'cahul'],
    deliveryTerms: 'Оборудование — доставка и монтаж по всей Молдове. Расходники — со склада в Кишинёве.',
    minOrderBani: 100000,
    pickupAvailable: true,
    deliveryPriceHint: 'По договорённости, зависит от габарита',
    balanceBani: 26_800,
    dealsCompleted: 38,
    avgResponseMinutes: 20,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['BANK', 'APPROVED'], ['TRUSTED_SUPPLIER', 'APPROVED']],
    photos: [...PHOTO.kitchen],
  },
  {
    key: 'curat-prof',
    kind: 'WHOLESALER',
    legalName: 'Curat Prof SRL',
    displayName: 'Curat Prof',
    orgType: 'SRL',
    description:
      'Профессиональная химия и гигиена для пищевых производств и HoReCa: моющие и дезинфицирующие средства, бумажная продукция, перчатки, дозаторы. Обучаем персонал и составляем план санитарии.',
    districtId: 'balti',
    address: 'ул. Каля Ешилор, 8',
    contactPerson: 'Igor Bordeianu',
    owner: { name: 'Igor Bordeianu', email: 'igor.bordeianu@curatprof.md', phone: '+37369000117', locale: 'ru' },
    isSeller: true,
    isBuyer: false,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'CARD'],
    languages: ['ru', 'ro'],
    deliveryZones: ['balti', 'singerei', 'falesti', 'riscani', 'soroca', 'chisinau'],
    deliveryTerms: 'Доставка по северу — раз в неделю по маршруту, по Кишинёву — курьером.',
    minOrderBani: 80000,
    pickupAvailable: true,
    deliveryPriceHint: 'Бесплатно от 1 500 MDL',
    balanceBani: 5_400,
    dealsCompleted: 22,
    avgResponseMinutes: 65,
    badges: [...STARTER_BADGES, ['COMPANY', 'PENDING'], ['IDNO', 'PENDING']],
    photos: [...PHOTO.cleaning],
  },
  {
    key: 'transfrig-md',
    kind: 'OTHER',
    legalName: 'TransFrig MD SRL',
    displayName: 'TransFrig MD',
    orgType: 'SRL',
    description:
      'Рефрижераторные перевозки по Молдове и Румынии. 14 машин от 3 до 22 тонн, режим от −25 °C до +12 °C, датчики температуры с онлайн-мониторингом и распечаткой термограммы по факту рейса.',
    districtId: 'chisinau',
    localityId: 'chisinau-stauceni',
    address: 'ул. Транспортулуй, 2',
    contactPerson: 'Mihai Ursu',
    owner: { name: 'Mihai Ursu', email: 'mihai.ursu@transfrig.md', phone: '+37369000118', locale: 'ro' },
    isSeller: true,
    isBuyer: false,
    hours: 'ALWAYS',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ro', 'ru', 'en'],
    deliveryZones: ['chisinau', 'balti', 'cahul', 'orhei', 'ungheni', 'soroca', 'comrat'],
    deliveryTerms: 'Подача машины в течение 12 часов по Кишинёву и 24 часов по стране.',
    minOrderBani: 150000,
    pickupAvailable: false,
    deliveryPriceHint: '12 MDL/км, минимум 900 MDL за рейс',
    balanceBani: 47_900,
    dealsCompleted: 51,
    avgResponseMinutes: 15,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['BANK', 'APPROVED']],
    photos: [...PHOTO.truck],
  },
  {
    key: 'gustul-casei',
    kind: 'PRODUCER',
    legalName: 'Gustul Casei SRL',
    displayName: 'Gustul Casei',
    orgType: 'SRL',
    description:
      'Цех полуфабрикатов и домашней консервации в Хынчештах. Пельмени, вареники, голубцы, плацинды шоковой заморозки, варенье и соленья. Закупаем мясо, муку и овощи у молдавских хозяйств.',
    districtId: 'hincesti',
    address: 'ул. Михалча Хынку, 33',
    contactPerson: 'Larisa Chirtoacă',
    owner: { name: 'Larisa Chirtoacă', email: 'larisa.chirtoaca@gustulcasei.md', phone: '+37369000119', locale: 'ru' },
    isSeller: true,
    isBuyer: true,
    hours: 'TRADE',
    paymentMethods: ['TRANSFER', 'CASH'],
    languages: ['ru', 'ro'],
    deliveryZones: ['hincesti', 'chisinau', 'ialoveni', 'cimislia', 'leova'],
    deliveryTerms: 'Отгрузка коробами по 5 кг, доставка рефрижератором по вторникам и пятницам.',
    minOrderBani: 120000,
    pickupAvailable: true,
    deliveryPriceHint: '350 MDL до Кишинёва',
    balanceBani: 11_250,
    dealsCompleted: 20,
    avgResponseMinutes: 80,
    badges: [...CORE_BADGES, ['ANSA', 'APPROVED']],
    photos: [...PHOTO.dumplings],
  },

  // --- buyers ----------------------------------------------------------------
  {
    key: 'la-plopi',
    kind: 'HORECA',
    legalName: 'La Plopi SRL',
    displayName: 'Ресторан «La Plopi»',
    orgType: 'SRL',
    description:
      'Ресторан молдавской кухни на 140 посадочных мест в центре Кишинёва плюс банкетный зал. Закупаем овощи, мясо, молочные продукты и зелень ежедневно, работаем по договору поставки с отсрочкой 14 дней.',
    districtId: 'chisinau',
    localityId: 'chisinau-centru',
    address: 'ул. Пушкина, 24',
    contactPerson: 'Александру Попа',
    owner: { name: 'Александру Попа', email: 'buyer@product.md', phone: '+37379000001', locale: 'ru', staffKey: 'buyer' },
    isSeller: false,
    isBuyer: true,
    hours: 'HORECA',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ru', 'ro'],
    deliveryZones: ['chisinau'],
    deliveryTerms: 'Приём товара с 07:00 до 11:00 через служебный вход со двора.',
    minOrderBani: 0,
    pickupAvailable: false,
    deliveryPriceHint: '',
    balanceBani: 0,
    dealsCompleted: 44,
    avgResponseMinutes: 30,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED']],
    photos: [...PHOTO.restaurant],
  },
  {
    key: 'doi-prieteni',
    kind: 'HORECA',
    legalName: 'Doi Prieteni SRL',
    displayName: 'Pizzeria «Doi Prieteni»',
    orgType: 'SRL',
    description:
      'Сеть из четырёх пиццерий в Унгенах и Кишинёве. Ежемесячно закупаем моцареллу, муку, томатную пасту и коробки для пиццы. Готовы к долгосрочным контрактам с фиксированной ценой на квартал.',
    districtId: 'ungheni',
    address: 'ул. Национала, 15',
    contactPerson: 'Veronica Balan',
    owner: { name: 'Veronica Balan', email: 'veronica.balan@doiprieteni.md', phone: '+37369000120', locale: 'ro' },
    isSeller: false,
    isBuyer: true,
    hours: 'HORECA',
    paymentMethods: ['TRANSFER', 'CARD'],
    languages: ['ro', 'ru'],
    deliveryZones: ['ungheni', 'chisinau'],
    deliveryTerms: 'Приём поставок на центральный склад в Унгенах, пн–сб с 08:00 до 12:00.',
    minOrderBani: 0,
    pickupAvailable: false,
    deliveryPriceHint: '',
    balanceBani: 0,
    dealsCompleted: 18,
    avgResponseMinutes: 95,
    badges: [...STARTER_BADGES, ['COMPANY', 'APPROVED']],
    photos: [],
  },
  {
    key: 'codrii-albi',
    kind: 'HORECA',
    legalName: 'Codrii Albi SRL',
    displayName: 'Hotel «Codrii Albi»',
    orgType: 'SRL',
    description:
      'Загородный отель на 60 номеров с рестораном и конференц-залом в Яловенском районе. Закупаем продукты питания, воду и одноразовую посуду для банкетов и кейтеринга.',
    districtId: 'ialoveni',
    localityId: 'ialoveni-costesti',
    address: 'ул. Лакулуй, 1',
    contactPerson: 'Ștefan Rusnac',
    owner: { name: 'Ștefan Rusnac', email: 'stefan.rusnac@codriialbi.md', phone: '+37369000121', locale: 'ro' },
    isSeller: false,
    isBuyer: true,
    hours: 'ALWAYS',
    paymentMethods: ['TRANSFER', 'CARD', 'DEFERRED'],
    languages: ['ro', 'ru', 'en'],
    deliveryZones: ['ialoveni', 'chisinau'],
    deliveryTerms: 'Приём поставок ежедневно с 08:00 до 14:00, склад на цокольном этаже.',
    minOrderBani: 0,
    pickupAvailable: false,
    deliveryPriceHint: '',
    balanceBani: 0,
    dealsCompleted: 26,
    avgResponseMinutes: 40,
    badges: [...CORE_BADGES],
    photos: [],
  },
  {
    key: 'retail-plus-md',
    kind: 'RETAIL_CHAIN',
    legalName: 'Retail Plus MD SRL',
    displayName: 'Retail Plus MD',
    orgType: 'SRL',
    description:
      'Сеть из 22 продуктовых магазинов у дома в Сороках, Флорештах и Дрокии. Централизованная закупка через распределительный центр, работаем с поставщиками по годовым контрактам.',
    districtId: 'soroca',
    address: 'ул. Индепенденцей, 71',
    contactPerson: 'Natalia Cojocaru',
    owner: { name: 'Natalia Cojocaru', email: 'natalia.cojocaru@retailplus.md', phone: '+37369000122', locale: 'ru' },
    website: 'https://retailplus.md',
    isSeller: false,
    isBuyer: true,
    hours: 'OFFICE',
    paymentMethods: ['TRANSFER', 'DEFERRED'],
    languages: ['ru', 'ro'],
    deliveryZones: ['soroca', 'floresti', 'drochia'],
    deliveryTerms: 'Приём на РЦ в Сороках пн–пт с 07:00 до 16:00, обязательна предварительная запись.',
    minOrderBani: 0,
    pickupAvailable: false,
    deliveryPriceHint: '',
    balanceBani: 0,
    dealsCompleted: 61,
    avgResponseMinutes: 55,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['BANK', 'APPROVED']],
    photos: [...PHOTO.market],
  },
  // --- supermarket chains that also deliver to households --------------------
  // Both buy wholesale and sell on, which is what `kind` is for: `isBuyer`/`isSeller`
  // say which side of the marketplace they play, RETAIL_CHAIN says what they are. Retail
  // Plus MD above is the counter-example — the same kind, buying only, storefront off.
  {
    key: 'piata-verde',
    kind: 'RETAIL_CHAIN',
    legalName: 'Piața Verde Retail SRL',
    displayName: 'Piața Verde',
    orgType: 'SRL',
    description:
      'Сеть из 14 магазинов у дома в Кишинёве. Овощи и фрукты от молдавских хозяйств, молочное и мясное — от местных заводов. Доставляем на дом по городу в день заказа, если оформить до 16:00.',
    districtId: 'chisinau',
    localityId: 'chisinau-botanica',
    address: 'ул. Дачия, 47',
    contactPerson: 'Cristina Melnic',
    owner: { name: 'Cristina Melnic', email: 'cristina.melnic@piataverde.md', phone: '+37369000123', locale: 'ru' },
    website: 'https://piataverde.md',
    isSeller: true,
    isBuyer: true,
    hours: 'ALWAYS',
    paymentMethods: ['TRANSFER', 'CARD', 'CASH'],
    languages: ['ru', 'ro'],
    deliveryZones: ['chisinau', 'ialoveni', 'straseni'],
    deliveryTerms: 'Приём поставок на распределительный центр в Кишинёве ежедневно с 06:00 до 14:00.',
    minOrderBani: 0,
    pickupAvailable: true,
    deliveryPriceHint: '35 MDL по Кишинёву, бесплатно от 300 MDL',
    balanceBani: 0,
    dealsCompleted: 0,
    avgResponseMinutes: 20,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED'], ['ANSA', 'APPROVED']],
    photos: [...PHOTO.market],
    retail: {
      deliveryFeeBani: 3_500,
      freeFromBani: 30_000,
      note: 'Доставляем по Кишинёву с 09:00 до 21:00. Заказы до 16:00 привозим в тот же день, позже — на следующий.',
    },
  },
  {
    key: 'familia-market',
    kind: 'RETAIL_CHAIN',
    legalName: 'Familia Market SRL',
    displayName: 'Familia Market',
    orgType: 'SRL',
    description:
      'Супермаркеты в Бельцах и на севере страны: девять точек и служба доставки. Работаем напрямую с фермерами и мельницами региона, поэтому базовая корзина стоит дешевле, чем в столице.',
    districtId: 'balti',
    localityId: 'balti-balti',
    address: 'ул. Штефан чел Маре, 12',
    contactPerson: 'Oleg Rotaru',
    owner: { name: 'Oleg Rotaru', email: 'oleg.rotaru@familiamarket.md', phone: '+37369000124', locale: 'ro' },
    website: 'https://familiamarket.md',
    isSeller: true,
    isBuyer: true,
    hours: 'ALWAYS',
    paymentMethods: ['TRANSFER', 'CARD', 'CASH'],
    languages: ['ro', 'ru'],
    deliveryZones: ['balti', 'singerei', 'falesti', 'riscani'],
    deliveryTerms: 'Приём товара на складе в Бельцах пн–сб с 07:00 до 15:00.',
    minOrderBani: 0,
    pickupAvailable: true,
    deliveryPriceHint: '25 MDL по Бельцам, бесплатно от 400 MDL',
    balanceBani: 0,
    dealsCompleted: 0,
    avgResponseMinutes: 35,
    badges: [...CORE_BADGES, ['DOCUMENTS', 'APPROVED']],
    photos: [...PHOTO.market],
    retail: {
      deliveryFeeBani: 2_500,
      freeFromBani: 40_000,
      note: 'Доставка по Бельцам ежедневно с 10:00 до 20:00. В Сынжерей и Фэлешть — по четвергам.',
    },
  },
]

const COMPANY_BY_KEY = new Map(COMPANIES.map((company) => [company.key, company]))

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * An attribute value as a plain JS value. The writer looks the key up with
 * `resolveAttribute` and picks the column from the declared attribute type, so a
 * SELECT gets an optionId and a NUMBER gets valueNumber without repeating the type
 * here. A value that does not resolve is a bug, not a silent skip.
 */
type AttrValue = string | number | boolean | Date

interface TierSpec {
  minQty: number
  /** null = open ended; tiers are validated to be ascending and non-overlapping. */
  maxQty: number | null
  priceBani: number
}

interface ProductSpec {
  seller: string
  category: string
  title: string
  description: string
  priceBani: number
  /**
   * What the price WAS before the seller lowered it — never a percent, and always
   * higher than `priceBani`. This is the whole mechanism behind «Акции»: a listing
   * appears there because the number below went down, not because anybody paid.
   */
  oldPriceBani?: number
  /** Days until the discount ends. Omitted = runs until the seller ends it. */
  discountEndsIn?: number
  /** Also sold to households through the delivery storefront. */
  isRetail?: boolean
  /** Household price. Omitted = the shopper pays `priceBani`. */
  retailPriceBani?: number
  /** Smallest quantity a household may order. Almost always 1. */
  retailMinQty?: number
  unit: string
  minOrderQty: number
  availableQty: number | null
  status: string
  availability?: string
  /** Days ago the listing went live. Undefined for DRAFT/PENDING. */
  publishedAgo?: number
  expiresIn?: number
  bumpedAgo?: number
  originCountry?: string
  productionPlace?: string
  manufacturer?: string
  batchNumber?: string
  producedAgo?: number
  bestBeforeIn?: number
  storageConditions?: string
  storageTempC?: string
  allergens?: string
  composition?: string
  packaging?: string
  supplyRegularity?: string
  deliveryTerms?: string
  deliveryPriceBani?: number
  pickupAvailable?: boolean
  deliveryRegions?: string[]
  videoUrl?: string
  moderatorComment?: string
  photos: readonly string[]
  tiers?: readonly TierSpec[]
  attrs?: Record<string, AttrValue>
  /** Days the paid promotion still runs for. Drives `promotedUntil`. */
  promotedFor?: number
  pinned?: boolean
  highlighted?: boolean
  urgent?: boolean
  views: number
  contacts: number
}

const PRODUCTS: ProductSpec[] = [
  // --- Agro Prim: field vegetables -------------------------------------------
  {
    seller: 'agro-prim',
    category: 'potatoes',
    title: 'Картофель продовольственный Ред Скарлет, урожай 2026',
    description:
      'Картофель столовый сорта Ред Скарлет из собственного хозяйства в Оргеевском районе. Калибр 45–60 мм, мытый и откалиброванный, без механических повреждений и позеленения. Хранится в климатической камере при +4 °C, поэтому клубень не прорастает до апреля. Отгружаем сеткой по 25 кг, ящиком или биг-бэгом по тонне.',
    priceBani: 800,
    oldPriceBani: 950,
    discountEndsIn: 3,
    unit: 'KG',
    minOrderQty: 500,
    availableQty: 180_000,
    status: 'ACTIVE',
    publishedAgo: 34,
    expiresIn: 44,
    bumpedAgo: 2,
    originCountry: 'Молдова',
    productionPlace: 'Оргеевский район, с. Иванча',
    packaging: 'Сетка 25 кг / биг-бэг 1 000 кг',
    storageConditions: 'Тёмное сухое помещение, влажность 85–90 %',
    storageTempC: 'от +2 °C до +6 °C',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Доставка по Кишинёву и Оргеевскому району от 500 кг, отгрузка ежедневно с 07:00.',
    deliveryPriceBani: 0,
    pickupAvailable: true,
    deliveryRegions: ['orhei', 'chisinau', 'straseni', 'criuleni', 'telenesti'],
    photos: PHOTO.potatoes,
    tiers: [
      { minQty: 500, maxQty: 2_999, priceBani: 800 },
      { minQty: 3_000, maxQty: 9_999, priceBani: 760 },
      { minQty: 10_000, maxQty: null, priceBani: 710 },
    ],
    attrs: {
      variety: 'Ред Скарлет',
      harvest_year: 2026,
      calibre: 'MEDIUM',
      origin_country: 'Молдова',
      produce_packaging: 'NET',
    },
    promotedFor: 11,
    views: 1_842,
    contacts: 96,
  },
  {
    seller: 'agro-prim',
    category: 'carrots',
    title: 'Морковь столовая Нантская, калибр 30–50 мм',
    description:
      'Морковь Нантская, ровная, без разветвлений и трещин. Мытая, подсушенная, упакована в сетку 10 кг или пластиковый лоток. Подходит и для розничной выкладки, и для переработки: сухого вещества хватает на сок и заморозку.',
    priceBani: 1_000,
    unit: 'KG',
    minOrderQty: 300,
    availableQty: 62_000,
    status: 'ACTIVE',
    publishedAgo: 30,
    expiresIn: 40,
    originCountry: 'Молдова',
    productionPlace: 'Оргеевский район',
    packaging: 'Сетка 10 кг',
    storageConditions: 'Хранение в овощехранилище с вентиляцией',
    storageTempC: 'от 0 °C до +4 °C',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Доставка от 500 кг бесплатно по Кишинёву.',
    pickupAvailable: true,
    deliveryRegions: ['orhei', 'chisinau', 'straseni'],
    photos: PHOTO.carrots,
    tiers: [
      { minQty: 300, maxQty: 1_999, priceBani: 1_000 },
      { minQty: 2_000, maxQty: null, priceBani: 940 },
    ],
    attrs: {
      variety: 'Нантская 4',
      harvest_year: 2026,
      calibre: 'MEDIUM',
      origin_country: 'Молдова',
      produce_packaging: 'NET',
    },
    views: 704,
    contacts: 41,
  },
  {
    seller: 'agro-prim',
    category: 'onions',
    title: 'Лук репчатый жёлтый, сетка 25 кг',
    description:
      'Лук репчатый жёлтый, диаметр 60–80 мм, сухая шелуха, шейка закрыта. Просушен в напольной сушилке, поэтому не запотевает в сетке при перевозке. Отгружаем сеткой 25 кг и биг-бэгом.',
    priceBani: 900,
    unit: 'KG',
    minOrderQty: 500,
    availableQty: 95_000,
    status: 'ACTIVE',
    publishedAgo: 27,
    expiresIn: 47,
    originCountry: 'Молдова',
    productionPlace: 'Оргеевский район',
    packaging: 'Сетка 25 кг',
    storageTempC: 'от 0 °C до +2 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['orhei', 'chisinau', 'telenesti', 'criuleni'],
    photos: PHOTO.onions,
    attrs: {
      variety: 'Штутгартер Ризен',
      harvest_year: 2026,
      calibre: 'LARGE',
      origin_country: 'Молдова',
      produce_packaging: 'NET',
    },
    views: 512,
    contacts: 28,
  },
  {
    seller: 'agro-prim',
    category: 'cabbage',
    title: 'Капуста белокочанная поздняя, биг-бэг 500 кг',
    description:
      'Капуста поздних сортов для длительного хранения и квашения. Кочан плотный, 2,5–4 кг, зачищен до двух кроющих листьев. Отгружается биг-бэгом по 500 кг или навалом в кузов.',
    priceBani: 700,
    oldPriceBani: 820,
    unit: 'KG',
    minOrderQty: 1_000,
    availableQty: 140_000,
    status: 'ACTIVE',
    publishedAgo: 21,
    expiresIn: 50,
    originCountry: 'Молдова',
    packaging: 'Биг-бэг 500 кг / навалом',
    storageTempC: 'от 0 °C до +2 °C',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['orhei', 'chisinau', 'telenesti'],
    photos: PHOTO.cabbage,
    tiers: [
      { minQty: 1_000, maxQty: 4_999, priceBani: 700 },
      { minQty: 5_000, maxQty: null, priceBani: 640 },
    ],
    attrs: {
      variety: 'Мегатон F1',
      harvest_year: 2026,
      calibre: 'LARGE',
      origin_country: 'Молдова',
      produce_packaging: 'BIGBAG',
    },
    views: 388,
    contacts: 19,
  },

  // --- Legume de Orhei: greenhouse -------------------------------------------
  {
    seller: 'legume-de-orhei',
    category: 'tomatoes',
    title: 'Помидоры тепличные розовые, лоток 6 кг',
    description:
      'Розовый тепличный помидор кисти, калибр 100–140 г, срезка утром — отгрузка в тот же день. Плод плотный, транспортабельный, с настоящим вкусом благодаря шмелиному опылению и капельному поливу. Лоток оборотный, 6 кг нетто.',
    priceBani: 2_400,
    unit: 'KG',
    minOrderQty: 60,
    availableQty: 4_200,
    status: 'ACTIVE',
    publishedAgo: 9,
    expiresIn: 30,
    bumpedAgo: 1,
    originCountry: 'Молдова',
    productionPlace: 'Оргеевский район, с. Пересечина',
    packaging: 'Пластиковый лоток 6 кг',
    storageTempC: 'от +8 °C до +12 °C',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Доставка в Кишинёв ежедневно, кроме воскресенья. Тара оборотная.',
    deliveryPriceBani: 25_000,
    pickupAvailable: true,
    deliveryRegions: ['orhei', 'chisinau', 'telenesti', 'rezina'],
    photos: PHOTO.tomatoes,
    tiers: [
      { minQty: 60, maxQty: 299, priceBani: 2_400 },
      { minQty: 300, maxQty: null, priceBani: 2_250 },
    ],
    attrs: {
      variety: 'Пинк Роуз F1',
      harvest_year: 2026,
      calibre: 'LARGE',
      origin_country: 'Молдова',
      produce_packaging: 'CRATE',
    },
    pinned: true,
    highlighted: true,
    views: 2_310,
    contacts: 141,
  },
  {
    seller: 'legume-de-orhei',
    category: 'cucumbers',
    title: 'Castraveți de seră, calibru scurt, navetă 5 kg',
    description:
      'Castraveți scurți de seră, lungime 10–14 cm, recoltați dimineața și livrați în aceeași zi. Coaja subțire, fără amăreală, potriviți atât pentru raft cât și pentru murat. Naveta de 5 kg este returnabilă.',
    priceBani: 2_200,
    unit: 'KG',
    minOrderQty: 50,
    availableQty: 3_600,
    status: 'ACTIVE',
    publishedAgo: 7,
    expiresIn: 30,
    originCountry: 'Moldova',
    productionPlace: 'Raionul Orhei, s. Peresecina',
    packaging: 'Navetă de plastic 5 kg',
    storageTempC: 'de la +8 °C la +12 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['orhei', 'chisinau'],
    photos: PHOTO.cucumbers,
    attrs: {
      variety: 'Mirabelle F1',
      harvest_year: 2026,
      calibre: 'MEDIUM',
      origin_country: 'Moldova',
      produce_packaging: 'CRATE',
    },
    views: 968,
    contacts: 63,
  },
  {
    seller: 'legume-de-orhei',
    category: 'greens',
    title: 'Зелень свежая: укроп, петрушка, кинза — срезка утром',
    description:
      'Пучковая зелень из теплицы: укроп, петрушка кудрявая и кинза. Срезаем в 05:00, охлаждаем и везём в Кишинёв к открытию кухни. Пучок 100 г, ящик 5 кг. Ассортимент и пропорции согласовываются накануне до 16:00.',
    priceBani: 9_500,
    unit: 'KG',
    minOrderQty: 10,
    availableQty: 400,
    status: 'ACTIVE',
    publishedAgo: 5,
    expiresIn: 25,
    originCountry: 'Молдова',
    packaging: 'Ящик 5 кг, пучок 100 г',
    storageTempC: 'от +2 °C до +6 °C',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Ежедневная доставка в Кишинёв к 08:00.',
    pickupAvailable: true,
    deliveryRegions: ['orhei', 'chisinau'],
    photos: PHOTO.greens,
    attrs: {
      harvest_year: 2026,
      origin_country: 'Молдова',
      produce_packaging: 'BOX',
    },
    urgent: true,
    views: 1_120,
    contacts: 88,
  },

  // --- Codru Fresh: orchard ---------------------------------------------------
  {
    seller: 'codru-fresh',
    category: 'apples',
    title: 'Яблоки Голден Делишес, 1 сорт, ящик 13 кг',
    description:
      'Яблоко Голден Делишес первого сорта, калибр 70–80 мм, фотокалибровка по цвету и размеру. Хранение в регулируемой атмосфере, поэтому плод остаётся плотным до мая. Ящик 13 кг с прокладкой, 60 ящиков на паллете.',
    priceBani: 1_500,
    oldPriceBani: 1_750,
    discountEndsIn: 5,
    unit: 'KG',
    minOrderQty: 500,
    availableQty: 320_000,
    status: 'ACTIVE',
    publishedAgo: 40,
    expiresIn: 40,
    bumpedAgo: 3,
    originCountry: 'Молдова',
    productionPlace: 'Страшенский район',
    packaging: 'Ящик 13 кг, паллета 60 ящиков',
    storageConditions: 'Камера с регулируемой атмосферой',
    storageTempC: 'от 0 °C до +2 °C',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Отгрузка паллетами со склада в Страшенах, доставка по Кишинёву на следующий рабочий день.',
    deliveryPriceBani: 30_000,
    pickupAvailable: true,
    deliveryRegions: ['straseni', 'chisinau', 'calarasi', 'ungheni'],
    photos: PHOTO.apples,
    tiers: [
      { minQty: 500, maxQty: 4_999, priceBani: 1_500 },
      { minQty: 5_000, maxQty: 19_999, priceBani: 1_420 },
      { minQty: 20_000, maxQty: null, priceBani: 1_350 },
    ],
    attrs: {
      variety: 'Golden Delicious',
      harvest_year: 2026,
      calibre: 'LARGE',
      origin_country: 'Молдова',
      produce_packaging: 'BOX',
    },
    promotedFor: 9,
    views: 2_654,
    contacts: 173,
  },
  {
    seller: 'codru-fresh',
    category: 'pears',
    title: 'Pere Conference, calibru 60–70 mm, ladă 12 kg',
    description:
      'Pere din soiul Conference, calibrate optic, fără lovituri și fără rugină pe coajă. Păstrate în atmosferă controlată la 0 °C, ceea ce le ține ferme până în martie. Livrare pe paleți, 72 de lăzi pe palet.',
    priceBani: 2_600,
    unit: 'KG',
    minOrderQty: 200,
    availableQty: 18_000,
    status: 'ACTIVE',
    publishedAgo: 24,
    expiresIn: 36,
    originCountry: 'Moldova',
    productionPlace: 'Raionul Strășeni',
    packaging: 'Ladă 12 kg',
    storageTempC: 'de la 0 °C la +2 °C',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['straseni', 'chisinau', 'ungheni'],
    photos: PHOTO.pears,
    attrs: {
      variety: 'Conference',
      harvest_year: 2026,
      calibre: 'MEDIUM',
      origin_country: 'Moldova',
      produce_packaging: 'BOX',
    },
    views: 742,
    contacts: 37,
  },
  {
    seller: 'codru-fresh',
    category: 'plums',
    title: 'Слива Стенлей для свежего рынка и переработки',
    description:
      'Слива Стенлей с восковым налётом, калибр 40 мм и выше. Для свежего рынка отбираем ручной сортировкой, для переработки отгружаем навалом в ящиках по 25 кг. Сахаристость 17–19 %.',
    priceBani: 1_800,
    unit: 'KG',
    minOrderQty: 300,
    availableQty: 44_000,
    status: 'ACTIVE',
    publishedAgo: 19,
    expiresIn: 30,
    originCountry: 'Молдова',
    packaging: 'Ящик 25 кг',
    storageTempC: 'от 0 °C до +2 °C',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['straseni', 'chisinau', 'calarasi'],
    photos: PHOTO.plums,
    attrs: {
      variety: 'Stanley',
      harvest_year: 2026,
      calibre: 'LARGE',
      origin_country: 'Молдова',
      produce_packaging: 'BOX',
    },
    views: 431,
    contacts: 22,
  },
  {
    seller: 'codru-fresh',
    category: 'berries',
    title: 'Клубника садовая Клери, лоток 500 г',
    description:
      'Клубника сорта Клери первого сбора, ягода плотная, одномерная, с сухим отрывом. Собираем в лоток 500 г прямо на плантации, охлаждаем в течение часа. Короб 8 лотков, паллета 240 коробов.',
    priceBani: 7_500,
    unit: 'KG',
    minOrderQty: 20,
    availableQty: 900,
    status: 'PENDING',
    originCountry: 'Молдова',
    packaging: 'Лоток 500 г, короб 8 лотков',
    storageTempC: 'от 0 °C до +4 °C',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['straseni', 'chisinau'],
    photos: PHOTO.berries,
    attrs: {
      variety: 'Clery',
      harvest_year: 2026,
      calibre: 'LARGE',
      origin_country: 'Молдова',
      produce_packaging: 'CRATE',
    },
    views: 12,
    contacts: 0,
  },

  // --- Struguri de Sud --------------------------------------------------------
  {
    seller: 'struguri-de-sud',
    category: 'grapes',
    title: 'Виноград столовый Молдова, ящик 10 кг',
    description:
      'Столовый виноград сорта Молдова: крупная тёмно-синяя ягода, плотная гроздь 500–800 г, хорошо переносит перевозку и хранится до февраля. Ящик 10 кг с подложкой, 60 ящиков на паллете.',
    priceBani: 2_100,
    unit: 'KG',
    minOrderQty: 200,
    availableQty: 96_000,
    status: 'ACTIVE',
    publishedAgo: 16,
    expiresIn: 45,
    originCountry: 'Молдова',
    productionPlace: 'Комрат, УТА Гагаузия',
    packaging: 'Ящик 10 кг',
    storageConditions: 'Холодильник с относительной влажностью 90 %',
    storageTempC: 'от -1 °C до +1 °C',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['comrat', 'ceadir-lunga', 'cimislia', 'chisinau'],
    photos: PHOTO.grapes,
    tiers: [
      { minQty: 200, maxQty: 1_999, priceBani: 2_100 },
      { minQty: 2_000, maxQty: null, priceBani: 1_960 },
    ],
    attrs: {
      variety: 'Молдова',
      harvest_year: 2026,
      calibre: 'EXTRA',
      origin_country: 'Молдова',
      produce_packaging: 'BOX',
    },
    views: 826,
    contacts: 44,
  },

  // --- Lactate Nistru ---------------------------------------------------------
  {
    seller: 'lactate-nistru',
    category: 'milk',
    title: 'Молоко пастеризованное 2,5 %, пакет 1 л',
    description:
      'Пастеризованное коровье молоко жирностью 2,5 % из сырья собственных ферм Криулянского района. Пастеризация 76 °C, срок годности 7 суток. Плёночный пакет 1 л, короб 12 пакетов, паллета 720 л.',
    priceBani: 1_400,
    isRetail: true,
    retailPriceBani: 1_800,
    retailMinQty: 1,
    unit: 'L',
    minOrderQty: 200,
    availableQty: 12_000,
    status: 'ACTIVE',
    publishedAgo: 26,
    expiresIn: 40,
    bumpedAgo: 4,
    originCountry: 'Молдова',
    manufacturer: 'Lactate Nistru SRL',
    productionPlace: 'Криуляны, ул. Индустриалэ, 3',
    batchNumber: 'LN-M25-0417',
    producedAgo: 1,
    bestBeforeIn: 6,
    composition: 'Молоко коровье нормализованное',
    allergens: 'Молоко и продукты его переработки',
    packaging: 'Плёночный пакет 1 л',
    storageTempC: 'от +2 °C до +6 °C',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Ежедневная доставка рефрижератором до 09:00, минимальная партия 200 л.',
    deliveryPriceBani: 0,
    pickupAvailable: false,
    deliveryRegions: ['criuleni', 'chisinau', 'anenii-noi', 'dubasari'],
    photos: PHOTO.milk,
    tiers: [
      { minQty: 200, maxQty: 999, priceBani: 1_400 },
      { minQty: 1_000, maxQty: 2_999, priceBani: 1_330 },
      { minQty: 3_000, maxQty: null, priceBani: 1_260 },
    ],
    attrs: {
      fat_percent: 2.5,
      pasteurization: 'PASTEURIZED',
      shelf_life_days: 7,
      dairy_packaging: 'FILM_PACK',
    },
    views: 1_988,
    contacts: 127,
  },
  {
    seller: 'lactate-nistru',
    category: 'cheese',
    title: 'Сыр полутвёрдый «Молдавский», головка 4 кг',
    description:
      'Полутвёрдый сыр из пастеризованного коровьего молока, созревание 45 суток. Тесто эластичное, с мелким глазком, жирность в сухом веществе 45 %. Головка 4 кг в термоусадочном пакете, короб 3 головки.',
    priceBani: 8_900,
    isRetail: true,
    retailPriceBani: 10_400,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 20,
    availableQty: 1_800,
    status: 'ACTIVE',
    publishedAgo: 22,
    expiresIn: 40,
    originCountry: 'Молдова',
    manufacturer: 'Lactate Nistru SRL',
    batchNumber: 'LN-S45-0208',
    producedAgo: 47,
    bestBeforeIn: 120,
    composition: 'Молоко коровье пастеризованное, закваска, сычужный фермент, соль',
    allergens: 'Молоко и продукты его переработки',
    packaging: 'Термоусадочный пакет, головка 4 кг',
    storageTempC: 'от +2 °C до +6 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: false,
    deliveryRegions: ['criuleni', 'chisinau', 'anenii-noi', 'orhei'],
    photos: PHOTO.cheese,
    tiers: [
      { minQty: 20, maxQty: 99, priceBani: 8_900 },
      { minQty: 100, maxQty: null, priceBani: 8_450 },
    ],
    attrs: {
      fat_percent: 45,
      pasteurization: 'PASTEURIZED',
      shelf_life_days: 120,
      dairy_packaging: 'VACUUM',
    },
    views: 1_405,
    contacts: 98,
  },
  {
    seller: 'lactate-nistru',
    category: 'cottage-cheese',
    title: 'Творог 9 %, ведро 5 кг',
    description:
      'Творог классический жирностью 9 % из пастеризованного молока. Зерно мягкое, без крупитчатости и кислого привкуса — подходит для сырников, запеканок и начинки для плацинд. Ведро 5 кг с герметичной крышкой.',
    priceBani: 6_500,
    unit: 'KG',
    minOrderQty: 25,
    availableQty: 900,
    status: 'ACTIVE',
    publishedAgo: 18,
    expiresIn: 35,
    originCountry: 'Молдова',
    manufacturer: 'Lactate Nistru SRL',
    producedAgo: 2,
    bestBeforeIn: 10,
    allergens: 'Молоко и продукты его переработки',
    packaging: 'Ведро 5 кг',
    storageTempC: 'от +2 °C до +6 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: false,
    deliveryRegions: ['criuleni', 'chisinau', 'anenii-noi'],
    photos: PHOTO.cottage,
    attrs: {
      fat_percent: 9,
      pasteurization: 'PASTEURIZED',
      shelf_life_days: 12,
      dairy_packaging: 'BUCKET',
    },
    views: 617,
    contacts: 45,
  },
  {
    seller: 'lactate-nistru',
    category: 'sour-cream',
    title: 'Сметана 20 %, ведро 5 кг',
    description:
      'Сметана термостатная жирностью 20 %, без растительных жиров и загустителей. Держит форму, не расслаивается при нагреве в соусе. Ведро 5 кг, короб 2 ведра.',
    priceBani: 5_200,
    unit: 'KG',
    minOrderQty: 25,
    availableQty: 1_100,
    status: 'ACTIVE',
    publishedAgo: 18,
    expiresIn: 35,
    originCountry: 'Молдова',
    manufacturer: 'Lactate Nistru SRL',
    producedAgo: 2,
    bestBeforeIn: 12,
    allergens: 'Молоко и продукты его переработки',
    packaging: 'Ведро 5 кг',
    storageTempC: 'от +2 °C до +6 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: false,
    deliveryRegions: ['criuleni', 'chisinau', 'anenii-noi'],
    photos: PHOTO.sourCream,
    attrs: {
      fat_percent: 20,
      pasteurization: 'PASTEURIZED',
      shelf_life_days: 14,
      dairy_packaging: 'BUCKET',
    },
    views: 559,
    contacts: 33,
  },
  {
    seller: 'lactate-nistru',
    category: 'butter',
    title: 'Масло сливочное 82,5 %, брикет 200 г',
    description:
      'Сладкосливочное масло традиционное, массовая доля жира 82,5 %, изготовлено методом сбивания. Без заменителей молочного жира — на срезе плотное, при жарке не пенится. Брикет 200 г в кашированной фольге, короб 30 брикетов.',
    priceBani: 17_500,
    oldPriceBani: 19_800,
    discountEndsIn: 2,
    unit: 'KG',
    minOrderQty: 20,
    availableQty: 640,
    status: 'ACTIVE',
    publishedAgo: 15,
    expiresIn: 45,
    originCountry: 'Молдова',
    manufacturer: 'Lactate Nistru SRL',
    producedAgo: 6,
    bestBeforeIn: 100,
    composition: 'Сливки пастеризованные',
    allergens: 'Молоко и продукты его переработки',
    packaging: 'Брикет 200 г, короб 30 шт.',
    storageTempC: 'от -3 °C до +6 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: false,
    deliveryRegions: ['criuleni', 'chisinau', 'orhei'],
    photos: PHOTO.butter,
    attrs: {
      fat_percent: 82.5,
      pasteurization: 'PASTEURIZED',
      shelf_life_days: 120,
      dairy_packaging: 'FILM_PACK',
    },
    views: 903,
    contacts: 61,
  },
  {
    seller: 'lactate-nistru',
    category: 'yogurt',
    title: 'Йогурт натуральный без сахара, ведро 5 кг',
    description:
      'Натуральный йогурт без сахара и стабилизаторов, закваска болгарской палочки и термофильного стрептококка. Для завтраков, соусов и выпечки. Позиция временно снята с продажи: линия на плановой санитарной обработке.',
    priceBani: 3_400,
    unit: 'KG',
    minOrderQty: 30,
    availableQty: 0,
    status: 'PAUSED',
    availability: 'OUT_OF_STOCK',
    publishedAgo: 60,
    expiresIn: 20,
    originCountry: 'Молдова',
    manufacturer: 'Lactate Nistru SRL',
    allergens: 'Молоко и продукты его переработки',
    packaging: 'Ведро 5 кг',
    storageTempC: 'от +2 °C до +6 °C',
    pickupAvailable: false,
    photos: PHOTO.milk.slice(1),
    attrs: {
      fat_percent: 3.2,
      pasteurization: 'PASTEURIZED',
      shelf_life_days: 21,
      dairy_packaging: 'BUCKET',
    },
    views: 274,
    contacts: 11,
  },

  // --- Carne Bălți ------------------------------------------------------------
  {
    seller: 'carne-balti',
    category: 'beef-chilled',
    title: 'Говядина охлаждённая, задняя часть без кости',
    description:
      'Охлаждённая говядина, задняя часть без кости, категория А. Отгружаем в течение 24 часов после убоя, созревание в камере при +2 °C. Вакуумный пакет 8–12 кг, ветеринарный сертификат ANSA на каждую партию.',
    priceBani: 9_500,
    unit: 'KG',
    minOrderQty: 50,
    availableQty: 1_200,
    status: 'ACTIVE',
    publishedAgo: 12,
    expiresIn: 30,
    bumpedAgo: 1,
    originCountry: 'Молдова',
    manufacturer: 'Carne Bălți SA',
    productionPlace: 'Бельцы, ул. Индустриалэ, 22',
    batchNumber: 'CB-B-2611',
    producedAgo: 1,
    bestBeforeIn: 13,
    storageConditions: 'Подвесное хранение в холодильной камере',
    storageTempC: 'от 0 °C до +4 °C',
    packaging: 'Вакуумный пакет 8–12 кг',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Рефрижератор по северу ежедневно, в Кишинёв — вторник и пятница.',
    deliveryPriceBani: 90_000,
    pickupAvailable: true,
    deliveryRegions: ['balti', 'singerei', 'falesti', 'chisinau'],
    photos: PHOTO.beef,
    tiers: [
      { minQty: 50, maxQty: 199, priceBani: 9_500 },
      { minQty: 200, maxQty: 499, priceBani: 9_150 },
      { minQty: 500, maxQty: null, priceBani: 8_800 },
    ],
    attrs: {
      meat_kind: 'BEEF',
      meat_cut: 'LEG',
      thermal_state: 'CHILLED',
      piece_weight: 10,
      shelf_life_days: 14,
      storage_temp: 'от 0 °C до +4 °C',
      vet_certificate: true,
    },
    promotedFor: 6,
    views: 2_042,
    contacts: 158,
  },
  {
    seller: 'carne-balti',
    category: 'beef-frozen',
    title: 'Говядина замороженная, блок 20 кг',
    description:
      'Замороженная говядина без кости, шоковая заморозка до -18 °C в течение 12 часов после обвалки. Блок 20 кг в полиэтиленовом вкладыше и гофрокоробе. Подходит для мясокомбинатов и производства полуфабрикатов.',
    priceBani: 8_200,
    oldPriceBani: 9_400,
    unit: 'KG',
    minOrderQty: 200,
    availableQty: 6_000,
    status: 'ACTIVE',
    publishedAgo: 33,
    expiresIn: 50,
    originCountry: 'Молдова',
    manufacturer: 'Carne Bălți SA',
    batchNumber: 'CB-BF-1908',
    producedAgo: 26,
    bestBeforeIn: 300,
    storageTempC: 'не выше -18 °C',
    packaging: 'Блок 20 кг в гофрокоробе',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['balti', 'chisinau', 'drochia', 'riscani'],
    photos: PHOTO.beefFrozen,
    attrs: {
      meat_kind: 'BEEF',
      meat_cut: 'SHOULDER',
      thermal_state: 'FROZEN',
      piece_weight: 20,
      shelf_life_days: 365,
      storage_temp: 'не выше -18 °C',
      vet_certificate: true,
    },
    views: 811,
    contacts: 52,
  },
  {
    seller: 'carne-balti',
    category: 'pork',
    title: 'Свинина охлаждённая, лопатка без кости',
    description:
      'Лопаточная часть свиньи без кости и шкуры, обвалка вручную, жировая прослойка до 10 мм. Идёт на фарш, гуляш и полуфабрикаты. Вакуум 5–7 кг, срок годности 12 суток.',
    priceBani: 7_800,
    unit: 'KG',
    minOrderQty: 50,
    availableQty: 2_400,
    status: 'ACTIVE',
    publishedAgo: 11,
    expiresIn: 30,
    originCountry: 'Молдова',
    manufacturer: 'Carne Bălți SA',
    batchNumber: 'CB-P-2703',
    producedAgo: 1,
    bestBeforeIn: 11,
    storageTempC: 'от 0 °C до +4 °C',
    packaging: 'Вакуумный пакет 5–7 кг',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['balti', 'singerei', 'chisinau', 'hincesti'],
    photos: PHOTO.pork,
    tiers: [
      { minQty: 50, maxQty: 299, priceBani: 7_800 },
      { minQty: 300, maxQty: null, priceBani: 7_450 },
    ],
    attrs: {
      meat_kind: 'PORK',
      meat_cut: 'SHOULDER',
      thermal_state: 'CHILLED',
      piece_weight: 6,
      shelf_life_days: 12,
      storage_temp: 'от 0 °C до +4 °C',
      vet_certificate: true,
    },
    views: 1_566,
    contacts: 112,
  },
  {
    seller: 'carne-balti',
    category: 'veal',
    title: 'Телятина охлаждённая, вырезка',
    description:
      'Вырезка телёнка молочного откорма, зачищенная от плёнок и жира. Мясо светлое, мелковолокнистое — ресторанная позиция для стейков и медальонов. Вакуум по 1,5–2 кг, партии ограничены забоем.',
    priceBani: 12_500,
    unit: 'KG',
    minOrderQty: 20,
    availableQty: 260,
    status: 'ACTIVE',
    publishedAgo: 8,
    expiresIn: 25,
    originCountry: 'Молдова',
    manufacturer: 'Carne Bălți SA',
    producedAgo: 1,
    bestBeforeIn: 9,
    storageTempC: 'от 0 °C до +2 °C',
    packaging: 'Вакуумный пакет 1,5–2 кг',
    supplyRegularity: 'WEEKLY',
    pickupAvailable: true,
    deliveryRegions: ['balti', 'chisinau'],
    photos: PHOTO.veal,
    attrs: {
      meat_kind: 'VEAL',
      meat_cut: 'TENDERLOIN',
      thermal_state: 'CHILLED',
      piece_weight: 1.8,
      shelf_life_days: 10,
      storage_temp: 'от 0 °C до +2 °C',
      vet_certificate: true,
    },
    views: 694,
    contacts: 71,
  },
  {
    seller: 'carne-balti',
    category: 'lamb',
    title: 'Баранина охлаждённая, полутуша',
    description:
      'Полутуша молодой баранины 12–16 кг, порода цигай. Сезонная позиция под пасхальные заказы: партия текущей недели полностью выкуплена, следующий забой — по предварительной записи.',
    priceBani: 11_000,
    unit: 'KG',
    minOrderQty: 30,
    availableQty: 0,
    status: 'SOLD_OUT',
    availability: 'OUT_OF_STOCK',
    publishedAgo: 46,
    expiresIn: 15,
    originCountry: 'Молдова',
    manufacturer: 'Carne Bălți SA',
    storageTempC: 'от 0 °C до +4 °C',
    packaging: 'Полутуша в стрейч-плёнке',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['balti', 'chisinau'],
    photos: PHOTO.beef.slice(1),
    attrs: {
      meat_kind: 'LAMB',
      meat_cut: 'CARCASS',
      thermal_state: 'CHILLED',
      piece_weight: 14,
      shelf_life_days: 10,
      storage_temp: 'от 0 °C до +4 °C',
      vet_certificate: true,
    },
    views: 1_197,
    contacts: 84,
  },

  // --- Avicola Sîngerei -------------------------------------------------------
  {
    seller: 'avicola-singerei',
    category: 'chicken-chilled',
    title: 'Курица охлаждённая, тушка 1,4–1,6 кг',
    description:
      'Тушка бройлера первой категории, потрошёная, охлаждённая воздушным способом — без набора влаги при взвешивании. Упаковка индивидуальная в пакет, короб 10 тушек. Отгрузка в день убоя, ветеринарный сертификат прилагается.',
    priceBani: 5_500,
    unit: 'KG',
    minOrderQty: 100,
    availableQty: 9_000,
    status: 'ACTIVE',
    publishedAgo: 14,
    expiresIn: 35,
    bumpedAgo: 1,
    originCountry: 'Молдова',
    manufacturer: 'Avicola Sîngerei SA',
    productionPlace: 'Сынджерей, ул. Индепенденцей, 62',
    batchNumber: 'AS-C-3104',
    producedAgo: 1,
    bestBeforeIn: 6,
    storageTempC: 'от 0 °C до +4 °C',
    packaging: 'Индивидуальный пакет, короб 10 тушек',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Доставка по стране от 500 кг, график согласуется на неделю вперёд.',
    deliveryPriceBani: 0,
    pickupAvailable: true,
    deliveryRegions: ['singerei', 'balti', 'floresti', 'chisinau', 'orhei'],
    photos: PHOTO.chickenRaw,
    tiers: [
      { minQty: 100, maxQty: 499, priceBani: 5_500 },
      { minQty: 500, maxQty: 1_999, priceBani: 5_250 },
      { minQty: 2_000, maxQty: null, priceBani: 4_980 },
    ],
    attrs: {
      meat_cut: 'CARCASS',
      thermal_state: 'CHILLED',
      piece_weight: 1.5,
      shelf_life_days: 7,
      storage_temp: 'от 0 °C до +4 °C',
      vet_certificate: true,
    },
    pinned: true,
    views: 3_104,
    contacts: 214,
  },
  {
    seller: 'avicola-singerei',
    category: 'chicken-frozen',
    title: 'Куриное филе замороженное, короб 15 кг',
    description:
      'Филе грудки бройлера без кожи и кости, шоковая заморозка поштучно (IQF) — куски не смерзаются в блок. Короб 15 кг, срок хранения 12 месяцев при -18 °C. Для столовых, кейтеринга и производства полуфабрикатов.',
    priceBani: 4_900,
    oldPriceBani: 5_600,
    discountEndsIn: 6,
    unit: 'KG',
    minOrderQty: 150,
    availableQty: 14_000,
    status: 'ACTIVE',
    publishedAgo: 29,
    expiresIn: 45,
    originCountry: 'Молдова',
    manufacturer: 'Avicola Sîngerei SA',
    batchNumber: 'AS-F-2209',
    producedAgo: 40,
    bestBeforeIn: 320,
    storageTempC: 'не выше -18 °C',
    packaging: 'Короб 15 кг',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['singerei', 'balti', 'chisinau', 'orhei'],
    photos: PHOTO.chickenFillet,
    attrs: {
      meat_cut: 'BRISKET',
      thermal_state: 'FROZEN',
      piece_weight: 0.25,
      shelf_life_days: 365,
      storage_temp: 'не выше -18 °C',
      vet_certificate: true,
    },
    views: 1_338,
    contacts: 97,
  },
  {
    seller: 'avicola-singerei',
    category: 'turkey',
    title: 'Индейка охлаждённая, филе грудки',
    description:
      'Филе грудки индейки без кожи, вес куска 1,2–2 кг. Птица выращена без стимуляторов роста, откорм 16 недель. Вакуумная упаковка, срок годности 10 суток.',
    priceBani: 9_800,
    unit: 'KG',
    minOrderQty: 50,
    availableQty: 1_600,
    status: 'ACTIVE',
    publishedAgo: 20,
    expiresIn: 35,
    originCountry: 'Молдова',
    manufacturer: 'Avicola Sîngerei SA',
    producedAgo: 2,
    bestBeforeIn: 8,
    storageTempC: 'от 0 °C до +4 °C',
    packaging: 'Вакуумный пакет 1,2–2 кг',
    supplyRegularity: 'WEEKLY',
    pickupAvailable: true,
    deliveryRegions: ['singerei', 'balti', 'chisinau'],
    photos: PHOTO.turkey,
    attrs: {
      meat_cut: 'BRISKET',
      thermal_state: 'CHILLED',
      piece_weight: 1.6,
      shelf_life_days: 10,
      storage_temp: 'от 0 °C до +4 °C',
      vet_certificate: true,
    },
    views: 588,
    contacts: 39,
  },
  {
    seller: 'avicola-singerei',
    category: 'chicken-eggs',
    title: 'Яйцо куриное С0, лоток 30 штук',
    description:
      'Яйцо куриное столовое отборное (С0), масса 65–74 г. Маркировка на скорлупе, лоток 30 штук, короб 360 штук. Отгрузка ежедневно, срок реализации 25 суток с даты сортировки.',
    priceBani: 250,
    unit: 'PCS',
    minOrderQty: 3_000,
    availableQty: 480_000,
    status: 'ACTIVE',
    publishedAgo: 23,
    expiresIn: 45,
    originCountry: 'Молдова',
    manufacturer: 'Avicola Sîngerei SA',
    batchNumber: 'AS-E-0512',
    producedAgo: 3,
    bestBeforeIn: 22,
    allergens: 'Яйца и продукты их переработки',
    packaging: 'Лоток 30 шт., короб 360 шт.',
    storageTempC: 'от 0 °C до +20 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['singerei', 'balti', 'floresti', 'chisinau', 'orhei', 'telenesti'],
    photos: PHOTO.eggs,
    tiers: [
      { minQty: 3_000, maxQty: 9_999, priceBani: 250 },
      { minQty: 10_000, maxQty: null, priceBani: 232 },
    ],
    views: 2_471,
    contacts: 186,
  },

  // --- Pescuit Prut -----------------------------------------------------------
  {
    seller: 'pescuit-prut',
    category: 'fish-fresh',
    title: 'Карп живой из прудов Кагульского района',
    description:
      'Живой зеркальный карп навеской 1,5–3 кг из собственных прудов. Перевозим в живорыбной ёмкости с аэрацией, отход при доставке до 2 %. Позиция для рынков, ресторанов и предпраздничной торговли.',
    priceBani: 5_800,
    unit: 'KG',
    minOrderQty: 100,
    availableQty: 12_000,
    status: 'ACTIVE',
    publishedAgo: 17,
    expiresIn: 30,
    originCountry: 'Молдова',
    productionPlace: 'Кагульский район',
    packaging: 'Живорыбная ёмкость с аэрацией',
    storageConditions: 'Живая рыба, садок или аэрируемая ёмкость',
    supplyRegularity: 'SEASONAL',
    deliveryTerms: 'Доставка по югу дважды в неделю, в Кишинёв — по средам.',
    deliveryPriceBani: 60_000,
    pickupAvailable: true,
    deliveryRegions: ['cahul', 'cantemir', 'taraclia', 'chisinau'],
    photos: PHOTO.fishFresh,
    attrs: {
      fish_kind: 'CARP',
      thermal_state: 'LIVE',
      catch_method: 'POND',
      origin_country: 'Молдова',
    },
    views: 1_027,
    contacts: 79,
  },
  {
    seller: 'pescuit-prut',
    category: 'fish-frozen',
    title: 'Форель радужная потрошёная, заморозка',
    description:
      'Форель радужная потрошёная с головой, навеска 250–300 г. Заморозка сухая, глазурь не более 5 %. Короб 10 кг, поставки из Турции и Италии, документы происхождения и ветеринарные сертификаты в комплекте.',
    priceBani: 16_500,
    unit: 'KG',
    minOrderQty: 30,
    availableQty: 2_200,
    status: 'ACTIVE',
    publishedAgo: 10,
    expiresIn: 40,
    bumpedAgo: 2,
    originCountry: 'Турция',
    packaging: 'Короб 10 кг',
    storageTempC: 'не выше -18 °C',
    supplyRegularity: 'MONTHLY',
    pickupAvailable: true,
    deliveryRegions: ['cahul', 'chisinau', 'comrat', 'leova'],
    photos: PHOTO.trout,
    tiers: [
      { minQty: 30, maxQty: 199, priceBani: 16_500 },
      { minQty: 200, maxQty: null, priceBani: 15_800 },
    ],
    attrs: {
      fish_kind: 'TROUT',
      thermal_state: 'FROZEN',
      catch_method: 'FARMED',
      origin_country: 'Турция',
    },
    promotedFor: 8,
    views: 1_611,
    contacts: 104,
  },
  {
    seller: 'pescuit-prut',
    category: 'seafood',
    title: 'Креветка ваннамей 26/30, короб 10 кг',
    description:
      'Креветка ваннамей сыромороженая, калибр 26/30 штук на фунт, без головы, в панцире. Глазурь 10 %, короб 10 кг из 4 блоков по 2,5 кг. Позиция под ресторанные заказы и предновогодние объёмы.',
    priceBani: 24_500,
    unit: 'KG',
    minOrderQty: 20,
    availableQty: 700,
    status: 'PENDING',
    originCountry: 'Эквадор',
    packaging: 'Короб 10 кг (4 блока по 2,5 кг)',
    storageTempC: 'не выше -18 °C',
    supplyRegularity: 'MONTHLY',
    pickupAvailable: true,
    photos: PHOTO.seafood,
    attrs: {
      fish_kind: 'SHRIMP',
      thermal_state: 'FROZEN',
      catch_method: 'FARMED',
      origin_country: 'Эквадор',
    },
    views: 34,
    contacts: 1,
  },

  // --- Moara de Sus -----------------------------------------------------------
  {
    seller: 'moara-de-sus',
    category: 'wheat-flour',
    title: 'Мука пшеничная высшего сорта, мешок 50 кг',
    description:
      'Мука пшеничная хлебопекарная высшего сорта: клейковина 26–28 %, белизна 54 условные единицы, зольность 0,55 %. Помол текущей недели, силосное хранение зерна. Мешок 50 кг, паллета 20 мешков.',
    priceBani: 900,
    oldPriceBani: 1_020,
    discountEndsIn: 9,
    unit: 'KG',
    minOrderQty: 1_000,
    availableQty: 420_000,
    status: 'ACTIVE',
    publishedAgo: 31,
    expiresIn: 45,
    originCountry: 'Молдова',
    manufacturer: 'Moara de Sus SRL',
    productionPlace: 'Единецкий район',
    batchNumber: 'MS-VS-1104',
    producedAgo: 5,
    bestBeforeIn: 175,
    allergens: 'Злаки, содержащие глютен',
    packaging: 'Мешок 50 кг, паллета 1 000 кг',
    storageConditions: 'Сухой склад, влажность не выше 70 %',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Отгрузка мешками и биг-бэгами, самовывоз круглосуточно.',
    pickupAvailable: true,
    deliveryRegions: ['edinet', 'briceni', 'ocnita', 'riscani', 'balti'],
    photos: PHOTO.flour,
    tiers: [
      { minQty: 1_000, maxQty: 9_999, priceBani: 900 },
      { minQty: 10_000, maxQty: 24_999, priceBani: 860 },
      { minQty: 25_000, maxQty: null, priceBani: 820 },
    ],
    views: 1_744,
    contacts: 121,
  },
  {
    seller: 'moara-de-sus',
    category: 'corn-flour',
    title: 'Мука кукурузная (мэлай), мешок 25 кг',
    description:
      'Кукурузная мука среднего помола для мамалыги и выпечки. Из молдавской кукурузы урожая 2026 года, без отбеливателей и улучшителей. Мешок 25 кг, паллета 40 мешков.',
    priceBani: 1_150,
    unit: 'KG',
    minOrderQty: 500,
    availableQty: 68_000,
    status: 'ACTIVE',
    publishedAgo: 28,
    expiresIn: 45,
    originCountry: 'Молдова',
    manufacturer: 'Moara de Sus SRL',
    producedAgo: 9,
    bestBeforeIn: 160,
    packaging: 'Мешок 25 кг',
    storageConditions: 'Сухой склад с вентиляцией',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['edinet', 'briceni', 'balti', 'chisinau'],
    photos: PHOTO.flour,
    views: 652,
    contacts: 38,
  },
  {
    seller: 'moara-de-sus',
    category: 'wheat-grain',
    title: 'Grâu alimentar clasa a 3-a, livrare la vrac',
    description:
      'Grâu alimentar de clasa a 3-a, gluten 23 %, umiditate 13 %, impurități sub 2 %. Depozitat în silozuri cu ventilație activă și control permanent al temperaturii. Livrare la vrac, direct din siloz, cu bon de cântar.',
    priceBani: 620_000,
    unit: 'T',
    minOrderQty: 20,
    availableQty: 3_400,
    status: 'ACTIVE',
    publishedAgo: 37,
    expiresIn: 55,
    originCountry: 'Moldova',
    productionPlace: 'Raionul Edineț',
    packaging: 'Vrac / big-bag 1 t',
    storageConditions: 'Siloz cu ventilație activă',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['edinet', 'briceni', 'ocnita', 'donduseni', 'balti'],
    photos: PHOTO.grain,
    views: 497,
    contacts: 26,
  },

  // --- Brutăria Veche ---------------------------------------------------------
  {
    seller: 'brutaria-veche',
    category: 'bread',
    title: 'Хлеб на закваске 700 г, ежедневная выпечка',
    description:
      'Пшенично-ржаной хлеб на пшеничной закваске, без дрожжей и улучшителей. Расстойка 18 часов, выпечка на поду — корка плотная, мякиш влажный, черствеет медленно. Заказ принимается до 16:00, доставка на следующее утро до 07:00.',
    priceBani: 1_200,
    unit: 'PCS',
    minOrderQty: 40,
    availableQty: 900,
    status: 'ACTIVE',
    publishedAgo: 13,
    expiresIn: 30,
    originCountry: 'Молдова',
    manufacturer: 'Brutăria Veche SRL',
    productionPlace: 'Кишинёв, ул. Мунчешть, 121',
    producedAgo: 0,
    bestBeforeIn: 3,
    composition: 'Мука пшеничная, мука ржаная, вода, закваска, соль',
    allergens: 'Злаки, содержащие глютен',
    packaging: 'Бумажный пакет, лоток 12 шт.',
    storageConditions: 'При комнатной температуре в бумажном пакете',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Ежедневная доставка по Кишинёву до 07:00.',
    deliveryPriceBani: 0,
    pickupAvailable: true,
    deliveryRegions: ['chisinau', 'ialoveni', 'straseni'],
    photos: PHOTO.bread,
    views: 1_289,
    contacts: 143,
  },
  {
    seller: 'brutaria-veche',
    category: 'pastry',
    title: 'Croissant congelat 80 g, cutie 60 bucăți',
    description:
      'Croissant din foietaj cu unt, 80 g, congelat crud după dospire. Se coace direct din congelator în 16 minute la 180 °C — nu necesită dospire suplimentară. Cutie de 60 de bucăți, palet de 40 de cutii.',
    priceBani: 950,
    unit: 'PCS',
    minOrderQty: 120,
    availableQty: 5_400,
    status: 'ACTIVE',
    publishedAgo: 25,
    expiresIn: 40,
    originCountry: 'Moldova',
    manufacturer: 'Brutăria Veche SRL',
    producedAgo: 12,
    bestBeforeIn: 150,
    composition: 'Făină de grâu, unt 82,5 %, apă, drojdie, zahăr, sare',
    allergens: 'Cereale cu gluten, lapte, ouă',
    packaging: 'Cutie 60 bucăți',
    storageTempC: 'nu mai mult de -18 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['chisinau', 'ialoveni'],
    photos: PHOTO.pastry,
    views: 806,
    contacts: 67,
  },

  // --- Miere de Codru ---------------------------------------------------------
  {
    seller: 'miere-de-codru',
    category: 'honey-acacia',
    title: 'Miere de salcâm naturală, bidon de 40 kg',
    description:
      'Miere monofloră de salcâm, recoltată în Codri la începutul lunii mai. Umiditate sub 18 %, indice diastazic peste 12, fără adaos de sirop. Rămâne lichidă peste un an. Bidon de 40 kg sau găleată de 25 kg.',
    priceBani: 14_500,
    unit: 'KG',
    minOrderQty: 40,
    availableQty: 3_200,
    status: 'ACTIVE',
    publishedAgo: 42,
    expiresIn: 50,
    originCountry: 'Moldova',
    productionPlace: 'Raionul Călărași',
    producedAgo: 90,
    bestBeforeIn: 640,
    composition: 'Miere naturală de salcâm 100 %',
    packaging: 'Bidon 40 kg / găleată 25 kg',
    storageConditions: 'Loc întunecos și uscat, fără mirosuri străine',
    storageTempC: 'de la +5 °C la +20 °C',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['calarasi', 'chisinau', 'straseni', 'ungheni'],
    photos: PHOTO.honey,
    tiers: [
      { minQty: 40, maxQty: 199, priceBani: 14_500 },
      { minQty: 200, maxQty: null, priceBani: 13_700 },
    ],
    views: 934,
    contacts: 58,
  },
  {
    seller: 'miere-de-codru',
    category: 'honey-polyfloral',
    title: 'Мёд разнотравье, ведро 25 кг',
    description:
      'Полифлорный мёд летней качки: липа, подсолнечник, донник и полевое разнотравье. Кристаллизуется мелким кристаллом, вкус насыщенный. Каждая партия проходит анализ на влажность и диастазное число.',
    priceBani: 9_800,
    unit: 'KG',
    minOrderQty: 25,
    availableQty: 5_400,
    status: 'ACTIVE',
    publishedAgo: 39,
    expiresIn: 50,
    originCountry: 'Молдова',
    packaging: 'Ведро 25 кг',
    storageTempC: 'от +5 °C до +20 °C',
    supplyRegularity: 'SEASONAL',
    pickupAvailable: true,
    deliveryRegions: ['calarasi', 'chisinau', 'nisporeni'],
    photos: PHOTO.honeyJar,
    views: 611,
    contacts: 34,
  },

  // --- Oleo Sud ---------------------------------------------------------------
  {
    seller: 'oleo-sud',
    category: 'sunflower-oil',
    title: 'Ulei de floarea-soarelui rafinat, bidon 5 l',
    description:
      'Ulei de floarea-soarelui rafinat și dezodorizat, punct de fum 220 °C, potrivit pentru friteuză. Aciditate sub 0,1 %, fără miros. Bidon de 5 l, bax de 4 bidoane, palet de 128 de baxuri.',
    priceBani: 3_450,
    unit: 'L',
    minOrderQty: 500,
    availableQty: 86_000,
    status: 'ACTIVE',
    publishedAgo: 35,
    expiresIn: 45,
    originCountry: 'Moldova',
    manufacturer: 'Oleo Sud SRL',
    productionPlace: 'Cimișlia, str. Ștefan cel Mare, 190',
    batchNumber: 'OS-R-0903',
    producedAgo: 21,
    bestBeforeIn: 340,
    composition: 'Ulei de floarea-soarelui rafinat dezodorizat',
    packaging: 'Bidon 5 l, bax 4 bidoane',
    storageConditions: 'Loc uscat, ferit de lumina directă',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['cimislia', 'hincesti', 'leova', 'chisinau'],
    photos: PHOTO.oil,
    tiers: [
      { minQty: 500, maxQty: 4_999, priceBani: 3_450 },
      { minQty: 5_000, maxQty: null, priceBani: 3_290 },
    ],
    views: 1_452,
    contacts: 102,
  },

  // --- Frigo Market -----------------------------------------------------------
  {
    seller: 'frigo-market',
    category: 'frozen-vegetables',
    title: 'Смесь овощная замороженная, пакет 2,5 кг',
    description:
      'Мексиканская овощная смесь шоковой заморозки: кукуруза, зелёный горошек, морковь, стручковая фасоль и красный перец. Без предварительной варки, овощи не слипаются. Пакет 2,5 кг, короб 4 пакета.',
    priceBani: 3_900,
    oldPriceBani: 4_500,
    discountEndsIn: 1,
    unit: 'KG',
    minOrderQty: 100,
    availableQty: 22_000,
    status: 'ACTIVE',
    publishedAgo: 32,
    expiresIn: 40,
    originCountry: 'Польша',
    packaging: 'Пакет 2,5 кг, короб 10 кг',
    storageTempC: 'не выше -18 °C',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Доставка рефрижератором по Кишинёву в день заказа при оформлении до 12:00.',
    pickupAvailable: true,
    deliveryRegions: ['chisinau', 'ialoveni', 'anenii-noi', 'straseni'],
    photos: PHOTO.frozenVeg,
    views: 1_073,
    contacts: 74,
  },
  {
    seller: 'frigo-market',
    category: 'frozen-berries',
    title: 'Вишня замороженная без косточки, короб 10 кг',
    description:
      'Вишня без косточки шоковой заморозки, калибр 18–22 мм, молдавское сырьё урожая 2026 года. Влага при разморозке минимальная — подходит для начинки вареников и выпечки. Короб 10 кг.',
    priceBani: 6_800,
    unit: 'KG',
    minOrderQty: 50,
    availableQty: 8_600,
    status: 'ACTIVE',
    publishedAgo: 26,
    expiresIn: 40,
    originCountry: 'Молдова',
    packaging: 'Короб 10 кг',
    storageTempC: 'не выше -18 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['chisinau', 'ialoveni', 'orhei', 'criuleni'],
    photos: PHOTO.berries.slice(1),
    views: 728,
    contacts: 49,
  },

  // --- Gustul Casei -----------------------------------------------------------
  {
    seller: 'gustul-casei',
    category: 'semi-finished',
    title: 'Пельмени домашние с говядиной, короб 5 кг',
    description:
      'Пельмени ручной лепки: тесто на яйце, начинка из охлаждённой говядины и свинины 80/20 с луком, без сои и панировочных сухарей. Шоковая заморозка сразу после лепки. Короб 5 кг, около 250 штук.',
    priceBani: 7_900,
    unit: 'KG',
    minOrderQty: 25,
    availableQty: 1_600,
    status: 'ACTIVE',
    publishedAgo: 21,
    expiresIn: 35,
    originCountry: 'Молдова',
    manufacturer: 'Gustul Casei SRL',
    productionPlace: 'Хынчешты, ул. Михалча Хынку, 33',
    producedAgo: 4,
    bestBeforeIn: 170,
    composition: 'Мука пшеничная, говядина, свинина, лук, яйцо, соль, перец',
    allergens: 'Злаки, содержащие глютен; яйца',
    packaging: 'Короб 5 кг',
    storageTempC: 'не выше -18 °C',
    supplyRegularity: 'BIWEEKLY',
    pickupAvailable: true,
    deliveryRegions: ['hincesti', 'chisinau', 'ialoveni'],
    photos: PHOTO.dumplings,
    views: 843,
    contacts: 66,
  },

  // --- Conserve Nistrene ------------------------------------------------------
  {
    seller: 'conserve-nistrene',
    category: 'canned-vegetables',
    title: 'Икра кабачковая, банка 0,72 л',
    description:
      'Кабачковая икра по классической рецептуре: кабачок, морковь, лук, томатная паста, подсолнечное масло. Без крахмала и консервантов, стерилизация в автоклаве. Банка 0,72 л, короб 8 банок, паллета 720 банок.',
    priceBani: 3_300,
    unit: 'PCS',
    minOrderQty: 240,
    availableQty: 26_000,
    status: 'ACTIVE',
    publishedAgo: 29,
    expiresIn: 45,
    originCountry: 'Молдова',
    manufacturer: 'Conserve Nistrene SRL',
    batchNumber: 'CN-IK-2210',
    producedAgo: 60,
    bestBeforeIn: 670,
    composition: 'Кабачки, морковь, лук, паста томатная, масло подсолнечное, соль',
    packaging: 'Банка 0,72 л, короб 8 шт.',
    storageConditions: 'Сухое помещение без прямого солнечного света',
    storageTempC: 'от 0 °C до +20 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['anenii-noi', 'chisinau', 'causeni', 'criuleni'],
    photos: PHOTO.canned,
    views: 596,
    contacts: 31,
  },
  {
    seller: 'conserve-nistrene',
    category: 'pickles',
    title: 'Огурцы маринованные, банка 1,5 л',
    description:
      'Огурцы маринованные корнишонного типа, калибр 6–9 см, заливка с укропом, чесноком и семенами горчицы. Сырьё — молдавские хозяйства, сбор и переработка в один день. Банка 1,5 л, короб 6 банок.',
    priceBani: 3_800,
    unit: 'PCS',
    minOrderQty: 180,
    availableQty: 18_000,
    status: 'PENDING',
    originCountry: 'Молдова',
    manufacturer: 'Conserve Nistrene SRL',
    composition: 'Огурцы, вода, уксус, соль, сахар, укроп, чеснок, горчица',
    packaging: 'Банка 1,5 л, короб 6 шт.',
    storageTempC: 'от 0 °C до +20 °C',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    photos: PHOTO.canned,
    views: 21,
    contacts: 0,
  },

  // --- Apă Izvor --------------------------------------------------------------
  {
    seller: 'apa-izvor',
    category: 'water-still',
    title: 'Вода питьевая негазированная, бутыль 19 л',
    description:
      'Питьевая вода первой категории из артезианской скважины глубиной 140 м в Яловенском районе. Минерализация 0,3–0,5 г/л, обеззараживание ультрафиолетом без хлора. Оборотный поликарбонатный бутыль 19 л с одноразовой пробкой.',
    priceBani: 4_500,
    unit: 'PCS',
    minOrderQty: 20,
    availableQty: 2_400,
    status: 'ACTIVE',
    publishedAgo: 24,
    expiresIn: 40,
    originCountry: 'Молдова',
    manufacturer: 'Apă Izvor SRL',
    productionPlace: 'Яловенский район',
    producedAgo: 5,
    bestBeforeIn: 175,
    packaging: 'Бутыль 19 л (оборотная тара)',
    storageConditions: 'Вдали от источников тепла и запахов',
    supplyRegularity: 'WEEKLY',
    deliveryTerms: 'Доставка по маршруту два раза в неделю, подъём на этаж включён.',
    deliveryPriceBani: 0,
    pickupAvailable: true,
    deliveryRegions: ['ialoveni', 'chisinau', 'straseni'],
    photos: PHOTO.water,
    tiers: [
      { minQty: 20, maxQty: 99, priceBani: 4_500 },
      { minQty: 100, maxQty: null, priceBani: 4_200 },
    ],
    attrs: {
      volume_l: 19,
      beverage_packaging: 'PET',
    },
    views: 1_167,
    contacts: 129,
  },

  // --- Ambalaje Chișinău ------------------------------------------------------
  {
    seller: 'ambalaje-chisinau',
    category: 'pizza-boxes',
    title: 'Коробка для пиццы 32 см, гофрокартон, печать в 2 краски',
    description:
      'Коробка для пиццы 320×320×40 мм из трёхслойного гофрокартона Т-23, белый верх. Ребро жёсткое, крышка не проваливается под весом. Печать логотипа в две краски входит в цену от 5 000 штук, макет бесплатно.',
    priceBani: 450,
    unit: 'PCS',
    minOrderQty: 1_000,
    availableQty: 240_000,
    status: 'ACTIVE',
    publishedAgo: 36,
    expiresIn: 50,
    bumpedAgo: 5,
    originCountry: 'Молдова',
    manufacturer: 'Ambalaje Chișinău SRL',
    productionPlace: 'Кишинёв, ул. Узинелор, 108',
    packaging: 'Пачка 50 шт., паллета 2 000 шт.',
    storageConditions: 'Сухой склад, влажность не выше 65 %',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Самовывоз со склада в Чеканах в день заказа, доставка по Кишинёву — на следующий день.',
    deliveryPriceBani: 0,
    pickupAvailable: true,
    deliveryRegions: ['chisinau', 'ialoveni', 'straseni', 'anenii-noi', 'balti'],
    photos: PHOTO.boxes,
    tiers: [
      { minQty: 1_000, maxQty: 4_999, priceBani: 450 },
      { minQty: 5_000, maxQty: 19_999, priceBani: 430 },
      { minQty: 20_000, maxQty: null, priceBani: 405 },
    ],
    attrs: {
      material: 'CORRUGATED',
      dimensions: '320×320×40 мм',
      units_per_pack: 50,
      custom_print: true,
    },
    views: 2_218,
    contacts: 197,
  },
  {
    seller: 'ambalaje-chisinau',
    category: 'containers',
    title: 'Контейнер PP 750 мл с крышкой, короб 500 шт.',
    description:
      'Прямоугольный контейнер из полипропилена 750 мл с защёлкивающейся крышкой. Выдерживает разогрев в микроволновой печи и заморозку до -20 °C, герметичен при перевозке супов и соусов. Короб 500 комплектов.',
    priceBani: 180,
    unit: 'PCS',
    minOrderQty: 2_000,
    availableQty: 320_000,
    status: 'ACTIVE',
    publishedAgo: 30,
    expiresIn: 50,
    originCountry: 'Турция',
    packaging: 'Короб 500 шт.',
    supplyRegularity: 'CONSTANT',
    pickupAvailable: true,
    deliveryRegions: ['chisinau', 'ialoveni', 'balti'],
    photos: PHOTO.cups,
    attrs: {
      material: 'PP',
      dimensions: '180×130×55 мм',
      capacity_ml: 750,
      units_per_pack: 500,
      custom_print: false,
    },
    views: 1_004,
    contacts: 83,
  },

  // --- HoReCa Service MD ------------------------------------------------------
  {
    seller: 'horeca-service-md',
    category: 'disposable-tableware',
    title: 'Тарелка бумажная ламинированная 23 см, упаковка 100 шт.',
    description:
      'Круглая бумажная тарелка диаметром 23 см с ламинацией: не размокает под горячим блюдом и не течёт от соуса. Плотность 280 г/м², пригодна для контакта с пищевыми продуктами. Упаковка 100 штук, короб 10 упаковок.',
    priceBani: 120,
    unit: 'PCS',
    minOrderQty: 2_000,
    availableQty: 180_000,
    status: 'ACTIVE',
    publishedAgo: 18,
    expiresIn: 45,
    originCountry: 'Польша',
    packaging: 'Упаковка 100 шт., короб 1 000 шт.',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Со склада в Кишинёве, доставка на следующий рабочий день.',
    pickupAvailable: true,
    deliveryRegions: ['chisinau', 'ialoveni', 'anenii-noi', 'balti', 'cahul'],
    photos: PHOTO.cups,
    views: 687,
    contacts: 55,
  },
  {
    seller: 'horeca-service-md',
    category: 'horeca-equipment',
    title: 'Стол холодильный 3-дверный, нержавеющая сталь',
    description:
      'Холодильный стол на три двери, рабочая поверхность из нержавеющей стали AISI 304, диапазон температур от -2 °C до +8 °C. Динамическое охлаждение, автоматическое оттаивание, колёса с тормозом. Черновик — ждём фотографии со склада и финальную цену поставщика.',
    priceBani: 3_450_000,
    unit: 'PCS',
    minOrderQty: 1,
    availableQty: 6,
    status: 'DRAFT',
    availability: 'PRE_ORDER',
    originCountry: 'Италия',
    manufacturer: 'Frigo Italia',
    packaging: 'Деревянная обрешётка',
    pickupAvailable: true,
    photos: PHOTO.kitchen,
    attrs: {
      equipment_condition: 'NEW',
      warranty_months: 12,
      manufacturer_country: 'Италия',
    },
    views: 0,
    contacts: 0,
  },

  // --- Curat Prof -------------------------------------------------------------
  {
    seller: 'curat-prof',
    category: 'detergents',
    title: 'Средство для мытья посуды концентрат, канистра 5 л',
    description:
      'Концентрированное средство для ручного мытья посуды, расход 5 мл на 5 л воды. Хорошо расщепляет животный жир в горячей воде, полностью смывается и не оставляет плёнки на стекле. Канистра 5 л, короб 4 канистры, дозатор в комплекте.',
    priceBani: 8_500,
    unit: 'L',
    minOrderQty: 20,
    availableQty: 3_200,
    status: 'ACTIVE',
    publishedAgo: 22,
    expiresIn: 45,
    originCountry: 'Молдова',
    packaging: 'Канистра 5 л, короб 4 шт.',
    storageConditions: 'Хранить при температуре выше 0 °C, вдали от пищевых продуктов',
    supplyRegularity: 'MONTHLY',
    deliveryTerms: 'По северу — раз в неделю по маршруту, по Кишинёву — курьером.',
    pickupAvailable: true,
    deliveryRegions: ['balti', 'singerei', 'soroca', 'chisinau'],
    photos: PHOTO.cleaning,
    views: 419,
    contacts: 27,
  },

  // --- TransFrig MD -----------------------------------------------------------
  {
    seller: 'transfrig-md',
    category: 'refrigerated-transport',
    title: 'Рефрижераторная перевозка по Молдове, машина до 5 тонн',
    description:
      'Перевозка охлаждённых и замороженных грузов машиной до 5 тонн, режим от -25 °C до +12 °C. Датчик температуры с онлайн-мониторингом, термограмма по факту рейса на почту. Подача по Кишинёву в течение 12 часов, по стране — 24 часов. Цена указана за рейс до 150 км.',
    priceBani: 90_000,
    unit: 'SET',
    minOrderQty: 1,
    availableQty: null,
    status: 'ACTIVE',
    availability: 'PRE_ORDER',
    publishedAgo: 27,
    expiresIn: 50,
    originCountry: 'Молдова',
    supplyRegularity: 'CONSTANT',
    deliveryTerms: 'Свыше 150 км — 12 MDL за километр. Простой сверх двух часов оплачивается отдельно.',
    pickupAvailable: false,
    deliveryRegions: ['chisinau', 'balti', 'cahul', 'orhei', 'ungheni', 'soroca', 'comrat'],
    photos: PHOTO.truck,
    views: 1_318,
    contacts: 118,
  },
  // --- Piața Verde and Familia Market -----------------------------------------
  //
  // Supermarket chains, so their whole range is retail: a household buys one loaf and
  // one litre, while the wholesale minimum is what a small café orders. Without these
  // the delivery storefront would list two shops with nothing in them.
  {
    seller: 'piata-verde',
    category: 'bread',
    title: 'Хлеб пшеничный формовой, 500 г',
    description:
      'Классический белый хлеб из муки высшего сорта, выпечка дважды в сутки в собственной пекарне сети. Пакет с клипсой, срок годности 72 часа.',
    priceBani: 850,
    isRetail: true,
    retailPriceBani: 1_100,
    retailMinQty: 1,
    unit: 'PCS',
    minOrderQty: 20,
    availableQty: 900,
    status: 'ACTIVE',
    publishedAgo: 12,
    originCountry: 'Молдова',
    storageConditions: 'При температуре не выше 25 °C и влажности до 75 %.',
    photos: [...PHOTO.bread],
    views: 612,
    contacts: 31,
  },
  {
    seller: 'piata-verde',
    category: 'milk',
    title: 'Молоко ультрапастеризованное 3,2 %, 1 л',
    description:
      'Ультрапастеризованное молоко в тетрапаке, хранится до 6 месяцев без холодильника. Короб 12 штук.',
    priceBani: 1_550,
    oldPriceBani: 1_850,
    discountEndsIn: 5,
    isRetail: true,
    retailPriceBani: 1_950,
    retailMinQty: 1,
    unit: 'L',
    minOrderQty: 12,
    availableQty: 4_800,
    status: 'ACTIVE',
    publishedAgo: 9,
    originCountry: 'Молдова',
    photos: [...PHOTO.milk],
    views: 884,
    contacts: 47,
  },
  {
    seller: 'piata-verde',
    category: 'chicken-eggs',
    title: 'Яйца куриные С1, упаковка 10 шт',
    description:
      'Столовое яйцо первой категории в картонной упаковке по 10 штук. Поставка ежедневно, дата сортировки на каждом яйце.',
    priceBani: 2_400,
    isRetail: true,
    retailPriceBani: 2_900,
    retailMinQty: 1,
    unit: 'PCS',
    minOrderQty: 10,
    availableQty: 2_000,
    status: 'ACTIVE',
    publishedAgo: 7,
    originCountry: 'Молдова',
    storageConditions: 'От 0 до +20 °C, срок хранения 25 суток.',
    photos: [...PHOTO.eggs],
    views: 735,
    contacts: 39,
  },
  {
    seller: 'piata-verde',
    category: 'apples',
    title: 'Яблоки Golden Delicious, калибр 70+',
    description:
      'Яблоки урожая текущего года из садов Криулянского района, калибр 70+, первый товарный сорт. Ящик 13 кг.',
    priceBani: 1_600,
    oldPriceBani: 1_950,
    discountEndsIn: 3,
    isRetail: true,
    retailPriceBani: 2_100,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 13,
    availableQty: 6_500,
    status: 'ACTIVE',
    publishedAgo: 15,
    originCountry: 'Молдова',
    photos: [...PHOTO.apples],
    views: 921,
    contacts: 52,
  },
  {
    seller: 'piata-verde',
    category: 'water-still',
    title: 'Вода питьевая негазированная, 5 л',
    description:
      'Артезианская питьевая вода первой категории в баклаге 5 литров с ручкой. Термоусадка по 2 штуки.',
    priceBani: 1_150,
    isRetail: true,
    retailPriceBani: 1_450,
    retailMinQty: 1,
    unit: 'L',
    minOrderQty: 10,
    availableQty: 8_000,
    status: 'ACTIVE',
    publishedAgo: 20,
    originCountry: 'Молдова',
    photos: [...PHOTO.water],
    views: 508,
    contacts: 22,
  },
  {
    seller: 'piata-verde',
    category: 'cheese',
    title: 'Сыр полутвёрдый «Молдавский», 45 %',
    description:
      'Полутвёрдый сыр из пастеризованного коровьего молока, выдержка 45 суток, жирность 45 % в сухом веществе. Головка около 3 кг.',
    priceBani: 11_500,
    isRetail: true,
    retailPriceBani: 13_900,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 3,
    availableQty: 420,
    status: 'ACTIVE',
    publishedAgo: 11,
    originCountry: 'Молдова',
    storageConditions: 'От +2 до +6 °C.',
    photos: [...PHOTO.cheese],
    views: 673,
    contacts: 35,
  },
  {
    seller: 'piata-verde',
    category: 'juices',
    title: 'Сок яблочный прямого отжима, 1 л',
    description:
      'Осветлённый яблочный сок прямого отжима без сахара и консервантов. Стеклянная бутылка 1 л, короб 6 штук.',
    priceBani: 2_300,
    isRetail: true,
    retailPriceBani: 2_900,
    retailMinQty: 1,
    unit: 'L',
    minOrderQty: 6,
    availableQty: 1_800,
    status: 'ACTIVE',
    publishedAgo: 6,
    originCountry: 'Молдова',
    photos: [...PHOTO.water],
    views: 414,
    contacts: 18,
  },
  {
    seller: 'familia-market',
    category: 'yogurt',
    title: 'Йогурт натуральный без сахара, 400 г',
    description:
      'Натуральный термостатный йогурт без сахара и загустителей, жирность 3,2 %. Стакан 400 г, короб 8 штук.',
    priceBani: 2_100,
    isRetail: true,
    retailPriceBani: 2_600,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 8,
    availableQty: 1_100,
    status: 'ACTIVE',
    publishedAgo: 5,
    originCountry: 'Молдова',
    storageConditions: 'От +2 до +6 °C, срок годности 14 суток.',
    photos: [...PHOTO.milk],
    views: 556,
    contacts: 27,
  },
  {
    seller: 'familia-market',
    category: 'butter',
    title: 'Масло сливочное 82,5 %, брикет 200 г',
    description:
      'Сливочное масло из пастеризованных сливок, жирность 82,5 %, без растительных жиров. Брикет в фольге, короб 20 штук.',
    priceBani: 18_500,
    oldPriceBani: 21_000,
    discountEndsIn: 7,
    isRetail: true,
    retailPriceBani: 22_400,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 4,
    availableQty: 380,
    status: 'ACTIVE',
    publishedAgo: 8,
    originCountry: 'Молдова',
    storageConditions: 'От +2 до +6 °C.',
    photos: [...PHOTO.butter],
    views: 802,
    contacts: 44,
  },
  {
    seller: 'familia-market',
    category: 'rice',
    title: 'Рис круглозёрный шлифованный, 1 кг',
    description:
      'Круглозёрный шлифованный рис первого сорта в фасовке 1 кг. Подходит для каш и запеканок. Короб 10 пакетов.',
    priceBani: 1_900,
    isRetail: true,
    retailPriceBani: 2_400,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 10,
    availableQty: 3_200,
    status: 'ACTIVE',
    publishedAgo: 18,
    originCountry: 'Италия',
    photos: [...PHOTO.grain],
    views: 389,
    contacts: 15,
  },
  {
    seller: 'familia-market',
    category: 'wheat-flour',
    title: 'Мука пшеничная высшего сорта, 2 кг',
    description:
      'Мука пшеничная хлебопекарная высшего сорта в бумажном пакете 2 кг, клейковина 26 %. Короб 10 пакетов.',
    priceBani: 1_250,
    isRetail: true,
    retailPriceBani: 1_600,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 20,
    availableQty: 5_400,
    status: 'ACTIVE',
    publishedAgo: 22,
    originCountry: 'Молдова',
    photos: [...PHOTO.flour],
    views: 471,
    contacts: 21,
  },
  {
    seller: 'familia-market',
    category: 'frozen-vegetables',
    title: 'Смесь овощная замороженная, 400 г',
    description:
      'Замороженная овощная смесь: морковь, зелёный горошек, кукуруза, стручковая фасоль. Шоковая заморозка, пакет 400 г.',
    priceBani: 2_800,
    isRetail: true,
    retailPriceBani: 3_500,
    retailMinQty: 1,
    unit: 'KG',
    minOrderQty: 10,
    availableQty: 900,
    status: 'ACTIVE',
    publishedAgo: 10,
    originCountry: 'Молдова',
    storageConditions: 'Не выше минус 18 °C, повторная заморозка не допускается.',
    storageTempC: 'минус 18',
    photos: [...PHOTO.carrots],
    views: 343,
    contacts: 13,
  },
  {
    seller: 'familia-market',
    category: 'pastry',
    title: 'Плацинда с брынзой, 200 г',
    description:
      'Традиционная молдавская плацинда с солёной брынзой, выпекается ежедневно. Индивидуальная упаковка, короб 12 штук.',
    priceBani: 1_450,
    isRetail: true,
    retailPriceBani: 1_900,
    retailMinQty: 1,
    unit: 'PCS',
    minOrderQty: 12,
    availableQty: 480,
    status: 'ACTIVE',
    publishedAgo: 4,
    originCountry: 'Молдова',
    allergens: 'Содержит глютен и молочный белок.',
    photos: [...PHOTO.pastry],
    views: 628,
    contacts: 33,
  },
  {
    seller: 'familia-market',
    category: 'soft-drinks',
    title: 'Лимонад «Тархун», 0,5 л',
    description:
      'Безалкогольный сильногазированный напиток на натуральном экстракте тархуна. Стеклянная бутылка 0,5 л, короб 20 штук.',
    priceBani: 1_100,
    oldPriceBani: 1_400,
    discountEndsIn: 2,
    isRetail: true,
    retailPriceBani: 1_500,
    retailMinQty: 1,
    unit: 'L',
    minOrderQty: 20,
    availableQty: 2_600,
    status: 'ACTIVE',
    publishedAgo: 3,
    originCountry: 'Молдова',
    photos: [...PHOTO.water],
    views: 467,
    contacts: 19,
  },
]

// ---------------------------------------------------------------------------
// Purchase requests
// ---------------------------------------------------------------------------

interface RequestSpec {
  /** Stable handle so offers can point at a request without an index. */
  key: string
  buyer: string
  category: string
  title: string
  description: string
  quantity: number
  unit: string
  desiredPriceBani?: number
  maxBudgetBani?: number
  isRecurring?: boolean
  frequency?: string
  firstDeliveryIn?: number
  deadlineIn?: number
  deliveryLocalityId: string
  deliveryAddress?: string
  supplierRadiusKm?: number
  documentRequirements?: string
  packagingRequirements?: string
  storageConditions?: string
  allowPartial?: boolean
  verifiedOnly?: boolean
  isUrgent?: boolean
  visibility?: string
  status: string
  createdAgo: number
  views: number
}

const REQUESTS: RequestSpec[] = [
  {
    key: 'potatoes-weekly',
    buyer: 'la-plopi',
    category: 'potatoes',
    title: 'Требуется 500 кг картофеля еженедельно',
    description:
      'Ресторану молдавской кухни в центре Кишинёва нужен продовольственный картофель на постоянной основе: 500 кг каждую неделю, поставка по вторникам. Калибр 45–60 мм, мытый, без позеленения и механических повреждений. Приём товара с 07:00 до 11:00 через служебный вход со двора. Готовы к годовому договору с фиксированной ценой на квартал.',
    quantity: 500,
    unit: 'KG',
    desiredPriceBani: 780,
    maxBudgetBani: 420_000,
    isRecurring: true,
    frequency: 'WEEKLY',
    firstDeliveryIn: 6,
    deadlineIn: 4,
    deliveryLocalityId: 'chisinau-centru',
    deliveryAddress: 'ул. Пушкина, 24, служебный вход со двора',
    supplierRadiusKm: 80,
    documentRequirements: 'Накладная, сертификат качества, декларация о соответствии',
    packagingRequirements: 'Сетка 25 кг, оборотная тара не принимается',
    allowPartial: true,
    verifiedOnly: true,
    status: 'RECEIVING_OFFERS',
    createdAgo: 12,
    views: 486,
  },
  {
    key: 'beef-weekly',
    buyer: 'la-plopi',
    category: 'beef-chilled',
    title: 'Закупаем охлаждённую говядину, 120 кг в неделю',
    description:
      'Нужна охлаждённая говядина задней части без кости, категория А, для основного меню и банкетов. Объём 120 кг в неделю с возможностью увеличения до 200 кг в выходные. Обязателен ветеринарный сертификат ANSA на каждую партию и вакуумная упаковка кусками по 8–12 кг.',
    quantity: 120,
    unit: 'KG',
    desiredPriceBani: 9_200,
    maxBudgetBani: 1_150_000,
    isRecurring: true,
    frequency: 'WEEKLY',
    firstDeliveryIn: 5,
    deadlineIn: 3,
    deliveryLocalityId: 'chisinau-centru',
    deliveryAddress: 'ул. Пушкина, 24',
    supplierRadiusKm: 160,
    documentRequirements: 'Ветеринарный сертификат ANSA, накладная, товарно-транспортная накладная',
    packagingRequirements: 'Вакуум, куски 8–12 кг',
    storageConditions: 'от 0 °C до +4 °C на всём пути',
    verifiedOnly: true,
    status: 'RECEIVING_OFFERS',
    createdAgo: 9,
    views: 341,
  },
  {
    key: 'greens-daily',
    buyer: 'la-plopi',
    category: 'greens',
    title: 'Нужна свежая зелень ежедневно: укроп, петрушка, кинза',
    description:
      'Ежедневная поставка пучковой зелени к открытию кухни: укроп 3 кг, петрушка 3 кг, кинза 2 кг. Срезка утренняя, доставка до 08:00. Пучок 100 г, ящик 5 кг. Оплата — раз в две недели по счёту.',
    quantity: 8,
    unit: 'KG',
    desiredPriceBani: 9_000,
    maxBudgetBani: 216_000,
    isRecurring: true,
    frequency: 'WEEKLY',
    firstDeliveryIn: 2,
    deadlineIn: 1,
    deliveryLocalityId: 'chisinau-centru',
    deliveryAddress: 'ул. Пушкина, 24',
    supplierRadiusKm: 60,
    allowPartial: true,
    isUrgent: true,
    status: 'RECEIVING_OFFERS',
    createdAgo: 4,
    views: 212,
  },
  {
    key: 'mozzarella-monthly',
    buyer: 'doi-prieteni',
    category: 'cheese',
    title: 'Требуется моцарелла для пиццы, 200 кг в месяц',
    description:
      'Сети из четырёх пиццерий нужна моцарелла для запекания: блок 2–2,5 кг, жирность в сухом веществе не менее 40 %, влагоотдача при выпечке минимальная. Объём 200 кг в месяц, поставка двумя партиями. Просим приложить образец на пробную выпечку перед подписанием договора.',
    quantity: 200,
    unit: 'KG',
    desiredPriceBani: 8_600,
    maxBudgetBani: 1_720_000,
    isRecurring: true,
    frequency: 'MONTHLY',
    firstDeliveryIn: 11,
    deadlineIn: 6,
    deliveryLocalityId: 'ungheni-ungheni',
    deliveryAddress: 'ул. Национала, 15, центральный склад',
    supplierRadiusKm: 140,
    documentRequirements: 'Декларация о соответствии, сертификат ANSA',
    packagingRequirements: 'Вакуумный блок 2–2,5 кг',
    storageConditions: 'от +2 °C до +6 °C',
    allowPartial: true,
    verifiedOnly: true,
    status: 'RECEIVING_OFFERS',
    createdAgo: 15,
    views: 397,
  },
  {
    key: 'pizza-boxes-20k',
    buyer: 'doi-prieteni',
    category: 'pizza-boxes',
    title: 'Коробки для пиццы 32 см — 20 000 штук с печатью логотипа',
    description:
      'Нужны коробки 320×320×40 мм из гофрокартона с белым верхом и печатью нашего логотипа в две краски. Тираж 20 000 штук с отгрузкой двумя партиями по 10 000. Макет предоставим в кривых. Поставщик выбран, договор на подписании.',
    quantity: 20_000,
    unit: 'PCS',
    desiredPriceBani: 430,
    maxBudgetBani: 9_000_000,
    firstDeliveryIn: 9,
    deadlineIn: -2,
    deliveryLocalityId: 'ungheni-ungheni',
    deliveryAddress: 'ул. Национала, 15, центральный склад',
    packagingRequirements: 'Пачка 50 шт., паллета не выше 1,8 м',
    allowPartial: true,
    status: 'SUPPLIER_SELECTED',
    createdAgo: 26,
    views: 604,
  },
  {
    key: 'flour-monthly',
    buyer: 'doi-prieteni',
    category: 'wheat-flour',
    title: 'Мука пшеничная высшего сорта, 3 тонны в месяц',
    description:
      'Для теста на пиццу нужна мука высшего сорта с клейковиной не ниже 26 % и стабильной белизной от партии к партии. Объём 3 тонны в месяц, мешок 50 кг, поставка на склад в Унгенах. Просим указать протокол испытаний по последней партии.',
    quantity: 3_000,
    unit: 'KG',
    desiredPriceBani: 870,
    maxBudgetBani: 2_700_000,
    isRecurring: true,
    frequency: 'MONTHLY',
    firstDeliveryIn: 13,
    deadlineIn: 7,
    deliveryLocalityId: 'ungheni-ungheni',
    deliveryAddress: 'ул. Национала, 15',
    supplierRadiusKm: 220,
    documentRequirements: 'Протокол испытаний, декларация о соответствии',
    packagingRequirements: 'Мешок 50 кг на паллете',
    allowPartial: false,
    status: 'RECEIVING_OFFERS',
    createdAgo: 8,
    views: 288,
  },
  {
    key: 'chicken-monthly',
    buyer: 'codrii-albi',
    category: 'chicken-chilled',
    title: 'Куриное филе охлаждённое, 300 кг в месяц для отеля',
    description:
      'Загородному отелю на 60 номеров с рестораном нужно охлаждённое куриное филе: 300 кг в месяц, поставка раз в неделю по 75 кг. Приём с 08:00 до 14:00 на склад в цокольном этаже. Важна стабильная навеска куска 200–250 г.',
    quantity: 300,
    unit: 'KG',
    desiredPriceBani: 8_800,
    maxBudgetBani: 2_700_000,
    isRecurring: true,
    frequency: 'MONTHLY',
    firstDeliveryIn: 8,
    deadlineIn: 5,
    deliveryLocalityId: 'ialoveni-costesti',
    deliveryAddress: 'ул. Лакулуй, 1, склад в цокольном этаже',
    supplierRadiusKm: 200,
    documentRequirements: 'Ветеринарный сертификат ANSA',
    storageConditions: 'от 0 °C до +4 °C',
    allowPartial: true,
    verifiedOnly: true,
    status: 'RECEIVING_OFFERS',
    createdAgo: 10,
    views: 259,
  },
  {
    key: 'water-monthly',
    buyer: 'codrii-albi',
    category: 'water-still',
    title: 'Вода 19 л для кулеров — 200 бутылей ежемесячно',
    description:
      'Нужна питьевая негазированная вода в бутылях 19 л для кулеров в номерах, конференц-зале и на ресепшене. Объём 200 бутылей в месяц, поставка два раза в месяц по 100 штук с обменом тары. Требуется подъём на этажи.',
    quantity: 200,
    unit: 'PCS',
    desiredPriceBani: 4_200,
    maxBudgetBani: 900_000,
    isRecurring: true,
    frequency: 'MONTHLY',
    firstDeliveryIn: 12,
    deadlineIn: 8,
    deliveryLocalityId: 'ialoveni-costesti',
    deliveryAddress: 'ул. Лакулуй, 1',
    supplierRadiusKm: 60,
    packagingRequirements: 'Оборотный бутыль 19 л с одноразовой пробкой',
    allowPartial: true,
    status: 'ACTIVE',
    createdAgo: 3,
    views: 74,
  },
  {
    key: 'eggs-monthly',
    buyer: 'codrii-albi',
    category: 'chicken-eggs',
    title: 'Яйцо куриное С0, 12 000 штук в месяц',
    description:
      'Для завтраков и кондитерского цеха отеля требуется отборное яйцо С0 массой 65–74 г. Объём 12 000 штук в месяц, поставка еженедельно по 3 000. Лоток 30 штук, короб 360 штук. Дата сортировки — не старше трёх суток на момент приёмки.',
    quantity: 12_000,
    unit: 'PCS',
    desiredPriceBani: 235,
    maxBudgetBani: 2_900_000,
    isRecurring: true,
    frequency: 'MONTHLY',
    firstDeliveryIn: 14,
    deadlineIn: 9,
    deliveryLocalityId: 'ialoveni-costesti',
    supplierRadiusKm: 200,
    documentRequirements: 'Декларация о соответствии, ветеринарное свидетельство',
    allowPartial: true,
    status: 'ACTIVE',
    createdAgo: 2,
    views: 51,
  },
  {
    key: 'apples-retail',
    buyer: 'retail-plus-md',
    category: 'apples',
    title: 'Яблоки Голден для сети магазинов, 8 тонн',
    description:
      'Сеть из 22 магазинов у дома закупает яблоки Голден Делишес первого сорта, калибр 70–80 мм, ящик 13 кг. Разовая партия 8 тонн с приёмкой на распределительный центр в Сороках. Обязательна предварительная запись на разгрузку, приём пн–пт с 07:00 до 16:00.',
    quantity: 8_000,
    unit: 'KG',
    desiredPriceBani: 1_420,
    maxBudgetBani: 12_000_000,
    firstDeliveryIn: 10,
    deadlineIn: 5,
    deliveryLocalityId: 'soroca-soroca',
    deliveryAddress: 'ул. Индепенденцей, 71, распределительный центр',
    supplierRadiusKm: 260,
    documentRequirements: 'Сертификат качества, декларация о соответствии, накладная',
    packagingRequirements: 'Ящик 13 кг на паллете, 60 ящиков на паллету',
    storageConditions: 'от 0 °C до +2 °C',
    allowPartial: true,
    verifiedOnly: true,
    status: 'RECEIVING_OFFERS',
    createdAgo: 14,
    views: 712,
  },
  {
    key: 'milk-weekly',
    buyer: 'retail-plus-md',
    category: 'milk',
    title: 'Молоко пастеризованное 2,5 % — 4 000 л в неделю',
    description:
      'Постоянная закупка пастеризованного молока 2,5 % в плёночном пакете 1 л для 22 магазинов. Объём 4 000 л в неделю, поставка двумя рейсами. Остаточный срок годности на приёмке — не менее пяти суток. Работаем по годовому контракту с отсрочкой платежа 21 день.',
    quantity: 4_000,
    unit: 'L',
    desiredPriceBani: 1_290,
    maxBudgetBani: 5_400_000,
    isRecurring: true,
    frequency: 'WEEKLY',
    firstDeliveryIn: 7,
    deadlineIn: 4,
    deliveryLocalityId: 'soroca-soroca',
    deliveryAddress: 'ул. Индепенденцей, 71',
    supplierRadiusKm: 200,
    documentRequirements: 'Декларация о соответствии, протокол лабораторных испытаний',
    packagingRequirements: 'Плёночный пакет 1 л, короб 12 шт.',
    storageConditions: 'от +2 °C до +6 °C',
    allowPartial: false,
    verifiedOnly: true,
    status: 'RECEIVING_OFFERS',
    createdAgo: 11,
    views: 523,
  },
  {
    key: 'oil-6000',
    buyer: 'retail-plus-md',
    category: 'sunflower-oil',
    title: 'Подсолнечное масло 1 л — 6 000 бутылок',
    description:
      'Разовая закупка рафинированного дезодорированного подсолнечного масла в ПЭТ-бутылке 1 л под собственную выкладку. Объём 6 000 бутылок, приёмка на распределительный центр в Сороках. Закупка завершена, поставщик отработал полностью.',
    quantity: 6_000,
    unit: 'L',
    desiredPriceBani: 3_400,
    maxBudgetBani: 21_000_000,
    firstDeliveryIn: -12,
    deadlineIn: -28,
    deliveryLocalityId: 'soroca-soroca',
    deliveryAddress: 'ул. Индепенденцей, 71',
    documentRequirements: 'Декларация о соответствии, накладная',
    packagingRequirements: 'ПЭТ 1 л, короб 12 бутылок',
    allowPartial: false,
    status: 'COMPLETED',
    createdAgo: 46,
    views: 831,
  },
  {
    key: 'tableware-catering',
    buyer: 'horeca-service-md',
    category: 'disposable-tableware',
    title: 'Одноразовая посуда для кейтеринга — 50 000 единиц',
    description:
      'Под серию выездных мероприятий нужна одноразовая посуда: тарелка 23 см — 20 000 шт., стакан 300 мл — 20 000 шт., миска 500 мл — 10 000 шт. Материал — бумага с ламинацией или биоразлагаемый. Поставка на склад в Кишинёве двумя партиями.',
    quantity: 50_000,
    unit: 'PCS',
    desiredPriceBani: 110,
    maxBudgetBani: 5_500_000,
    firstDeliveryIn: 16,
    deadlineIn: 10,
    deliveryLocalityId: 'chisinau-centru',
    deliveryAddress: 'бул. Дачия, 49/3',
    supplierRadiusKm: 120,
    packagingRequirements: 'Упаковка 100 шт., короб не тяжелее 12 кг',
    allowPartial: true,
    status: 'ACTIVE',
    createdAgo: 5,
    views: 163,
  },
  {
    key: 'pork-monthly',
    buyer: 'gustul-casei',
    category: 'pork',
    title: 'Свинина лопатка для полуфабрикатов, 1,5 тонны в месяц',
    description:
      'Цеху полуфабрикатов нужна охлаждённая свиная лопатка без кости и шкуры с жировой прослойкой до 10 мм — идёт в фарш для пельменей и голубцов. Объём 1,5 тонны в месяц, поставка двумя партиями по вторникам. Вакуум 5–7 кг.',
    quantity: 1_500,
    unit: 'KG',
    desiredPriceBani: 7_500,
    maxBudgetBani: 11_500_000,
    isRecurring: true,
    frequency: 'MONTHLY',
    firstDeliveryIn: 9,
    deadlineIn: 6,
    deliveryLocalityId: 'hincesti-hincesti',
    deliveryAddress: 'ул. Михалча Хынку, 33',
    supplierRadiusKm: 240,
    documentRequirements: 'Ветеринарный сертификат ANSA, накладная',
    packagingRequirements: 'Вакуумный пакет 5–7 кг',
    storageConditions: 'от 0 °C до +4 °C',
    allowPartial: true,
    verifiedOnly: true,
    status: 'ACTIVE',
    createdAgo: 6,
    views: 194,
  },
  {
    key: 'transport-balti',
    buyer: 'gustul-casei',
    category: 'refrigerated-transport',
    title: 'Требуется рефрижераторная перевозка Хынчешты — Бельцы',
    description:
      'Нужна машина до 5 тонн с режимом -18 °C для перевозки замороженных полуфабрикатов по маршруту Хынчешты — Бельцы, загрузка в четверг в 06:00. Обязательна распечатка термограммы по факту рейса. Возможны регулярные рейсы дважды в месяц при подходящей цене.',
    quantity: 1,
    unit: 'SET',
    desiredPriceBani: 95_000,
    maxBudgetBani: 120_000,
    firstDeliveryIn: 4,
    deadlineIn: 2,
    deliveryLocalityId: 'hincesti-hincesti',
    deliveryAddress: 'ул. Михалча Хынку, 33, загрузка со склада',
    supplierRadiusKm: 300,
    documentRequirements: 'Термограмма рейса, CMR',
    isUrgent: true,
    status: 'ACTIVE',
    createdAgo: 1,
    views: 88,
  },
]

const REQUEST_BY_KEY = new Map(REQUESTS.map((request) => [request.key, request]))

/** Products have no hand-written key: (seller, category) is unique across the table. */
const productHandle = (seller: string, category: string): string => `${seller}:${category}`

// ---------------------------------------------------------------------------
// Sealed offers
// ---------------------------------------------------------------------------

interface OfferSpec {
  request: string
  seller: string
  priceBani: number
  quantity: number
  unit: string
  deliveryPriceBani?: number
  deliveryIn?: number
  deliveryDays?: number
  paymentMethod?: string
  validFor?: number
  regularity?: string
  comment: string
  /** `seller:category` of an existing listing offered instead of the exact ask. */
  alternativeProduct?: string
  status: string
  createdAgo: number
  viewedAgo?: number
  respondedAgo?: number
}

const OFFERS: OfferSpec[] = [
  // --- potatoes-weekly --------------------------------------------------------
  {
    request: 'potatoes-weekly',
    seller: 'agro-prim',
    priceBani: 780,
    quantity: 500,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 6,
    deliveryDays: 2,
    paymentMethod: 'TRANSFER',
    validFor: 14,
    regularity: 'WEEKLY',
    comment:
      'Готовы возить по вторникам к 07:30, картофель Ред Скарлет калибра 45–60 мм, мытый, сетка 25 кг. Доставка по Кишинёву включена в цену. При годовом договоре фиксируем 780 бань за килограмм на квартал.',
    alternativeProduct: 'agro-prim:potatoes',
    status: 'SHORTLISTED',
    createdAgo: 10,
    viewedAgo: 9,
    respondedAgo: 8,
  },
  {
    request: 'potatoes-weekly',
    seller: 'legume-de-orhei',
    priceBani: 820,
    quantity: 500,
    unit: 'KG',
    deliveryPriceBani: 25_000,
    deliveryIn: 7,
    deliveryDays: 3,
    paymentMethod: 'TRANSFER',
    validFor: 10,
    regularity: 'WEEKLY',
    comment:
      'Картофель закупаем у соседнего хозяйства и довозим вместе со своей зеленью — один рейс, одна накладная. Доставка 250 MDL за рейс.',
    status: 'VIEWED',
    createdAgo: 9,
    viewedAgo: 8,
  },
  {
    request: 'potatoes-weekly',
    seller: 'frigo-market',
    priceBani: 860,
    quantity: 500,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 5,
    deliveryDays: 1,
    paymentMethod: 'DEFERRED',
    validFor: 12,
    comment:
      'Со склада в Кишинёве, отгрузка в день заказа при оформлении до 12:00. Отсрочка платежа 14 дней после третьей поставки.',
    status: 'SENT',
    createdAgo: 7,
  },
  {
    request: 'potatoes-weekly',
    seller: 'gustul-casei',
    priceBani: 800,
    quantity: 500,
    unit: 'KG',
    deliveryPriceBani: 15_000,
    deliveryIn: 8,
    deliveryDays: 3,
    paymentMethod: 'CASH',
    validFor: 9,
    comment:
      'Возим картофель из Хынчешт вместе со своим рефрижератором по вторникам и пятницам. Минимальная партия 300 кг.',
    status: 'SENT',
    createdAgo: 6,
  },

  // --- beef-weekly ------------------------------------------------------------
  {
    request: 'beef-weekly',
    seller: 'carne-balti',
    priceBani: 9_200,
    quantity: 120,
    unit: 'KG',
    deliveryPriceBani: 90_000,
    deliveryIn: 5,
    deliveryDays: 2,
    paymentMethod: 'TRANSFER',
    validFor: 10,
    regularity: 'WEEKLY',
    comment:
      'Задняя часть без кости, категория А, вакуум по 8–12 кг. Отгрузка в течение 24 часов после убоя, ветеринарный сертификат ANSA на каждую партию. Рейс в Кишинёв по вторникам и пятницам.',
    alternativeProduct: 'carne-balti:beef-chilled',
    status: 'SHORTLISTED',
    createdAgo: 8,
    viewedAgo: 7,
    respondedAgo: 6,
  },
  {
    request: 'beef-weekly',
    seller: 'gustul-casei',
    priceBani: 9_450,
    quantity: 120,
    unit: 'KG',
    deliveryPriceBani: 30_000,
    deliveryIn: 6,
    deliveryDays: 3,
    paymentMethod: 'TRANSFER',
    validFor: 8,
    comment:
      'Работаем с бельцким комбинатом, можем взять на себя обвалку и порционирование под ваши блюда. Доставка из Хынчешт 300 MDL.',
    status: 'VIEWED',
    createdAgo: 7,
    viewedAgo: 6,
  },
  {
    request: 'beef-weekly',
    seller: 'frigo-market',
    priceBani: 9_600,
    quantity: 120,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 4,
    deliveryDays: 1,
    paymentMethod: 'DEFERRED',
    validFor: 7,
    comment: 'Охлаждённая говядина со склада в Кишинёве, доставка рефрижератором в день заказа.',
    status: 'SENT',
    createdAgo: 5,
  },

  // --- greens-daily -----------------------------------------------------------
  {
    request: 'greens-daily',
    seller: 'legume-de-orhei',
    priceBani: 9_000,
    quantity: 8,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 2,
    deliveryDays: 1,
    paymentMethod: 'TRANSFER',
    validFor: 20,
    regularity: 'WEEKLY',
    comment:
      'Срезаем в 05:00, охлаждаем и привозим к 08:00. Пропорции укроп/петрушка/кинза согласуем накануне до 16:00. Оплата раз в две недели по счёту — подходит.',
    status: 'VIEWED',
    createdAgo: 3,
    viewedAgo: 3,
  },
  {
    request: 'greens-daily',
    seller: 'agro-prim',
    priceBani: 9_300,
    quantity: 8,
    unit: 'KG',
    deliveryPriceBani: 20_000,
    deliveryIn: 3,
    deliveryDays: 1,
    paymentMethod: 'TRANSFER',
    validFor: 14,
    comment: 'Можем добавить зелень к вашему картофельному рейсу — тогда доставка бесплатно.',
    status: 'SENT',
    createdAgo: 2,
  },

  // --- mozzarella-monthly -----------------------------------------------------
  {
    request: 'mozzarella-monthly',
    seller: 'lactate-nistru',
    priceBani: 8_600,
    quantity: 200,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 11,
    deliveryDays: 3,
    paymentMethod: 'DEFERRED',
    validFor: 21,
    regularity: 'MONTHLY',
    comment:
      'Моцарелла для запекания, блок 2,3 кг, жирность в сухом веществе 42 %. Образец 2 кг привезём бесплатно на пробную выпечку на этой неделе. Отсрочка 21 день после второй поставки.',
    status: 'SHORTLISTED',
    createdAgo: 13,
    viewedAgo: 12,
    respondedAgo: 11,
  },
  {
    request: 'mozzarella-monthly',
    seller: 'frigo-market',
    priceBani: 8_900,
    quantity: 200,
    unit: 'KG',
    deliveryPriceBani: 25_000,
    deliveryIn: 9,
    deliveryDays: 2,
    paymentMethod: 'TRANSFER',
    validFor: 15,
    comment: 'Импортная моцарелла в блоке 2,5 кг со склада в Кишинёве, всегда в наличии.',
    status: 'VIEWED',
    createdAgo: 12,
    viewedAgo: 11,
  },
  {
    request: 'mozzarella-monthly',
    seller: 'gustul-casei',
    priceBani: 9_100,
    quantity: 200,
    unit: 'KG',
    deliveryPriceBani: 35_000,
    deliveryIn: 14,
    deliveryDays: 4,
    paymentMethod: 'TRANSFER',
    validFor: 12,
    comment: 'Можем поставлять вместе с тестовой заготовкой для пиццы, один рейс на оба товара.',
    status: 'SENT',
    createdAgo: 10,
  },

  // --- pizza-boxes-20k --------------------------------------------------------
  {
    request: 'pizza-boxes-20k',
    seller: 'ambalaje-chisinau',
    priceBani: 430,
    quantity: 20_000,
    unit: 'PCS',
    deliveryPriceBani: 0,
    deliveryIn: 9,
    deliveryDays: 7,
    paymentMethod: 'TRANSFER',
    validFor: 30,
    comment:
      'Коробка 320×320×40 мм, гофрокартон Т-23 с белым верхом, печать в две краски по вашему макету. Макет и цветопроба бесплатно. Первая партия 10 000 штук через 7 рабочих дней, вторая — через три недели. Доставка в Унгены включена.',
    alternativeProduct: 'ambalaje-chisinau:pizza-boxes',
    status: 'ACCEPTED',
    createdAgo: 24,
    viewedAgo: 23,
    respondedAgo: 21,
  },
  {
    request: 'pizza-boxes-20k',
    seller: 'horeca-service-md',
    priceBani: 465,
    quantity: 20_000,
    unit: 'PCS',
    deliveryPriceBani: 0,
    deliveryIn: 12,
    deliveryDays: 10,
    paymentMethod: 'CARD',
    validFor: 20,
    comment: 'Поставка под заказ от европейского производителя, печать в четыре краски.',
    status: 'REJECTED',
    createdAgo: 23,
    viewedAgo: 22,
    respondedAgo: 21,
  },
  {
    request: 'pizza-boxes-20k',
    seller: 'curat-prof',
    priceBani: 480,
    quantity: 20_000,
    unit: 'PCS',
    deliveryPriceBani: 45_000,
    deliveryIn: 15,
    deliveryDays: 12,
    paymentMethod: 'TRANSFER',
    validFor: 18,
    comment: 'Коробки без печати, логотип наносим наклейкой — так дешевле по подготовке.',
    status: 'REJECTED',
    createdAgo: 22,
    viewedAgo: 22,
    respondedAgo: 21,
  },

  // --- flour-monthly ----------------------------------------------------------
  {
    request: 'flour-monthly',
    seller: 'moara-de-sus',
    priceBani: 870,
    quantity: 3_000,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 13,
    deliveryDays: 4,
    paymentMethod: 'DEFERRED',
    validFor: 25,
    regularity: 'MONTHLY',
    comment:
      'Мука высшего сорта, клейковина 27 %, белизна 54 у. е. Протокол испытаний по последней партии приложим к первой отгрузке. Мешок 50 кг, паллета 20 мешков, доставка в Унгены включена.',
    alternativeProduct: 'moara-de-sus:wheat-flour',
    status: 'VIEWED',
    createdAgo: 7,
    viewedAgo: 6,
  },
  {
    request: 'flour-monthly',
    seller: 'frigo-market',
    priceBani: 920,
    quantity: 3_000,
    unit: 'KG',
    deliveryPriceBani: 40_000,
    deliveryIn: 10,
    deliveryDays: 3,
    paymentMethod: 'TRANSFER',
    validFor: 15,
    comment: 'Мука со склада в Кишинёве, отгрузка паллетами, доставка 400 MDL за рейс.',
    status: 'SENT',
    createdAgo: 6,
  },

  // --- chicken-monthly --------------------------------------------------------
  {
    request: 'chicken-monthly',
    seller: 'avicola-singerei',
    priceBani: 8_700,
    quantity: 300,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 8,
    deliveryDays: 3,
    paymentMethod: 'TRANSFER',
    validFor: 20,
    regularity: 'MONTHLY',
    comment:
      'Филе грудки бройлера, навеска куска 200–250 г, охлаждение воздушное. Возим раз в неделю по 75 кг, доставка от 500 кг в месяц бесплатно. Ветеринарный сертификат на каждую партию.',
    alternativeProduct: 'avicola-singerei:chicken-chilled',
    status: 'SHORTLISTED',
    createdAgo: 8,
    viewedAgo: 8,
    respondedAgo: 7,
  },
  {
    request: 'chicken-monthly',
    seller: 'carne-balti',
    priceBani: 9_100,
    quantity: 300,
    unit: 'KG',
    deliveryPriceBani: 40_000,
    deliveryIn: 9,
    deliveryDays: 4,
    paymentMethod: 'TRANSFER',
    validFor: 14,
    comment: 'Можем добавить филе к мясному рейсу, приёмка с 08:00 нам подходит.',
    status: 'VIEWED',
    createdAgo: 7,
    viewedAgo: 6,
  },
  {
    request: 'chicken-monthly',
    seller: 'frigo-market',
    priceBani: 8_950,
    quantity: 300,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 6,
    deliveryDays: 2,
    paymentMethod: 'DEFERRED',
    validFor: 12,
    comment: 'Охлаждённое филе со склада в Кишинёве, доставка в Яловенский район бесплатно.',
    status: 'SENT',
    createdAgo: 5,
  },

  // --- apples-retail ----------------------------------------------------------
  {
    request: 'apples-retail',
    seller: 'codru-fresh',
    priceBani: 1_420,
    quantity: 8_000,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 10,
    deliveryDays: 5,
    paymentMethod: 'DEFERRED',
    validFor: 21,
    comment:
      'Голден Делишес первого сорта, калибр 70–80 мм, фотокалибровка. Ящик 13 кг, 60 ящиков на паллете, всего 10 паллет. Доставку в Сороки берём на себя, разгрузку согласуем заранее.',
    alternativeProduct: 'codru-fresh:apples',
    status: 'SHORTLISTED',
    createdAgo: 12,
    viewedAgo: 11,
    respondedAgo: 10,
  },
  {
    request: 'apples-retail',
    seller: 'agro-prim',
    priceBani: 1_490,
    quantity: 8_000,
    unit: 'KG',
    deliveryPriceBani: 60_000,
    deliveryIn: 12,
    deliveryDays: 6,
    paymentMethod: 'TRANSFER',
    validFor: 18,
    comment: 'Яблоко из соседнего сада, отбираем под ваш калибр. Доставка 600 MDL за рейс.',
    status: 'VIEWED',
    createdAgo: 11,
    viewedAgo: 10,
  },
  {
    request: 'apples-retail',
    seller: 'struguri-de-sud',
    priceBani: 1_550,
    quantity: 8_000,
    unit: 'KG',
    deliveryPriceBani: 80_000,
    deliveryIn: 14,
    deliveryDays: 7,
    paymentMethod: 'TRANSFER',
    validFor: 15,
    comment: 'Можем закрыть объём смешанной паллетой яблок и столового винограда.',
    status: 'SENT',
    createdAgo: 9,
  },
  {
    request: 'apples-retail',
    seller: 'frigo-market',
    priceBani: 1_610,
    quantity: 8_000,
    unit: 'KG',
    deliveryPriceBani: 0,
    deliveryIn: 8,
    deliveryDays: 3,
    paymentMethod: 'DEFERRED',
    validFor: 12,
    comment: 'Яблоко из камеры с регулируемой атмосферой, отгрузка паллетами в любой день недели.',
    status: 'SENT',
    createdAgo: 8,
  },

  // --- milk-weekly ------------------------------------------------------------
  {
    request: 'milk-weekly',
    seller: 'lactate-nistru',
    priceBani: 1_290,
    quantity: 4_000,
    unit: 'L',
    deliveryPriceBani: 0,
    deliveryIn: 7,
    deliveryDays: 2,
    paymentMethod: 'DEFERRED',
    validFor: 25,
    regularity: 'WEEKLY',
    comment:
      'Молоко 2,5 % в плёночном пакете 1 л, остаточный срок на приёмке — 6 суток из 7. Два рейса в неделю рефрижератором, протокол лабораторных испытаний к каждой партии. Отсрочка 21 день принимается.',
    alternativeProduct: 'lactate-nistru:milk',
    status: 'VIEWED',
    createdAgo: 9,
    viewedAgo: 8,
  },
  {
    request: 'milk-weekly',
    seller: 'frigo-market',
    priceBani: 1_340,
    quantity: 4_000,
    unit: 'L',
    deliveryPriceBani: 45_000,
    deliveryIn: 6,
    deliveryDays: 2,
    paymentMethod: 'TRANSFER',
    validFor: 14,
    comment: 'Молоко от двух заводов на выбор, отгрузка со склада в Кишинёве.',
    status: 'SENT',
    createdAgo: 7,
  },

  // --- oil-6000 ---------------------------------------------------------------
  {
    request: 'oil-6000',
    seller: 'oleo-sud',
    priceBani: 3_380,
    quantity: 6_000,
    unit: 'L',
    deliveryPriceBani: 0,
    deliveryIn: -12,
    deliveryDays: 6,
    paymentMethod: 'TRANSFER',
    validFor: -20,
    comment:
      'Рафинированное дезодорированное масло, ПЭТ 1 л, короб 12 бутылок, 10 паллет. Доставку в Сороки берём на себя. Декларация о соответствии и протокол по кислотному числу прилагаются.',
    status: 'SHORTLISTED',
    createdAgo: 44,
    viewedAgo: 43,
    respondedAgo: 42,
  },
  {
    request: 'oil-6000',
    seller: 'frigo-market',
    priceBani: 3_520,
    quantity: 6_000,
    unit: 'L',
    deliveryPriceBani: 50_000,
    deliveryIn: -14,
    deliveryDays: 4,
    paymentMethod: 'TRANSFER',
    validFor: -22,
    comment: 'Импортное масло со склада, отгрузка паллетами в течение двух дней.',
    status: 'REJECTED',
    createdAgo: 43,
    viewedAgo: 42,
    respondedAgo: 40,
  },

  // --- tableware-catering -----------------------------------------------------
  {
    request: 'tableware-catering',
    seller: 'curat-prof',
    priceBani: 110,
    quantity: 50_000,
    unit: 'PCS',
    deliveryPriceBani: 0,
    deliveryIn: 16,
    deliveryDays: 8,
    paymentMethod: 'TRANSFER',
    validFor: 20,
    comment:
      'Бумажная посуда с ламинацией: тарелка 23 см, стакан 300 мл и миска 500 мл. Короб не тяжелее 11 кг, упаковка по 100 штук. Отгружаем двумя партиями с интервалом в неделю.',
    status: 'VIEWED',
    createdAgo: 4,
    viewedAgo: 3,
  },
  {
    request: 'tableware-catering',
    seller: 'ambalaje-chisinau',
    priceBani: 118,
    quantity: 50_000,
    unit: 'PCS',
    deliveryPriceBani: 0,
    deliveryIn: 14,
    deliveryDays: 6,
    paymentMethod: 'CARD',
    validFor: 18,
    comment: 'Биоразлагаемая посуда из багассы, возможна печать логотипа от 10 000 штук на позицию.',
    status: 'SENT',
    createdAgo: 3,
  },
]

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

interface DealEventSpec {
  from: string | null
  to: string
  /** 'buyer' | 'seller' — resolved to the owner user of the matching company. */
  actor: 'buyer' | 'seller'
  comment?: string
  daysAgo: number
}

interface DealSpec {
  buyer: string
  seller: string
  /** `seller:category` of the listing the deal came from. */
  product?: string
  request?: string
  /** `requestKey:sellerKey` of the accepted offer. */
  offer?: string
  title: string
  quantity: number
  unit: string
  unitPriceBani: number
  deliveryPriceBani: number
  deliveryAddress: string
  deliveryIn: number
  paymentMethod: string
  comment?: string
  status: string
  buyerConfirmedAgo?: number
  sellerConfirmedAgo?: number
  completedAgo?: number
  createdAgo: number
  events: DealEventSpec[]
}

const DEALS: DealSpec[] = [
  {
    buyer: 'la-plopi',
    seller: 'agro-prim',
    product: 'agro-prim:potatoes',
    title: 'Картофель Ред Скарлет, 800 кг',
    quantity: 800,
    unit: 'KG',
    unitPriceBani: 780,
    deliveryPriceBani: 0,
    deliveryAddress: 'Кишинёв, ул. Пушкина, 24, служебный вход со двора',
    deliveryIn: -50,
    paymentMethod: 'TRANSFER',
    comment: 'Пробная поставка перед заключением годового договора.',
    status: 'COMPLETED',
    buyerConfirmedAgo: 57,
    sellerConfirmedAgo: 57,
    completedAgo: 44,
    createdAgo: 58,
    events: [
      { from: null, to: 'AWAITING_CONFIRMATION', actor: 'buyer', comment: 'Сделка создана из карточки товара', daysAgo: 58 },
      { from: 'AWAITING_CONFIRMATION', to: 'CONFIRMED', actor: 'seller', comment: 'Объём подтверждён, отгрузка во вторник', daysAgo: 57 },
      { from: 'CONFIRMED', to: 'PREPARING', actor: 'seller', comment: 'Партия отобрана и упакована в сетку 25 кг', daysAgo: 54 },
      { from: 'PREPARING', to: 'SHIPPED', actor: 'seller', comment: 'Машина вышла из Оргеева в 06:40', daysAgo: 51 },
      { from: 'SHIPPED', to: 'DELIVERED', actor: 'buyer', comment: 'Товар принят, недостачи нет', daysAgo: 50 },
      { from: 'DELIVERED', to: 'COMPLETED', actor: 'buyer', comment: 'Оплата прошла, претензий нет', daysAgo: 44 },
    ],
  },
  {
    buyer: 'retail-plus-md',
    seller: 'oleo-sud',
    request: 'oil-6000',
    title: 'Масло подсолнечное рафинированное 1 л, 6 000 бутылок',
    quantity: 6_000,
    unit: 'L',
    unitPriceBani: 3_380,
    deliveryPriceBani: 0,
    deliveryAddress: 'Сорока, ул. Индепенденцей, 71, распределительный центр',
    deliveryIn: -12,
    paymentMethod: 'TRANSFER',
    comment: 'Условия согласованы в переписке по заявке, отгрузка одной партией.',
    status: 'COMPLETED',
    buyerConfirmedAgo: 39,
    sellerConfirmedAgo: 39,
    completedAgo: 8,
    createdAgo: 40,
    events: [
      { from: null, to: 'AWAITING_CONFIRMATION', actor: 'buyer', comment: 'Сделка создана по итогам заявки', daysAgo: 40 },
      { from: 'AWAITING_CONFIRMATION', to: 'CONFIRMED', actor: 'seller', comment: 'Цена и график подтверждены', daysAgo: 39 },
      { from: 'CONFIRMED', to: 'PREPARING', actor: 'seller', comment: 'Розлив партии поставлен в план на неделю', daysAgo: 30 },
      { from: 'PREPARING', to: 'SHIPPED', actor: 'seller', comment: 'Отгружено 10 паллет, CMR оформлен', daysAgo: 14 },
      { from: 'SHIPPED', to: 'DELIVERED', actor: 'buyer', comment: 'Приёмка на РЦ завершена, бой отсутствует', daysAgo: 12 },
      { from: 'DELIVERED', to: 'COMPLETED', actor: 'buyer', comment: 'Оплата по счёту произведена', daysAgo: 8 },
    ],
  },
  {
    buyer: 'la-plopi',
    seller: 'lactate-nistru',
    product: 'lactate-nistru:cheese',
    title: 'Сыр полутвёрдый «Молдавский», 60 кг',
    quantity: 60,
    unit: 'KG',
    unitPriceBani: 8_700,
    deliveryPriceBani: 0,
    deliveryAddress: 'Кишинёв, ул. Пушкина, 24',
    deliveryIn: -24,
    paymentMethod: 'DEFERRED',
    status: 'COMPLETED',
    buyerConfirmedAgo: 32,
    sellerConfirmedAgo: 32,
    completedAgo: 21,
    createdAgo: 33,
    events: [
      { from: null, to: 'AWAITING_CONFIRMATION', actor: 'buyer', comment: 'Заказ на банкетное меню', daysAgo: 33 },
      { from: 'AWAITING_CONFIRMATION', to: 'CONFIRMED', actor: 'seller', comment: 'Головки нужного возраста зарезервированы', daysAgo: 32 },
      { from: 'CONFIRMED', to: 'PREPARING', actor: 'seller', daysAgo: 28 },
      { from: 'PREPARING', to: 'SHIPPED', actor: 'seller', comment: 'Отправлено утренним рефрижератором', daysAgo: 25 },
      { from: 'SHIPPED', to: 'DELIVERED', actor: 'buyer', comment: 'Принято 15 головок по 4 кг', daysAgo: 24 },
      { from: 'DELIVERED', to: 'COMPLETED', actor: 'buyer', comment: 'Оплата по отсрочке закрыта', daysAgo: 21 },
    ],
  },
  {
    buyer: 'codrii-albi',
    seller: 'avicola-singerei',
    product: 'avicola-singerei:chicken-chilled',
    title: 'Курица охлаждённая, тушка 1,4–1,6 кг — 300 кг',
    quantity: 300,
    unit: 'KG',
    unitPriceBani: 5_400,
    deliveryPriceBani: 0,
    deliveryAddress: 'Яловенский район, с. Костешты, ул. Лакулуй, 1',
    deliveryIn: -18,
    paymentMethod: 'TRANSFER',
    comment: 'Поставка под серию свадебных банкетов.',
    status: 'COMPLETED',
    buyerConfirmedAgo: 26,
    sellerConfirmedAgo: 26,
    completedAgo: 15,
    createdAgo: 27,
    events: [
      { from: null, to: 'AWAITING_CONFIRMATION', actor: 'buyer', daysAgo: 27 },
      { from: 'AWAITING_CONFIRMATION', to: 'CONFIRMED', actor: 'seller', comment: 'Забой поставлен на четверг', daysAgo: 26 },
      { from: 'CONFIRMED', to: 'PREPARING', actor: 'seller', daysAgo: 22 },
      { from: 'PREPARING', to: 'SHIPPED', actor: 'seller', comment: 'Рефрижератор вышел в 05:20', daysAgo: 19 },
      { from: 'SHIPPED', to: 'DELIVERED', actor: 'buyer', comment: 'Принято 302 кг, перевес согласован', daysAgo: 18 },
      { from: 'DELIVERED', to: 'COMPLETED', actor: 'buyer', daysAgo: 15 },
    ],
  },
  {
    buyer: 'doi-prieteni',
    seller: 'ambalaje-chisinau',
    request: 'pizza-boxes-20k',
    offer: 'pizza-boxes-20k:ambalaje-chisinau',
    title: 'Коробки для пиццы 32 см с печатью — 20 000 шт.',
    quantity: 20_000,
    unit: 'PCS',
    unitPriceBani: 430,
    deliveryPriceBani: 0,
    deliveryAddress: 'Унгены, ул. Национала, 15, центральный склад',
    deliveryIn: 9,
    paymentMethod: 'TRANSFER',
    comment: 'Первая партия 10 000 шт., вторая — через три недели. Макет утверждён.',
    status: 'CONFIRMED',
    buyerConfirmedAgo: 3,
    sellerConfirmedAgo: 2,
    createdAgo: 3,
    events: [
      { from: null, to: 'AWAITING_CONFIRMATION', actor: 'buyer', comment: 'Сделка создана из принятого предложения', daysAgo: 3 },
      { from: 'AWAITING_CONFIRMATION', to: 'CONFIRMED', actor: 'seller', comment: 'Макет принят в печать, цветопроба во вторник', daysAgo: 2 },
    ],
  },
  {
    buyer: 'retail-plus-md',
    seller: 'codru-fresh',
    product: 'codru-fresh:apples',
    title: 'Яблоки Голден Делишес 1 сорт — 8 тонн',
    quantity: 8_000,
    unit: 'KG',
    unitPriceBani: 1_450,
    deliveryPriceBani: 60_000,
    deliveryAddress: 'Сорока, ул. Индепенденцей, 71, распределительный центр',
    deliveryIn: 2,
    paymentMethod: 'DEFERRED',
    comment: 'Разгрузка по предварительной записи, окно 09:00–11:00.',
    status: 'SHIPPED',
    buyerConfirmedAgo: 6,
    sellerConfirmedAgo: 5,
    createdAgo: 6,
    events: [
      { from: null, to: 'AWAITING_CONFIRMATION', actor: 'buyer', daysAgo: 6 },
      { from: 'AWAITING_CONFIRMATION', to: 'CONFIRMED', actor: 'seller', comment: '10 паллет зарезервированы', daysAgo: 5 },
      { from: 'CONFIRMED', to: 'PREPARING', actor: 'seller', comment: 'Калибровка и упаковка партии', daysAgo: 3 },
      { from: 'PREPARING', to: 'SHIPPED', actor: 'seller', comment: 'Машина вышла в 04:50, прибытие завтра к 09:00', daysAgo: 1 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

interface ReviewSpec {
  /** Index into DEALS. Only COMPLETED deals may carry a review. */
  deal: number
  direction: string
  overall: number
  criteria: Record<string, number>
  comment: string
  createdAgo: number
  reply?: { body: string; createdAgo: number }
}

const REVIEWS: ReviewSpec[] = [
  {
    deal: 0,
    direction: 'BUYER_TO_SELLER',
    overall: 5,
    criteria: { quality: 5, description: 5, delivery: 5, communication: 5, documents: 4 },
    comment:
      'Картофель ровно такой, как в описании: калибр совпал, мытый, без позеленения. Машина пришла к 07:30, разгрузились за двадцать минут и не задержали кухню. Документы привезли с товаром, только сертификат качества пришлось запрашивать отдельно. Берём дальше.',
    createdAgo: 43,
    reply: {
      body: 'Спасибо за отзыв! Сертификат качества теперь кладём в пакет с накладной сразу, чтобы не запрашивали отдельно.',
      createdAgo: 42,
    },
  },
  {
    deal: 0,
    direction: 'SELLER_TO_BUYER',
    overall: 5,
    criteria: { communication: 5, payment: 5, agreement: 5 },
    comment:
      'Заказчик заранее прислал окно разгрузки и встретил машину вовремя. Оплата пришла в срок, без напоминаний. Приятно работать.',
    createdAgo: 42,
  },
  {
    deal: 1,
    direction: 'BUYER_TO_SELLER',
    overall: 4,
    criteria: { quality: 5, description: 4, delivery: 3, communication: 4, documents: 5 },
    comment:
      'Масло качественное, кислотное число в норме, бой при перевозке нулевой. Единственное — отгрузку сдвинули на два дня относительно согласованной даты, пришлось переносить окно приёмки на РЦ. Документы оформлены безупречно.',
    createdAgo: 7,
  },
  {
    deal: 1,
    direction: 'SELLER_TO_BUYER',
    overall: 5,
    criteria: { communication: 5, payment: 5, agreement: 4 },
    comment:
      'Крупный и дисциплинированный покупатель: приёмка по записи, всё чётко, оплата по счёту без задержек. Объём согласовали быстро.',
    createdAgo: 6,
  },
  {
    deal: 2,
    direction: 'BUYER_TO_SELLER',
    overall: 5,
    criteria: { quality: 5, description: 5, delivery: 5, communication: 5, documents: 5 },
    comment:
      'Сыр стабильного качества от партии к партии — для банкетного меню это главное. Возраст головок как договаривались, вакуум целый. Привезли утренним рефрижератором, температуру в кузове показали по прибытии.',
    createdAgo: 20,
  },
  {
    deal: 2,
    direction: 'SELLER_TO_BUYER',
    overall: 4,
    criteria: { communication: 5, payment: 3, agreement: 5 },
    comment:
      'С заказом и приёмкой всё хорошо. Оплата по отсрочке пришла на четыре дня позже согласованного, но заказчик предупредил заранее.',
    createdAgo: 19,
  },
  {
    deal: 3,
    direction: 'BUYER_TO_SELLER',
    overall: 4,
    criteria: { quality: 4, description: 4, delivery: 5, communication: 5, documents: 5 },
    comment:
      'Птица свежая, охлаждение воздушное — при разделке лишней влаги нет. Навеска тушки местами ушла в 1,7 кг вместо заявленных 1,4–1,6, для порционирования это неудобно. Ветеринарные документы всегда в порядке.',
    createdAgo: 14,
    reply: {
      body: 'Спасибо, что отметили навеску. Под ваши банкеты будем отбирать партию по верхней границе 1,6 кг и предупреждать, если такой калибровки не будет.',
      createdAgo: 13,
    },
  },
  {
    deal: 3,
    direction: 'SELLER_TO_BUYER',
    overall: 5,
    criteria: { communication: 5, payment: 5, agreement: 5 },
    comment:
      'Отель принимает точно в согласованное окно, склад подготовлен, перевес согласовали по телефону за минуту. Оплата в тот же день.',
    createdAgo: 13,
  },
]

// ---------------------------------------------------------------------------
// Favourites, saved searches, notifications, conversations, complaints
// ---------------------------------------------------------------------------

/** A pointer into data this module creates, resolved to a real id by the writer. */
type EntityRef =
  | { type: 'PRODUCT'; ref: string }
  | { type: 'REQUEST'; ref: string }
  | { type: 'COMPANY'; ref: string }
  | { type: 'DEAL'; ref: number }

interface FavoriteSpec {
  /** Company key — the favourite belongs to that company's owner. */
  user: string
  product?: string
  company?: string
  createdAgo: number
}

const FAVORITES: FavoriteSpec[] = [
  { user: 'la-plopi', product: 'agro-prim:potatoes', createdAgo: 21 },
  { user: 'la-plopi', product: 'legume-de-orhei:tomatoes', createdAgo: 8 },
  { user: 'la-plopi', product: 'carne-balti:beef-chilled', createdAgo: 11 },
  { user: 'la-plopi', company: 'agro-prim', createdAgo: 44 },
  { user: 'doi-prieteni', product: 'ambalaje-chisinau:pizza-boxes', createdAgo: 25 },
  { user: 'doi-prieteni', product: 'lactate-nistru:cheese', createdAgo: 14 },
  { user: 'codrii-albi', product: 'avicola-singerei:chicken-chilled', createdAgo: 16 },
  { user: 'retail-plus-md', company: 'codru-fresh', createdAgo: 12 },
  { user: 'gustul-casei', product: 'moara-de-sus:wheat-flour', createdAgo: 6 },
]

interface SavedSearchSpec {
  user: string
  name: string
  query: Record<string, unknown>
  target: string
  notifyNew: boolean
  notifyPriceDrop: boolean
  createdAgo: number
}

const SAVED_SEARCHES: SavedSearchSpec[] = [
  {
    user: 'la-plopi',
    name: 'Картофель дешевле 9 леев, Кишинёв и Оргеев',
    query: { q: 'картофель', category: 'potatoes', priceMax: 900, district: 'chisinau', verified: true, sort: 'price_asc', page: 1 },
    target: 'PRODUCT',
    notifyNew: true,
    notifyPriceDrop: true,
    createdAgo: 20,
  },
  {
    user: 'retail-plus-md',
    name: 'Молочные продукты, север страны',
    query: { category: 'dairy', district: 'balti', delivery: true, ratingMin: 4, sort: 'rating', page: 1 },
    target: 'PRODUCT',
    notifyNew: true,
    notifyPriceDrop: false,
    createdAgo: 33,
  },
  {
    user: 'doi-prieteni',
    name: 'Упаковка с печатью логотипа',
    query: { q: 'коробка пицца', category: 'packaging', pickup: true, sort: 'price_asc', page: 1 },
    target: 'PRODUCT',
    notifyNew: true,
    notifyPriceDrop: true,
    createdAgo: 27,
  },
  {
    user: 'avicola-singerei',
    name: 'Заявки на птицу и яйцо',
    query: { category: 'poultry', recurring: true, sort: 'newest', page: 1 },
    target: 'REQUEST',
    notifyNew: true,
    notifyPriceDrop: false,
    createdAgo: 18,
  },
  {
    user: 'transfrig-md',
    name: 'Срочные заявки на перевозку',
    query: { category: 'logistics', urgent: true, sort: 'deadline', page: 1 },
    target: 'REQUEST',
    notifyNew: true,
    notifyPriceDrop: false,
    createdAgo: 9,
  },
]

interface NotificationSpec {
  user: string
  type: string
  params?: Record<string, string | number>
  entity?: EntityRef
  url?: string
  readAgo?: number
  createdAgo: number
}

const NOTIFICATIONS: NotificationSpec[] = [
  {
    user: 'agro-prim',
    type: 'NEW_REQUEST_MATCH',
    params: { title: 'Требуется 500 кг картофеля еженедельно', category: 'Картофель' },
    entity: { type: 'REQUEST', ref: 'potatoes-weekly' },
    url: '/ru/requests/potatoes-weekly',
    createdAgo: 12,
  },
  {
    user: 'la-plopi',
    type: 'NEW_OFFER',
    params: { company: 'Agro Prim', total: '3900.00' },
    entity: { type: 'REQUEST', ref: 'potatoes-weekly' },
    url: '/ru/cabinet/requests',
    readAgo: 9,
    createdAgo: 10,
  },
  {
    user: 'la-plopi',
    type: 'NEW_OFFER',
    params: { company: 'Carne Bălți', total: '11940.00' },
    entity: { type: 'REQUEST', ref: 'beef-weekly' },
    url: '/ru/cabinet/requests',
    createdAgo: 8,
  },
  {
    user: 'ambalaje-chisinau',
    type: 'OFFER_ACCEPTED',
    params: { request: 'Коробки для пиццы 32 см — 20 000 штук', company: 'Pizzeria «Doi Prieteni»' },
    entity: { type: 'REQUEST', ref: 'pizza-boxes-20k' },
    url: '/ru/cabinet/offers',
    readAgo: 20,
    createdAgo: 21,
  },
  {
    user: 'horeca-service-md',
    type: 'OFFER_REJECTED',
    params: { request: 'Коробки для пиццы 32 см — 20 000 штук' },
    entity: { type: 'REQUEST', ref: 'pizza-boxes-20k' },
    url: '/ru/cabinet/offers',
    createdAgo: 21,
  },
  {
    user: 'codru-fresh',
    type: 'DEAL_STATUS',
    params: { number: dealNumber(5), status: 'SHIPPED' },
    entity: { type: 'DEAL', ref: 5 },
    url: '/ru/cabinet/deals',
    createdAgo: 1,
  },
  {
    user: 'agro-prim',
    type: 'REVIEW_RECEIVED',
    params: { company: 'Ресторан «La Plopi»', overall: 5 },
    entity: { type: 'COMPANY', ref: 'agro-prim' },
    url: '/ru/suppliers/agro-prim',
    readAgo: 42,
    createdAgo: 43,
  },
  {
    user: 'conserve-nistrene',
    type: 'LOW_BALANCE',
    params: { balance: '24.50' },
    entity: { type: 'COMPANY', ref: 'conserve-nistrene' },
    url: '/ru/cabinet/balance',
    createdAgo: 2,
  },
  {
    user: 'moara-de-sus',
    type: 'LOW_BALANCE',
    params: { balance: '0.00' },
    entity: { type: 'COMPANY', ref: 'moara-de-sus' },
    url: '/ru/cabinet/balance',
    createdAgo: 1,
  },
  {
    user: 'pescuit-prut',
    type: 'MODERATION_RESULT',
    params: { title: 'Креветка ваннамей 26/30, короб 10 кг', status: 'PENDING' },
    entity: { type: 'PRODUCT', ref: 'pescuit-prut:seafood' },
    url: '/ru/cabinet/products',
    createdAgo: 3,
  },
  {
    user: 'la-plopi',
    type: 'PRICE_DROP',
    params: { title: 'Помидоры тепличные розовые, лоток 6 кг', price: '22.50' },
    entity: { type: 'PRODUCT', ref: 'legume-de-orhei:tomatoes' },
    url: '/ru/catalog',
    createdAgo: 5,
  },
  {
    user: 'legume-de-orhei',
    type: 'LISTING_EXPIRING',
    params: { title: 'Зелень свежая: укроп, петрушка, кинза — срезка утром', days: 25 },
    entity: { type: 'PRODUCT', ref: 'legume-de-orhei:greens' },
    url: '/ru/cabinet/products',
    readAgo: 4,
    createdAgo: 4,
  },
]

interface MessageSpec {
  from: 'buyer' | 'seller' | 'system'
  body: string
  params?: Record<string, string | number>
  daysAgo: number
  hour: number
  minute?: number
}

interface ConversationSpec {
  type: string
  buyer: string
  seller: string
  product?: string
  request?: string
  /** `requestKey:sellerKey` */
  offer?: string
  deal?: number
  subject: string
  messages: MessageSpec[]
}

const CONVERSATIONS: ConversationSpec[] = [
  {
    type: 'PRODUCT',
    buyer: 'la-plopi',
    seller: 'agro-prim',
    product: 'agro-prim:potatoes',
    subject: 'Картофель Ред Скарлет — условия на постоянные поставки',
    messages: [
      {
        from: 'buyer',
        body: 'Добрый день! Интересует картофель на постоянной основе — 500 кг в неделю по вторникам. Сможете держать цену 780 бань за килограмм на квартал?',
        daysAgo: 13,
        hour: 9,
        minute: 12,
      },
      {
        from: 'seller',
        body: 'Здравствуйте! Да, при недельном объёме от 500 кг фиксируем 780 за килограмм до конца квартала. Доставка по Кишинёву в эту цену уже включена.',
        daysAgo: 13,
        hour: 9,
        minute: 41,
      },
      {
        from: 'buyer',
        body: 'Отлично. Приём товара у нас с 07:00 до 11:00 через служебный вход со двора, ул. Пушкина, 24. Успеете к 07:30?',
        daysAgo: 13,
        hour: 10,
        minute: 5,
      },
      {
        from: 'seller',
        body: 'Машина выходит из Оргеева в 06:40, у вас будет в 07:30. Первую партию можем привезти уже в этот вторник.',
        daysAgo: 12,
        hour: 8,
        minute: 20,
      },
    ],
  },
  {
    type: 'REQUEST',
    buyer: 'doi-prieteni',
    seller: 'ambalaje-chisinau',
    request: 'pizza-boxes-20k',
    subject: 'Коробки для пиццы 32 см — макет и сроки',
    messages: [
      {
        from: 'buyer',
        body: 'Здравствуйте! Отправили макет в кривых на вашу почту. Уточните, сколько занимает цветопроба и когда сможете отгрузить первую партию 10 000 штук?',
        daysAgo: 23,
        hour: 11,
        minute: 30,
      },
      {
        from: 'seller',
        body: 'Добрый день! Макет получили, он в работе. Цветопроба во вторник, после утверждения печать и высечка занимают 7 рабочих дней. Первая партия — 10 000 штук, вторая через три недели.',
        daysAgo: 23,
        hour: 12,
        minute: 15,
      },
      {
        from: 'buyer',
        body: 'Принимаем ваше предложение. Оформляем сделку на площадке, оплата переводом по счёту.',
        daysAgo: 21,
        hour: 15,
        minute: 40,
      },
      {
        from: 'system',
        body: 'offerAccepted',
        params: { number: dealNumber(4), total: '86000.00' },
        daysAgo: 21,
        hour: 15,
        minute: 41,
      },
    ],
  },
  {
    type: 'DEAL',
    buyer: 'retail-plus-md',
    seller: 'codru-fresh',
    deal: 5,
    subject: `Сделка ${dealNumber(5)} — яблоки Голден, 8 тонн`,
    messages: [
      {
        from: 'buyer',
        body: 'Записали вашу машину на разгрузку завтра с 09:00 до 11:00. Въезд со стороны склада, пропуск на номер сообщите заранее.',
        daysAgo: 2,
        hour: 16,
        minute: 10,
      },
      {
        from: 'seller',
        body: 'Принято. Машина KLM 421, водитель выезжает в 04:50, будет у вас к 09:00. Везём 10 паллет по 60 ящиков.',
        daysAgo: 1,
        hour: 18,
        minute: 25,
      },
      {
        from: 'buyer',
        body: 'Хорошо, ждём. Приложите, пожалуйста, сертификат качества и декларацию к товарной накладной.',
        daysAgo: 1,
        hour: 19,
        minute: 2,
      },
    ],
  },
  {
    type: 'OFFER',
    buyer: 'retail-plus-md',
    seller: 'lactate-nistru',
    offer: 'milk-weekly:lactate-nistru',
    subject: 'Молоко 2,5 % — остаточный срок годности и график',
    messages: [
      {
        from: 'buyer',
        body: 'Ваше предложение по цене подходит. Вопрос по срокам: на приёмке нам нужен остаточный срок не менее пяти суток. Как это выглядит при двух рейсах в неделю?',
        daysAgo: 8,
        hour: 10,
        minute: 50,
      },
      {
        from: 'seller',
        body: 'Молоко разливаем в ночь перед рейсом, у вас на приёмке будет 6 суток из 7. Рейсы вторник и пятница, протокол лабораторных испытаний прикладываем к каждой партии.',
        daysAgo: 8,
        hour: 11,
        minute: 22,
      },
    ],
  },
]

interface ComplaintSpec {
  reporter: string
  entity: EntityRef
  reason: string
  description: string
  status: string
  createdAgo: number
  priority: number
}

const COMPLAINTS: ComplaintSpec[] = [
  {
    reporter: 'la-plopi',
    entity: { type: 'PRODUCT', ref: 'pescuit-prut:seafood' },
    reason: 'WRONG_PRICE',
    description:
      'В заголовке указана цена за килограмм, но в описании речь идёт о коробе 10 кг — по факту получается совсем другая сумма. Просьба проверить объявление: покупатель может неверно понять условия.',
    status: 'OPEN',
    createdAgo: 3,
    priority: 2,
  },
  {
    reporter: 'retail-plus-md',
    entity: { type: 'COMPANY', ref: 'curat-prof' },
    reason: 'SPAM',
    description:
      'Компания третий раз присылает одинаковые предложения на заявки, которые не относятся к её ассортименту — на упаковку и на одноразовую посуду. Похоже на рассылку по всем открытым заявкам подряд.',
    status: 'OPEN',
    createdAgo: 5,
    priority: 1,
  },
]

/** Sellers whose balance history is shown in the cabinet. Amounts are derived. */
const LEDGER_SELLERS: readonly string[] = [
  'agro-prim',
  'lactate-nistru',
  'avicola-singerei',
  'ambalaje-chisinau',
]

/** How many daily listing charges to write per seller. */
const LEDGER_DAYS = 7

// ---------------------------------------------------------------------------
// Derived aggregates
//
// Nothing below is typed in by hand. Each number is folded out of the tables
// above, the same way src/server/services/{reviews,stats,offers}.ts recompute it
// after a write — so the demo database is internally consistent by construction
// rather than by luck.
// ---------------------------------------------------------------------------

const COMPLETED_DEAL_INDEXES = DEALS.map((deal, index) => ({ deal, index }))
  .filter(({ deal }) => deal.status === 'COMPLETED')
  .map(({ index }) => index)

/** ratingAvg / ratingCount per company, from the reviews this file publishes. */
const RATING_BY_COMPANY = (() => {
  const totals = new Map<string, { sum: number; count: number }>()

  for (const review of REVIEWS) {
    const deal = must(DEALS[review.deal], `review points at missing deal #${review.deal}`)
    if (deal.status !== 'COMPLETED') {
      throw new Error(`demo seed: review on non-completed deal #${review.deal}`)
    }
    const target = review.direction === 'BUYER_TO_SELLER' ? deal.seller : deal.buyer
    const entry = totals.get(target) ?? { sum: 0, count: 0 }
    entry.sum += review.overall
    entry.count += 1
    totals.set(target, entry)
  }

  return new Map(
    [...totals.entries()].map(([key, { sum, count }]) => [
      key,
      { avg: Math.round((sum / count) * 100) / 100, count },
    ]),
  )
})()

/** A company counts a completed deal whether it bought or sold. */
const DEALS_COMPLETED_BY_COMPANY = (() => {
  const counts = new Map<string, number>()
  for (const index of COMPLETED_DEAL_INDEXES) {
    const deal = must(DEALS[index], `missing deal #${index}`)
    for (const key of [deal.buyer, deal.seller]) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
})()

const OFFERS_BY_REQUEST = (() => {
  const counts = new Map<string, number>()
  for (const offer of OFFERS) counts.set(offer.request, (counts.get(offer.request) ?? 0) + 1)
  return counts
})()

const FAVORITES_BY_PRODUCT = (() => {
  const counts = new Map<string, number>()
  for (const favorite of FAVORITES) {
    if (!favorite.product) continue
    counts.set(favorite.product, (counts.get(favorite.product) ?? 0) + 1)
  }
  return counts
})()

const ACTIVE_PRODUCTS_BY_SELLER = (() => {
  const counts = new Map<string, number>()
  for (const product of PRODUCTS) {
    if (product.status !== 'ACTIVE') continue
    counts.set(product.seller, (counts.get(product.seller) ?? 0) + 1)
  }
  return counts
})()

// ---------------------------------------------------------------------------
// Integrity checks — a broken reference should fail here, not at the FK
// ---------------------------------------------------------------------------

function assertReferencesResolve(): void {
  const productHandles = new Set<string>()

  for (const product of PRODUCTS) {
    const handle = productHandle(product.seller, product.category)
    if (productHandles.has(handle)) throw new Error(`demo seed: duplicate product ${handle}`)
    productHandles.add(handle)

    if (!COMPANY_BY_KEY.has(product.seller)) {
      throw new Error(`demo seed: product "${product.title}" has unknown seller "${product.seller}"`)
    }
    if (!CATEGORY_BY_SLUG.has(product.category)) {
      throw new Error(`demo seed: product "${product.title}" has unknown category "${product.category}"`)
    }

    let previousMax = -Infinity
    let previousPrice = Infinity
    for (const tier of product.tiers ?? []) {
      if (tier.minQty <= previousMax) {
        throw new Error(`demo seed: overlapping price tiers on "${product.title}"`)
      }
      if (tier.priceBani >= previousPrice) {
        throw new Error(`demo seed: non-decreasing price tiers on "${product.title}"`)
      }
      previousMax = tier.maxQty ?? Infinity
      previousPrice = tier.priceBani
    }

    for (const key of Object.keys(product.attrs ?? {})) {
      if (!resolveAttribute(product.category, key)) {
        throw new Error(`demo seed: "${product.category}" has no attribute "${key}"`)
      }
    }
  }

  for (const request of REQUESTS) {
    if (!COMPANY_BY_KEY.has(request.buyer)) {
      throw new Error(`demo seed: request "${request.key}" has unknown buyer "${request.buyer}"`)
    }
    if (!CATEGORY_BY_SLUG.has(request.category)) {
      throw new Error(`demo seed: request "${request.key}" has unknown category "${request.category}"`)
    }
  }

  const offerPairs = new Set<string>()
  for (const offer of OFFERS) {
    const request = REQUEST_BY_KEY.get(offer.request)
    if (!request) throw new Error(`demo seed: offer points at unknown request "${offer.request}"`)
    if (request.buyer === offer.seller) {
      throw new Error(`demo seed: "${offer.seller}" cannot bid on its own request "${offer.request}"`)
    }
    const pair = `${offer.request}|${offer.seller}`
    if (offerPairs.has(pair)) throw new Error(`demo seed: duplicate offer ${pair}`)
    offerPairs.add(pair)
    if (offer.alternativeProduct && !productHandles.has(offer.alternativeProduct)) {
      throw new Error(`demo seed: offer references unknown product "${offer.alternativeProduct}"`)
    }
  }

  const accepted = OFFERS.filter((offer) => offer.status === 'ACCEPTED')
  if (accepted.length !== 1) {
    throw new Error(`demo seed: expected exactly one ACCEPTED offer, found ${accepted.length}`)
  }

  for (const deal of DEALS) {
    if (deal.product && !productHandles.has(deal.product)) {
      throw new Error(`demo seed: deal "${deal.title}" references unknown product "${deal.product}"`)
    }
    if (deal.request && !REQUEST_BY_KEY.has(deal.request)) {
      throw new Error(`demo seed: deal "${deal.title}" references unknown request "${deal.request}"`)
    }
  }

  const reviewKeys = new Set<string>()
  for (const review of REVIEWS) {
    const key = `${review.deal}|${review.direction}`
    if (reviewKeys.has(key)) throw new Error(`demo seed: duplicate review ${key}`)
    reviewKeys.add(key)
  }

  for (const favorite of FAVORITES) {
    if (favorite.product && !productHandles.has(favorite.product)) {
      throw new Error(`demo seed: favourite references unknown product "${favorite.product}"`)
    }
  }
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export interface DemoSeedCounts {
  users: number
  companies: number
  companyMembers: number
  companyPhotos: number
  verificationBadges: number
  products: number
  productPhotos: number
  priceTiers: number
  productAttributeValues: number
  promotions: number
  requests: number
  offers: number
  deals: number
  dealEvents: number
  reviews: number
  reviewReplies: number
  favorites: number
  savedSearches: number
  notifications: number
  conversations: number
  conversationParticipants: number
  messages: number
  complaints: number
  moderationTasks: number
  ledgerEntries: number
  featureFlags: number
  tariffs: number
  retailOrders: number
  retailOrderItems: number
}

/** Moldovan IDNO is 13 digits. These are syntactically valid and belong to nobody. */
function idnoFor(index: number): string {
  return `1002600${String(100_000 + index * 137).slice(-6)}`
}

export async function seedDemo(db: PrismaClient): Promise<DemoSeedCounts> {
  assertReferencesResolve()

  // --- users ----------------------------------------------------------------
  const passwordHash = await hashPassword(TEST_PASSWORD)

  const userSpecs = new Map<string, UserSpec>()
  for (const staff of STAFF) userSpecs.set(staff.email, staff)
  for (const company of COMPANIES) {
    const { owner } = company
    if (owner.staffKey) {
      if (!userSpecs.has(owner.email)) {
        throw new Error(`demo seed: company "${company.key}" points at unknown staff login`)
      }
      continue
    }
    if (!userSpecs.has(owner.email)) {
      userSpecs.set(owner.email, {
        key: `own-${company.key}`,
        name: owner.name,
        email: owner.email,
        phone: owner.phone,
        role: 'USER',
        locale: owner.locale,
      })
    }
  }

  const userIdByEmail = new Map<string, string>()
  const userRows = [...userSpecs.values()].map((spec, index) => {
    const id = `usr_${spec.key}`
    userIdByEmail.set(spec.email, id)
    return {
      id,
      email: spec.email,
      phone: spec.phone,
      passwordHash,
      name: spec.name,
      locale: spec.locale,
      role: spec.role,
      status: 'ACTIVE',
      emailVerifiedAt: ago(120 - index),
      phoneVerifiedAt: ago(120 - index),
      acceptedTermsAt: ago(120 - index),
      onboardedAt: ago(119 - index),
      // The admin login deliberately ships without TOTP so the enrolment flow is
      // reachable in a fresh database.
      totpSecretEnc: null,
      totpEnabledAt: null,
      lastLoginAt: ago(index % 9),
      createdAt: ago(140 - index),
    }
  })
  await db.user.createMany({ data: userRows })

  const ownerUserId = (companyKey: string): string => {
    const company = must(COMPANY_BY_KEY.get(companyKey), `unknown company "${companyKey}"`)
    return must(userIdByEmail.get(company.owner.email), `no user for "${company.owner.email}"`)
  }

  // --- companies ------------------------------------------------------------
  const companyId = (key: string): string => `co_${key}`

  await db.company.createMany({
    data: COMPANIES.map((company, index) => {
      const rating = RATING_BY_COMPANY.get(company.key)
      return {
        id: companyId(company.key),
        slug: company.key,
        legalName: company.legalName,
        displayName: company.displayName,
        idno: idnoFor(index),
        orgType: company.orgType,
        description: company.description,
        phone: company.owner.phone,
        email: company.owner.email,
        website: company.website ?? null,
        contactPerson: company.contactPerson,
        districtId: company.districtId,
        localityId: company.localityId ?? centreOf(company.districtId).id,
        address: company.address,
        workingHours: json(HOURS[company.hours]),
        paymentMethods: json(company.paymentMethods),
        languages: json(company.languages),
        deliveryZones: json(company.deliveryZones),
        deliveryTerms: company.deliveryTerms,
        minOrderBani: company.minOrderBani,
        pickupAvailable: company.pickupAvailable,
        deliveryPriceHint: company.deliveryPriceHint,
        isBuyer: company.isBuyer,
        isSeller: company.isSeller,
        kind: company.kind,
        // Derived, never typed twice: delivery terms exist exactly when the storefront
        // is on, so the demo cannot ship a shop with a fee nobody can ever pay.
        isRetail: company.retail !== undefined,
        retailDeliveryFeeBani: company.retail?.deliveryFeeBani ?? null,
        retailFreeFromBani: company.retail?.freeFromBani ?? null,
        retailDeliveryNote: company.retail?.note ?? null,
        ratingAvg: rating?.avg ?? 0,
        ratingCount: rating?.count ?? 0,
        dealsCompleted: DEALS_COMPLETED_BY_COMPANY.get(company.key) ?? 0,
        avgResponseMinutes: company.avgResponseMinutes,
        balanceBani: company.balanceBani,
        trialEndsAt: company.trialDays ? ahead(company.trialDays) : null,
        status: 'ACTIVE',
        createdAt: ago(135 - index),
      }
    }),
  })

  await db.companyMember.createMany({
    data: COMPANIES.map((company) => ({
      id: `mem_${company.key}`,
      companyId: companyId(company.key),
      userId: ownerUserId(company.key),
      role: 'OWNER',
      createdAt: ago(134),
    })),
  })

  const companyPhotoRows = COMPANIES.flatMap((company) =>
    company.photos.map((photo, index) => ({
      id: `cph_${company.key}_${index}`,
      companyId: companyId(company.key),
      key: photoUrl(photo),
      sortOrder: index,
    })),
  )
  await db.companyPhoto.createMany({ data: companyPhotoRows })

  const badgeRows = COMPANIES.flatMap((company) =>
    company.badges.map(([type, status]) => ({
      id: `bdg_${company.key}_${type}`,
      companyId: companyId(company.key),
      type,
      status,
      grantedAt: status === 'APPROVED' ? ago(100) : null,
      expiresAt: status === 'APPROVED' && type === 'ANSA' ? ahead(280) : null,
      note: status === 'PENDING' ? 'Документы на проверке у модератора' : null,
    })),
  )
  await db.verificationBadge.createMany({ data: badgeRows })

  // --- products -------------------------------------------------------------
  const productIdByHandle = new Map<string, string>()

  const productRows = PRODUCTS.map((product, index) => {
    const id = `prd_${String(index).padStart(3, '0')}`
    productIdByHandle.set(productHandle(product.seller, product.category), id)
    const createdAgo = product.publishedAgo ?? 2

    return {
      id,
      companyId: companyId(product.seller),
      categoryId: must(CATEGORY_BY_SLUG.get(product.category), 'category').id,
      slug: uniqueSlug(product.title, index),
      title: product.title,
      description: product.description,
      priceBani: product.priceBani,
      oldPriceBani: product.oldPriceBani ?? null,
      discountEndsAt: product.discountEndsIn === undefined ? null : ahead(product.discountEndsIn),
      isRetail: product.isRetail ?? false,
      retailPriceBani: product.retailPriceBani ?? null,
      retailMinQty: product.retailMinQty ?? 1,
      currency: 'MDL',
      unit: product.unit,
      minOrderQty: product.minOrderQty,
      availableQty: product.availableQty,
      originCountry: product.originCountry ?? null,
      productionPlace: product.productionPlace ?? null,
      manufacturer: product.manufacturer ?? null,
      batchNumber: product.batchNumber ?? null,
      producedAt: product.producedAgo === undefined ? null : ago(product.producedAgo),
      bestBefore: product.bestBeforeIn === undefined ? null : ahead(product.bestBeforeIn),
      storageConditions: product.storageConditions ?? null,
      storageTempC: product.storageTempC ?? null,
      allergens: product.allergens ?? null,
      composition: product.composition ?? null,
      packaging: product.packaging ?? null,
      supplyRegularity: product.supplyRegularity ?? null,
      deliveryTerms: product.deliveryTerms ?? null,
      deliveryPriceBani: product.deliveryPriceBani ?? null,
      pickupAvailable: product.pickupAvailable ?? false,
      deliveryRegions: product.deliveryRegions ? json(product.deliveryRegions) : null,
      videoUrl: product.videoUrl ?? null,
      availability: product.availability ?? 'IN_STOCK',
      status: product.status,
      moderatorComment: product.moderatorComment ?? null,
      publishedAt: product.publishedAgo === undefined ? null : ago(product.publishedAgo),
      expiresAt: product.expiresIn === undefined ? null : ahead(product.expiresIn),
      pausedForBalance: false,
      searchText: searchTextFor(product.title, product.description, product.category),
      viewsCount: product.views,
      favoritesCount: FAVORITES_BY_PRODUCT.get(productHandle(product.seller, product.category)) ?? 0,
      contactsCount: product.contacts,
      promotedUntil: product.promotedFor === undefined ? null : ahead(product.promotedFor),
      bumpedAt: product.bumpedAgo === undefined ? null : ago(product.bumpedAgo),
      isHighlighted: product.highlighted ?? false,
      isUrgent: product.urgent ?? false,
      isHomepagePinned: product.pinned ?? false,
      createdAt: ago(createdAgo),
    }
  })
  await db.product.createMany({ data: productRows })

  const productId = (handle: string): string =>
    must(productIdByHandle.get(handle), `unknown product "${handle}"`)

  const productPhotoRows = PRODUCTS.flatMap((product, index) =>
    product.photos.map((photo, photoIndex) => ({
      id: `pph_${index}_${photoIndex}`,
      productId: productId(productHandle(product.seller, product.category)),
      key: photoUrl(photo),
      alt: product.title,
      sortOrder: photoIndex,
    })),
  )
  await db.productPhoto.createMany({ data: productPhotoRows })

  const priceTierRows = PRODUCTS.flatMap((product, index) =>
    (product.tiers ?? []).map((tier, tierIndex) => ({
      id: `tier_${index}_${tierIndex}`,
      productId: productId(productHandle(product.seller, product.category)),
      minQty: tier.minQty,
      maxQty: tier.maxQty,
      priceBani: tier.priceBani,
    })),
  )
  await db.priceTier.createMany({ data: priceTierRows })

  const attributeValueRows = PRODUCTS.flatMap((product, index) =>
    Object.entries(product.attrs ?? {}).map(([key, value], valueIndex) => {
      const resolved = must(
        resolveAttribute(product.category, key),
        `attribute "${key}" is not defined for "${product.category}"`,
      )
      const row = {
        id: `pav_${index}_${valueIndex}`,
        productId: productId(productHandle(product.seller, product.category)),
        attributeId: resolved.attributeId,
        valueText: null as string | null,
        valueNumber: null as number | null,
        valueBool: null as boolean | null,
        valueDate: null as Date | null,
        optionId: null as string | null,
      }

      switch (resolved.spec.type) {
        case 'SELECT':
        case 'MULTISELECT':
          row.optionId = optionId(resolved.attributeId, String(value))
          row.valueText = String(value)
          break
        case 'NUMBER':
          row.valueNumber = Number(value)
          break
        case 'BOOL':
          row.valueBool = Boolean(value)
          break
        case 'DATE':
          row.valueDate = value instanceof Date ? value : new Date(String(value))
          break
        default:
          row.valueText = String(value)
      }

      return row
    }),
  )
  await db.productAttributeValue.createMany({ data: attributeValueRows })

  // Promotion is the source of truth behind the denormalized flags on Product.
  const promotionRows = PRODUCTS.flatMap((product, index) => {
    const rows: {
      id: string
      productId: string
      type: string
      startsAt: Date
      endsAt: Date
      priceBani: number
    }[] = []
    const handle = productHandle(product.seller, product.category)

    if (product.promotedFor !== undefined) {
      rows.push({
        id: `promo_${index}_cat`,
        productId: productId(handle),
        type: 'PIN_CATEGORY',
        startsAt: ago(Math.max(product.publishedAgo ?? 7, 1)),
        endsAt: ahead(product.promotedFor),
        priceBani: must(DEFAULT_TARIFFS.PROMO_PIN_CATEGORY, 'tariff').priceBani,
      })
    }
    if (product.pinned) {
      rows.push({
        id: `promo_${index}_home`,
        productId: productId(handle),
        type: 'HOMEPAGE',
        startsAt: ago(Math.max(product.publishedAgo ?? 5, 1)),
        endsAt: ahead(14),
        priceBani: must(DEFAULT_TARIFFS.PROMO_HOMEPAGE, 'tariff').priceBani,
      })
    }
    if (product.highlighted) {
      rows.push({
        id: `promo_${index}_hl`,
        productId: productId(handle),
        type: 'HIGHLIGHT',
        startsAt: ago(Math.max(product.publishedAgo ?? 5, 1)),
        endsAt: ahead(10),
        priceBani: must(DEFAULT_TARIFFS.PROMO_HIGHLIGHT, 'tariff').priceBani,
      })
    }
    return rows
  })
  await db.promotion.createMany({ data: promotionRows })

  // --- purchase requests ----------------------------------------------------
  const requestIdByKey = new Map<string, string>()

  await db.purchaseRequest.createMany({
    data: REQUESTS.map((request, index) => {
      const id = `req_${String(index).padStart(3, '0')}`
      requestIdByKey.set(request.key, id)
      return {
        id,
        companyId: companyId(request.buyer),
        categoryId: must(CATEGORY_BY_SLUG.get(request.category), 'category').id,
        slug: uniqueSlug(request.title, 200 + index),
        title: request.title,
        description: request.description,
        quantity: request.quantity,
        unit: request.unit,
        desiredPriceBani: request.desiredPriceBani ?? null,
        maxBudgetBani: request.maxBudgetBani ?? null,
        isRecurring: request.isRecurring ?? false,
        frequency: request.frequency ?? null,
        firstDeliveryAt: request.firstDeliveryIn === undefined ? null : at(request.firstDeliveryIn),
        offersDeadlineAt: request.deadlineIn === undefined ? null : at(request.deadlineIn, 18),
        deliveryLocalityId: request.deliveryLocalityId,
        deliveryAddress: request.deliveryAddress ?? null,
        supplierRadiusKm: request.supplierRadiusKm ?? null,
        documentRequirements: request.documentRequirements ?? null,
        packagingRequirements: request.packagingRequirements ?? null,
        storageConditions: request.storageConditions ?? null,
        allowPartial: request.allowPartial ?? false,
        verifiedOnly: request.verifiedOnly ?? false,
        isUrgent: request.isUrgent ?? false,
        visibility: request.visibility ?? 'PUBLIC',
        status: request.status,
        offersCount: OFFERS_BY_REQUEST.get(request.key) ?? 0,
        viewsCount: request.views,
        searchText: searchTextFor(request.title, request.description, request.category),
        createdAt: ago(request.createdAgo),
      }
    }),
  })

  const requestId = (key: string): string =>
    must(requestIdByKey.get(key), `unknown request "${key}"`)

  // --- offers ---------------------------------------------------------------
  const offerIdByPair = new Map<string, string>()

  await db.offer.createMany({
    data: OFFERS.map((offer, index) => {
      const id = `off_${String(index).padStart(3, '0')}`
      offerIdByPair.set(`${offer.request}:${offer.seller}`, id)
      const deliveryPriceBani = offer.deliveryPriceBani ?? 0
      return {
        id,
        requestId: requestId(offer.request),
        sellerCompanyId: companyId(offer.seller),
        priceBani: offer.priceBani,
        quantity: offer.quantity,
        unit: offer.unit,
        deliveryPriceBani,
        totalBani: Math.round(offer.quantity * offer.priceBani) + deliveryPriceBani,
        currency: 'MDL',
        deliveryAt: offer.deliveryIn === undefined ? null : at(offer.deliveryIn),
        deliveryDays: offer.deliveryDays ?? null,
        paymentMethod: offer.paymentMethod ?? null,
        validUntil: offer.validFor === undefined ? null : at(offer.validFor, 23, 59),
        regularity: offer.regularity ?? null,
        comment: offer.comment,
        alternativeProductId: offer.alternativeProduct ? productId(offer.alternativeProduct) : null,
        status: offer.status,
        viewedAt: offer.viewedAgo === undefined ? null : ago(offer.viewedAgo),
        respondedAt: offer.respondedAgo === undefined ? null : ago(offer.respondedAgo),
        createdAt: ago(offer.createdAgo),
      }
    }),
  })

  // --- deals ----------------------------------------------------------------
  const dealIds = DEALS.map((_, index) => `deal_${String(index).padStart(3, '0')}`)

  await db.deal.createMany({
    data: DEALS.map((deal, index) => ({
      id: must(dealIds[index], 'deal id'),
      number: dealNumber(index),
      buyerCompanyId: companyId(deal.buyer),
      sellerCompanyId: companyId(deal.seller),
      productId: deal.product ? productId(deal.product) : null,
      requestId: deal.request ? requestId(deal.request) : null,
      offerId: deal.offer ? must(offerIdByPair.get(deal.offer), `offer "${deal.offer}"`) : null,
      title: deal.title,
      quantity: deal.quantity,
      unit: deal.unit,
      unitPriceBani: deal.unitPriceBani,
      deliveryPriceBani: deal.deliveryPriceBani,
      totalBani: Math.round(deal.quantity * deal.unitPriceBani) + deal.deliveryPriceBani,
      currency: 'MDL',
      deliveryAddress: deal.deliveryAddress,
      deliveryAt: at(deal.deliveryIn),
      paymentMethod: deal.paymentMethod,
      comment: deal.comment ?? null,
      status: deal.status,
      buyerConfirmedAt: deal.buyerConfirmedAgo === undefined ? null : ago(deal.buyerConfirmedAgo),
      sellerConfirmedAt: deal.sellerConfirmedAgo === undefined ? null : ago(deal.sellerConfirmedAgo),
      completedAt: deal.completedAgo === undefined ? null : ago(deal.completedAgo),
      createdAt: ago(deal.createdAgo),
    })),
  })

  const dealEventRows = DEALS.flatMap((deal, dealIndex) =>
    deal.events.map((event, eventIndex) => ({
      id: `devt_${dealIndex}_${eventIndex}`,
      dealId: must(dealIds[dealIndex], 'deal id'),
      actorId: ownerUserId(event.actor === 'buyer' ? deal.buyer : deal.seller),
      fromStatus: event.from,
      toStatus: event.to,
      comment: event.comment ?? null,
      createdAt: ago(event.daysAgo, 12),
    })),
  )
  await db.dealEvent.createMany({ data: dealEventRows })

  // --- reviews --------------------------------------------------------------
  const reviewIds = REVIEWS.map((_, index) => `rev_${String(index).padStart(3, '0')}`)

  await db.review.createMany({
    data: REVIEWS.map((review, index) => {
      const deal = must(DEALS[review.deal], 'deal')
      const buyerToSeller = review.direction === 'BUYER_TO_SELLER'
      return {
        id: must(reviewIds[index], 'review id'),
        dealId: must(dealIds[review.deal], 'deal id'),
        authorCompanyId: companyId(buyerToSeller ? deal.buyer : deal.seller),
        targetCompanyId: companyId(buyerToSeller ? deal.seller : deal.buyer),
        direction: review.direction,
        overall: review.overall,
        criteria: json(review.criteria),
        comment: review.comment,
        status: 'PUBLISHED',
        createdAt: ago(review.createdAgo),
      }
    }),
  })

  const replyRows = REVIEWS.flatMap((review, index) =>
    review.reply
      ? [
          {
            id: `rvr_${index}`,
            reviewId: must(reviewIds[index], 'review id'),
            body: review.reply.body,
            createdAt: ago(review.reply.createdAgo),
          },
        ]
      : [],
  )
  await db.reviewReply.createMany({ data: replyRows })

  // --- favourites, saved searches, notifications ----------------------------
  await db.favorite.createMany({
    data: FAVORITES.map((favorite, index) => ({
      id: `fav_${index}`,
      userId: ownerUserId(favorite.user),
      productId: favorite.product ? productId(favorite.product) : null,
      companyId: favorite.company ? companyId(favorite.company) : null,
      createdAt: ago(favorite.createdAgo),
    })),
  })

  await db.savedSearch.createMany({
    data: SAVED_SEARCHES.map((search, index) => ({
      id: `sse_${index}`,
      userId: ownerUserId(search.user),
      name: search.name,
      query: json(search.query),
      target: search.target,
      notifyNew: search.notifyNew,
      notifyPriceDrop: search.notifyPriceDrop,
      lastNotifiedAt: ago(Math.max(1, Math.floor(search.createdAgo / 3))),
      createdAt: ago(search.createdAgo),
    })),
  })

  const resolveEntity = (entity: EntityRef): { entityType: string; entityId: string } => {
    switch (entity.type) {
      case 'PRODUCT':
        return { entityType: 'PRODUCT', entityId: productId(entity.ref) }
      case 'REQUEST':
        return { entityType: 'REQUEST', entityId: requestId(entity.ref) }
      case 'COMPANY':
        return { entityType: 'COMPANY', entityId: companyId(entity.ref) }
      case 'DEAL':
        return { entityType: 'DEAL', entityId: must(dealIds[entity.ref], 'deal id') }
    }
  }

  await db.notification.createMany({
    data: NOTIFICATIONS.map((notification, index) => {
      const entity = notification.entity ? resolveEntity(notification.entity) : null
      return {
        id: `ntf_${index}`,
        userId: ownerUserId(notification.user),
        type: notification.type,
        params: notification.params ? json(notification.params) : null,
        entityType: entity?.entityType ?? null,
        entityId: entity?.entityId ?? null,
        url: notification.url ?? null,
        readAt: notification.readAgo === undefined ? null : ago(notification.readAgo),
        createdAt: ago(notification.createdAgo, 14),
      }
    }),
  })

  // --- conversations --------------------------------------------------------
  const conversationRows: {
    id: string
    type: string
    productId: string | null
    requestId: string | null
    offerId: string | null
    dealId: string | null
    buyerCompanyId: string
    sellerCompanyId: string
    subject: string
    lastMessageAt: Date
    createdAt: Date
  }[] = []
  const participantRows: {
    id: string
    conversationId: string
    userId: string
    companyId: string
    lastReadAt: Date | null
  }[] = []
  const messageRows: {
    id: string
    conversationId: string
    senderUserId: string | null
    kind: string
    body: string
    params: string | null
    createdAt: Date
  }[] = []

  CONVERSATIONS.forEach((conversation, index) => {
    const id = `conv_${index}`
    const times = conversation.messages.map((message) =>
      at(-message.daysAgo, message.hour, message.minute ?? 0),
    )
    const lastMessageAt = must(
      times.reduce<Date | null>((latest, time) => (!latest || time > latest ? time : latest), null),
      'conversation without messages',
    )
    const firstMessageAt = must(times[0], 'conversation without messages')

    conversationRows.push({
      id,
      type: conversation.type,
      productId: conversation.product ? productId(conversation.product) : null,
      requestId: conversation.request ? requestId(conversation.request) : null,
      offerId: conversation.offer
        ? must(offerIdByPair.get(conversation.offer), `offer "${conversation.offer}"`)
        : null,
      dealId: conversation.deal === undefined ? null : must(dealIds[conversation.deal], 'deal id'),
      buyerCompanyId: companyId(conversation.buyer),
      sellerCompanyId: companyId(conversation.seller),
      subject: conversation.subject,
      lastMessageAt,
      createdAt: firstMessageAt,
    })

    participantRows.push(
      {
        id: `cpa_${index}_b`,
        conversationId: id,
        userId: ownerUserId(conversation.buyer),
        companyId: companyId(conversation.buyer),
        lastReadAt: lastMessageAt,
      },
      {
        id: `cpa_${index}_s`,
        conversationId: id,
        userId: ownerUserId(conversation.seller),
        companyId: companyId(conversation.seller),
        lastReadAt: firstMessageAt,
      },
    )

    conversation.messages.forEach((message, messageIndex) => {
      const sender =
        message.from === 'system'
          ? null
          : ownerUserId(message.from === 'buyer' ? conversation.buyer : conversation.seller)
      messageRows.push({
        id: `msg_${index}_${messageIndex}`,
        conversationId: id,
        senderUserId: sender,
        kind: message.from === 'system' ? 'SYSTEM' : 'USER',
        body: message.body,
        params: message.params ? json(message.params) : null,
        createdAt: must(times[messageIndex], 'message time'),
      })
    })
  })

  await db.conversation.createMany({ data: conversationRows })
  await db.conversationParticipant.createMany({ data: participantRows })
  await db.message.createMany({ data: messageRows })

  // --- complaints & moderation queue ----------------------------------------
  await db.complaint.createMany({
    data: COMPLAINTS.map((complaint, index) => {
      const entity = resolveEntity(complaint.entity)
      return {
        id: `cmp_${index}`,
        reporterUserId: ownerUserId(complaint.reporter),
        entityType: entity.entityType,
        entityId: entity.entityId,
        reason: complaint.reason,
        description: complaint.description,
        status: complaint.status,
        createdAt: ago(complaint.createdAgo, 15),
      }
    }),
  })

  await db.moderationTask.createMany({
    data: COMPLAINTS.map((complaint, index) => ({
      id: `mtk_${index}`,
      entityType: 'COMPLAINT',
      entityId: `cmp_${index}`,
      kind: 'COMPLAINT',
      status: 'OPEN',
      priority: complaint.priority,
      createdAt: ago(complaint.createdAgo, 15),
    })),
  })

  // --- ledger ---------------------------------------------------------------
  // Company.balanceBani is a cache of the last balanceAfterBani, so the chain is
  // built backwards from the balance the company should end up with.
  const listingDailyBani = must(DEFAULT_TARIFFS.LISTING_DAILY, 'tariff').priceBani
  const ledgerRows: {
    id: string
    companyId: string
    amountBani: number
    currency: string
    type: string
    balanceBeforeBani: number
    balanceAfterBani: number
    description: string
    entityType: string | null
    entityId: string | null
    idempotencyKey: string
    createdAt: Date
  }[] = []

  for (const key of LEDGER_SELLERS) {
    const company = must(COMPANY_BY_KEY.get(key), `unknown company "${key}"`)
    const activeListings = ACTIVE_PRODUCTS_BY_SELLER.get(key) ?? 0
    const dailyCharge = activeListings * listingDailyBani
    const topUpBani = company.balanceBani + dailyCharge * LEDGER_DAYS

    let balance = 0
    ledgerRows.push({
      id: `led_${key}_topup`,
      companyId: companyId(key),
      amountBani: topUpBani,
      currency: 'MDL',
      type: 'TOP_UP',
      balanceBeforeBani: balance,
      balanceAfterBani: balance + topUpBani,
      description: 'Пополнение баланса банковской картой',
      entityType: null,
      entityId: null,
      idempotencyKey: `seed:${key}:topup`,
      createdAt: ago(LEDGER_DAYS + 1, 11),
    })
    balance += topUpBani

    for (let day = LEDGER_DAYS; day >= 1; day -= 1) {
      ledgerRows.push({
        id: `led_${key}_day${day}`,
        companyId: companyId(key),
        amountBani: -dailyCharge,
        currency: 'MDL',
        type: 'LISTING_DAILY',
        balanceBeforeBani: balance,
        balanceAfterBani: balance - dailyCharge,
        description: `Списание за ${activeListings} активных объявлений`,
        entityType: 'COMPANY',
        entityId: companyId(key),
        idempotencyKey: `seed:${key}:listing:${day}`,
        createdAt: ago(day, 3),
      })
      balance -= dailyCharge
    }

    if (balance !== company.balanceBani) {
      throw new Error(`demo seed: ledger for "${key}" ends at ${balance}, expected ${company.balanceBani}`)
    }
  }
  await db.ledgerEntry.createMany({ data: ledgerRows })

  // --- platform configuration -----------------------------------------------
  const flagDescriptions: Record<string, string> = {
    BILLING_ENABLED: 'Списание за активные объявления и платные продвижения',
    PROMOTIONS_ENABLED: 'Платное продвижение объявлений',
    REQUIRE_MODERATION: 'Премодерация новых объявлений и заявок',
    PHONE_AUTH_ENABLED: 'Вход и регистрация по номеру телефона',
    REGISTRATION_OPEN: 'Открытая регистрация новых компаний',
    PUBLIC_REQUESTS_ENABLED: 'Публичный раздел закупочных заявок',
  }

  const flagRows = Object.entries(DEFAULT_FEATURE_FLAGS).map(([key, enabled]) => ({
    key,
    enabled,
    description: flagDescriptions[key] ?? null,
    payload: null,
  }))
  await db.featureFlag.createMany({ data: flagRows })

  const tariffRows = Object.entries(DEFAULT_TARIFFS).map(([key, tariff]) => ({
    key,
    priceBani: tariff.priceBani,
    unit: tariff.unit,
    isActive: true,
  }))
  await db.tariff.createMany({ data: tariffRows })

  // --- retail orders ----------------------------------------------------------
  //
  // Three consumer orders at different points in the flow, so the seller's «Заказы»
  // screen and the admin list are not empty on a fresh database.
  //
  // The lines are built from products that were just written, rather than from hand
  // written references, so this block cannot drift out of sync with the catalogue.
  // Totals are summed from the lines exactly as placeRetailOrder does — a seeded order
  // whose total disagreed with its own items would be a lie in the demo data.
  const retailSourceProducts = await db.product.findMany({
    where: { isRetail: true, status: 'ACTIVE' },
    select: {
      id: true,
      title: true,
      unit: true,
      priceBani: true,
      retailPriceBani: true,
      companyId: true,
    },
    orderBy: { title: 'asc' },
  })

  const retailByCompany = new Map<string, typeof retailSourceProducts>()
  for (const product of retailSourceProducts) {
    const bucket = retailByCompany.get(product.companyId) ?? []
    bucket.push(product)
    retailByCompany.set(product.companyId, bucket)
  }

  const retailShops = [...retailByCompany.entries()].filter(([, items]) => items.length >= 2)

  const RETAIL_ORDER_PLAN: readonly {
    status: string
    customerName: string
    customerPhone: string
    address: string
    note?: string
    quantities: readonly number[]
    daysAgo: number
    deliveryFeeBani: number
  }[] = [
    {
      status: 'NEW',
      customerName: 'Мария Цуркану',
      customerPhone: '+37379451207',
      address: 'Кишинёв, ул. Алба-Юлия 75, кв. 42, подъезд 3',
      note: 'Домофон не работает, позвоните на телефон.',
      quantities: [2, 1, 3],
      daysAgo: 0,
      deliveryFeeBani: 3_000,
    },
    {
      status: 'PREPARING',
      customerName: 'Andrei Cebotari',
      customerPhone: '+37368112349',
      address: 'Chișinău, str. Miorița 12, ap. 7',
      quantities: [1, 4],
      daysAgo: 1,
      deliveryFeeBani: 0,
    },
    {
      status: 'DELIVERED',
      customerName: 'Елена Морару',
      customerPhone: '+37360778142',
      address: 'Кишинёв, бул. Дачия 41/2, кв. 118',
      note: 'Оставить у консьержа.',
      quantities: [3, 2],
      daysAgo: 6,
      deliveryFeeBani: 3_000,
    },
  ]

  let retailOrderCount = 0
  let retailOrderItemCount = 0

  for (const [index, plan] of RETAIL_ORDER_PLAN.entries()) {
    const shop = retailShops[index % Math.max(1, retailShops.length)]
    if (!shop) continue

    const [shopCompanyId, shopProducts] = shop
    const lines = plan.quantities
      .map((quantity, lineIndex) => {
        const product = shopProducts[lineIndex % shopProducts.length]
        if (!product) return null
        const unitPriceBani = product.retailPriceBani ?? product.priceBani
        return {
          productId: product.id,
          title: product.title,
          unit: product.unit,
          quantity,
          unitPriceBani,
          totalBani: Math.round(quantity * unitPriceBani),
        }
      })
      .filter((line): line is NonNullable<typeof line> => line !== null)

    if (lines.length === 0) continue

    const itemsTotalBani = lines.reduce((sum, line) => sum + line.totalBani, 0)
    const placedAt = ago(plan.daysAgo)

    const order = await db.retailOrder.create({
      data: {
        number: `PMD-R-${placedAt.getFullYear()}-${String(index + 1).padStart(6, '0')}`,
        sellerCompanyId: shopCompanyId,
        customerName: plan.customerName,
        customerPhone: plan.customerPhone,
        deliveryAddress: plan.address,
        deliveryNote: plan.note ?? null,
        itemsTotalBani,
        deliveryFeeBani: plan.deliveryFeeBani,
        totalBani: itemsTotalBani + plan.deliveryFeeBani,
        paymentMethod: 'CASH',
        status: plan.status,
        createdAt: placedAt,
        confirmedAt: plan.status === 'NEW' ? null : placedAt,
        deliveredAt: plan.status === 'DELIVERED' ? ago(Math.max(0, plan.daysAgo - 1)) : null,
      },
      select: { id: true },
    })

    await db.retailOrderItem.createMany({
      data: lines.map((line) => ({ ...line, orderId: order.id })),
    })

    retailOrderCount += 1
    retailOrderItemCount += lines.length
  }

  return {
    users: userRows.length,
    companies: COMPANIES.length,
    companyMembers: COMPANIES.length,
    companyPhotos: companyPhotoRows.length,
    verificationBadges: badgeRows.length,
    products: productRows.length,
    productPhotos: productPhotoRows.length,
    priceTiers: priceTierRows.length,
    productAttributeValues: attributeValueRows.length,
    promotions: promotionRows.length,
    requests: REQUESTS.length,
    offers: OFFERS.length,
    deals: DEALS.length,
    dealEvents: dealEventRows.length,
    reviews: REVIEWS.length,
    reviewReplies: replyRows.length,
    favorites: FAVORITES.length,
    savedSearches: SAVED_SEARCHES.length,
    notifications: NOTIFICATIONS.length,
    conversations: conversationRows.length,
    conversationParticipants: participantRows.length,
    messages: messageRows.length,
    complaints: COMPLAINTS.length,
    moderationTasks: COMPLAINTS.length,
    ledgerEntries: ledgerRows.length,
    featureFlags: flagRows.length,
    tariffs: tariffRows.length,
    retailOrders: retailOrderCount,
    retailOrderItems: retailOrderItemCount,
  }
}

/** The four documented logins, echoed by prisma/seed.ts after a successful run. */
export const TEST_ACCOUNTS: readonly { email: string; role: string; note: string }[] = STAFF.map(
  (staff) => ({
    email: staff.email,
    role: staff.role,
    note:
      staff.key === 'buyer'
        ? 'покупатель — ресторан «La Plopi»'
        : staff.key === 'seller'
          ? 'поставщик — Agro Prim'
          : staff.key === 'moderator'
            ? 'модератор'
            : 'администратор (без 2FA)',
  }),
)

export const TEST_ACCOUNT_PASSWORD = TEST_PASSWORD
