# Product.md — Архитектура

> **Статус документа.** Описывает архитектуру целиком. То, что уже есть в репозитории,
> подтверждается ссылками на конкретные файлы. То, что спроектировано, но ещё пишется,
> помечено **`в разработке`**. Такие разделы описывают *намерение и контракт*, а не факт.

---

## Содержание

1. [Стек и обоснование выбора](#1-стек-и-обоснование-выбора)
2. [Структура каталогов](#2-структура-каталогов)
3. [Схема потока запроса](#3-схема-потока-запроса)
4. [Стратегия рендеринга](#4-стратегия-рендеринга)
5. [Слой доступа к данным](#5-слой-доступа-к-данным)
6. [Адаптеры и провайдеры](#6-адаптеры-и-провайдеры)
7. [Аутентификация и сессии](#7-аутентификация-и-сессии)
8. [Авторизация](#8-авторизация)
9. [Локализованная маршрутизация](#9-локализованная-маршрутизация)
10. [Денежная модель](#10-денежная-модель)
11. [Фоновые задачи](#11-фоновые-задачи)
12. [Кеширование и ревалидация](#12-кеширование-и-ревалидация)
13. [Как заменить поисковый движок](#13-как-заменить-поисковый-движок)
14. [Наблюдаемость и ошибки](#14-наблюдаемость-и-ошибки)

---

## 1. Стек и обоснование выбора

| Технология | Версия (`package.json`) | Почему именно она |
| --- | --- | --- |
| **Next.js App Router** | `14.2.18` | Публичный маркетплейс живёт с поиска: каталог, категории и карточки товаров должны отдаваться готовым HTML. App Router даёт серверные компоненты по умолчанию (данные не улетают в бандл), server actions вместо ручного REST-слоя и один и тот же код для SSR/SSG/ISR. |
| **TypeScript strict** | `5.6.3` | `strict: true` + `noUncheckedIndexedAccess` + `noImplicitOverride` + `noFallthroughCasesInSwitch` (`tsconfig.json`). Домен полон строковых кодов статусов; типы из `src/lib/constants.ts` превращают опечатку в ошибку компиляции. |
| **PostgreSQL** | 15+ (целевая) | Транзакции, `Serializable` для денег, полнотекст с `pg_trgm`/GIN, надёжные внешние ключи. Ничего экзотического не требуется — это осознанно. |
| **SQLite** | через тот же Prisma | Только для локальной разработки: `git clone && npm i && npm run db:push` без Docker и без БД в системе. |
| **Prisma** | `5.22.0` | Типобезопасный клиент, генерируемый из схемы; миграции; схема как единственный источник правды для домена. |
| **Tailwind CSS** | `3.4.15` | Дизайн-система задаётся токенами (CSS-переменные + `tailwind.config.ts`), а не «ещё одной» библиотекой компонентов. Нет рантайм-CSS-in-JS → нет лишнего JS. |
| **React Hook Form + Zod** | `7.53` / `3.23` | Формы здесь большие (карточка товара — 25+ полей). RHF не перерисовывает форму на каждый символ, Zod даёт одну схему на клиент и сервер. |
| **@aws-sdk/client-s3 + presigner** | `3.699` | S3-совместимое хранилище (AWS S3, MinIO, Cloudflare R2, Backblaze) + подписанные URL для приватных документов. |
| **nodemailer** | `6.9.16` | SMTP без привязки к конкретному сервису рассылок. |
| **lucide-react** | `0.462` | Единая, спокойная иконография в одном стиле; tree-shaking по иконкам. |
| **clsx + tailwind-merge** | — | `cn()` в `src/lib/utils.ts` — корректное слияние конфликтующих Tailwind-классов. |
| **date-fns** | `4.1.0` | Лёгкая работа с датами там, где `Intl` недостаточно. |
| **Vitest** | `2.1.8` | Быстрые unit/integration-тесты, тот же resolver, что у Vite (`vite-tsconfig-paths`). |
| **Playwright** | `1.49` | E2E по реальным сценариям в реальном браузере. |
| **ESLint + Prettier** | `8.57` / `3.4` | `eslint-config-next` + `eslint-config-prettier`, плагин сортировки Tailwind-классов. |
| **tsx** | `4.19` | Запуск TypeScript-скриптов (сид, крон) без отдельного шага сборки. |
| **Node.js** | `>= 20.11` (`engines`) | `node:crypto` со scrypt и всем нужным для TOTP; стабильный ESM. |

### Чего в стеке сознательно нет

| Не используем | Почему |
| --- | --- |
| Отдельный backend-фреймворк (Nest/Express) | Server actions + route handlers покрывают всё; второй рантайм = второй деплой и вторая модель авторизации |
| GraphQL | Один клиент — собственный фронтенд. Оверхед схемы и резолверов не окупается |
| NextAuth / Auth.js | Нужны сессии в БД с отзывом, TOTP для админа и привязка к компании. Своя реализация — ~400 строк и полный контроль (см. раздел 7) |
| Redis на старте | Ограничение частоты работает двухуровнево (память + таблица `RateLimitHit`). Redis — точка расширения, а не требование запуска |
| Elasticsearch | См. раздел 13 |
| CSS-in-JS | Рантайм-стоимость и несовместимость с серверными компонентами |
| Библиотека TOTP | Auth-примитив не должен приезжать транзитивной зависимостью; реализовано в `src/server/auth/totp.ts` |

---

## 2. Структура каталогов

```
product-md/
├── prisma/
│   ├── schema.prisma            # канонная схема (PostgreSQL) — редактируем ТОЛЬКО её
│   ├── schema.sqlite.prisma     # генерируется scripts/prisma.mjs, в .gitignore
│   ├── migrations/              # миграции PostgreSQL          [в разработке]
│   ├── seed.ts                  # сид: справочники + демо-данные [в разработке]
│   └── dev.db                   # локальная SQLite-база, в .gitignore
├── scripts/
│   ├── prisma.mjs               # обёртка над Prisma CLI с выбором провайдера
│   └── run-daily-billing.ts     # запуск ежедневного биллинга   [в разработке]
├── src/
│   ├── app/                     # маршруты App Router
│   │   ├── globals.css          # токены дизайн-системы и базовые слои
│   │   ├── [locale]/            # все публичные и кабинетные страницы [в разработке]
│   │   └── api/                 # route handlers (health, cron, вебхуки, загрузки) [в разработке]
│   ├── components/              # UI: ui/ примитивы, остальное — доменные блоки [в разработке]
│   ├── server/                  # ВСЁ, что не должно попасть в браузер
│   │   ├── db.ts                # singleton PrismaClient + transaction()
│   │   ├── crypto.ts            # AES-GCM, HMAC, хеши токенов, OTP
│   │   └── auth/                # password, session, guards, tokens, totp, rate-limit
│   ├── lib/                     # изоморфный код без побочных эффектов
│   │   ├── constants.ts         # доменные словари и типы
│   │   ├── money.ts             # бани, парсинг, форматирование, ценовые ступени
│   │   ├── normalize.ts         # нормализация текста, стемминг, опечатки, slug
│   │   ├── json.ts              # безопасные JSON-колонки
│   │   ├── utils.ts             # cn(), пагинация, день Europe/Chisinau
│   │   └── i18n/                # config, index, format, provider, messages/{ru,ro}
│   ├── env.ts                   # единственная точка чтения process.env, валидация Zod
│   └── middleware.ts            # только локали: редирект + rewrite
├── e2e/                         # Playwright-сценарии                [в разработке]
├── tests/                       # Vitest: unit/ и integration/       [в разработке]
├── docs/                        # эта документация
├── next.config.mjs              # заголовки безопасности, изображения, server actions
├── tailwind.config.ts           # токены → утилиты Tailwind
└── tsconfig.json                # strict, alias @/* → ./src/*
```

### Что где лежит — правила

| Каталог | Что кладём | Чего НЕ кладём |
| --- | --- | --- |
| `src/app/[locale]/` | Страницы, layout'ы, `loading.tsx`, `error.tsx`, `not-found.tsx`, локальные `actions.ts` | Бизнес-логику — она в `src/server/services` |
| `src/app/api/` | Route handlers: `/api/health`, `/api/cron/*`, вебхуки провайдеров, отдача приватных файлов | Всё, что можно сделать server action'ом |
| `src/components/ui/` | Примитивы без доменных знаний: `Button`, `Input`, `Select`, `Badge`, `Card`, `Dialog`, `Sheet` | Запросы к БД, знание о `Product` или `Offer` |
| `src/components/<домен>/` | Доменные блоки: `ProductCard`, `OfferCompareTable`, `RequestForm` | `import 'server-only'`-модули в клиентских файлах |
| `src/server/` | Всё, что содержит секреты или обращается к БД. Файлы начинаются с `import 'server-only'` | Реэкспорт в клиентские компоненты |
| `src/server/services/` | Бизнес-операции (`products`, `requests`, `offers`, `deals`, `ledger`, `billing`, `stats`, `search`) — **в разработке** | HTTP/React-специфику |
| `src/lib/` | Чистые функции, работающие и на сервере, и в браузере | `process.env`, Prisma, `next/headers` |
| `prisma/` | Схема, миграции, сид | Рантайм-код приложения |
| `scripts/` | Инструменты разработчика и операционные скрипты | Код, импортируемый приложением |
| `tests/` | `unit/` — чистые функции; `integration/` — сервисы против настоящей БД | Скриншотные UI-тесты (это к Playwright) |
| `e2e/` | Пользовательские сценарии целиком | Тесты внутренних функций |

`tsconfig.json` исключает `e2e` из основной компиляции — у Playwright свой прогон.

---

## 3. Схема потока запроса

```
                         ┌──────────────────────────────────────────┐
   Браузер               │  GET /ro/produse/oua-de-tara?page=2      │
   (пользователь)  ─────▶│  Cookie: NEXT_LOCALE=ro; pmd_session=…   │
                         └──────────────────────────────────────────┘
                                          │
                                          ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  src/middleware.ts            (Edge, БЕЗ доступа к БД)             │
        │  • пропускает /api, /_next, /uploads, статику, robots, sitemap     │
        │  • нет локали в URL → 307 на /<locale>/… (cookie → Accept-Language)│
        │  • есть локаль → rewrite localized → canonical:                    │
        │        /ro/produse/oua-de-tara  ⇒  /ro/products/oua-de-tara        │
        │  • ставит cookie NEXT_LOCALE (365 дней, sameSite=lax)             │
        │  ✗ никакой авторизации — Prisma на edge недоступна                 │
        └────────────────────────────────────────────────────────────────────┘
                                          │  (адресная строка не меняется)
                                          ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  App Router: src/app/[locale]/products/[slug]/page.tsx  (RSC)      │
        │                                                                    │
        │   getDictionary(locale)  ──▶  src/lib/i18n/messages/ro.ts          │
        │   getCurrentUser()       ──▶  src/server/auth/session.ts           │
        │        │                        cookie → sha256 → Session          │
        │        │                        React cache(): 1 запрос на request │
        │        ▼                                                           │
        │   requireX / assertX     ──▶  src/server/auth/guards.ts            │
        │        │                        роль + владение, всегда из БД      │
        │        ▼                                                           │
        │   сервис домена          ──▶  src/server/services/*.ts  [в разраб.]│
        │        │                                                           │
        │        ▼                                                           │
        │   db / transaction()     ──▶  src/server/db.ts → PrismaClient      │
        │                                 Serializable для денег (Postgres)  │
        └────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  Рендер: серверные компоненты + точечные клиентские островки       │
        │  I18nProvider отдаёт уже загруженный словарь клиентским блокам      │
        └────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  Ответ + заголовки из next.config.mjs                              │
        │  X-Content-Type-Options, X-Frame-Options, Referrer-Policy,         │
        │  Permissions-Policy, X-DNS-Prefetch-Control                        │
        └────────────────────────────────────────────────────────────────────┘


   МУТАЦИЯ (server action)                        ФОНОВАЯ ЗАДАЧА
   ─────────────────────────                      ────────────────────────────
   форма (RHF + Zod на клиенте)                   cron / systemd timer
        │                                              │
        ▼                                              ▼
   'use server' action                            POST /api/cron/daily-billing
        │  1. assertX()      ← права                   Authorization: Bearer $CRON_SECRET
        │  2. zod.parse()    ← ВАЛИДАЦИЯ ЗАНОВО             │  safeEqual() сравнение
        │  3. rate limit                                     ▼
        │  4. service → transaction()                  services/billing.ts
        │  5. AuditLog                                  • списание за активные объявления
        │  6. revalidatePath / revalidateTag            • idempotencyKey = companyId:день
        ▼                                              • автопауза при нуле
   результат + локализованная ошибка               • чистка сессий и токенов
```

---

## 4. Стратегия рендеринга

Правило по умолчанию: **серверный компонент**. Клиентский (`'use client'`) — только там,
где без состояния браузера не обойтись.

### Что рендерится на сервере (SEO-критичное)

| Маршрут (канонический) | Стратегия | Почему |
| --- | --- | --- |
| `/[locale]` — главная | SSR + кеш популярных категорий | Индексируется, меняется редко |
| `/[locale]/products` — каталог | SSR (динамика от query-параметров) | Фильтры в URL, каждая комбинация индексируема/шарится |
| `/[locale]/products/[slug]` — карточка товара | SSR + `revalidate` | Главная посадочная страница из поиска; цена должна быть свежей |
| `/[locale]/category/[slug]` | SSR + ISR | Стабильная структура, редкие изменения |
| `/[locale]/suppliers`, `/[locale]/suppliers/[slug]` | SSR | Профиль компании — важная поисковая страница |
| `/[locale]/requests`, `/[locale]/requests/[slug]` | SSR | Публичные заявки привлекают поставщиков из поиска |
| `/[locale]/pricing`, `/terms`, `/privacy`, `/rules`, `/help` | статика | Контент без данных |
| `sitemap.xml`, `robots.txt` | route handler | Middleware их специально пропускает |

Все страницы кабинета (`/dashboard/*`), чат, модерация и админка — **динамические,
`no-store`**, потому что зависят от сессии. Они не должны индексироваться и не должны
попадать ни в какой общий кеш.

### Где нужен клиент

| Компонент | Почему клиентский |
| --- | --- |
| Панель фильтров каталога | Мгновенная реакция, синхронизация с URL |
| Поисковая строка с подсказками | Дебаунс, клавиатурная навигация по списку |
| Мастер формы товара/заявки | Многошаговое состояние, зависимые поля, RHF |
| Загрузчик фотографий | Drag-and-drop, превью, прогресс |
| Чат | Прокрутка, оптимистичная отправка, опрос новых сообщений |
| Диалоги, bottom sheet, поповеры | Управление фокусом и Escape |
| Переключатель языка | Читает текущий `pathname` |
| Таблица сравнения предложений | Сортировка и выбор на клиенте |

Правила для клиентских компонентов:

* Данные приходят пропсами из серверного родителя — клиент не ходит в БД.
* Словарь передаётся через `I18nProvider` (`src/lib/i18n/provider.tsx`): загружается один
  раз на сервере, отсюда нет ни мигания непереведённого текста, ни дублей словаря в
  payload.
* Мутации — только server actions. Никаких «своих» fetch-эндпоинтов ради формы.
* `'use client'` ставится как можно **ниже** по дереву: клиентским должен быть виджет, а не
  страница.

---

## 5. Слой доступа к данным

### Singleton Prisma

`src/server/db.ts`:

```ts
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
    datasources: { db: { url: env.DATABASE_URL } },
  })

if (!isProduction) globalForPrisma.prisma = db
```

Кеш в `globalThis` нужен из-за hot reload: без него каждое сохранение файла открывало бы
новый пул соединений и рано или поздно упиралось бы в `max_connections`. В продакшене
кеш не ставится — процесс один.

### Хелпер транзакций

```ts
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (env.DATABASE_PROVIDER === 'postgresql') {
    return db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15_000 })
  }
  return db.$transaction(fn)
}
```

Почему обёртка, а не прямой вызов `$transaction`:

1. **Уровень изоляции задан в одном месте.** Движение денег (запись в `LedgerEntry` +
   обновление `Company.balanceBani`) и принятие предложения (акцепт одного + отказ
   остальным + создание `Deal`) не должны чередоваться. `Serializable` — самый простой
   корректный ответ.
2. **SQLite игнорирует опцию** (у него один писатель), поэтому она передаётся условно, а
   не всегда.
3. Появится потребность в ретрае при `40001 serialization_failure` — он добавится здесь и
   заработает везде.

Обязательно в транзакции: любая запись в реестр, акцепт предложения, смена статуса сделки
с сопутствующими записями, ежедневное списание, обработка вебхука платежа.

### Почему нет сырого SQL

Приложение работает на двух провайдерах, а `$queryRaw` пишется под конкретный диалект.
Плюс Prisma даёт типы, которые проверяются при сборке.

**Единственное задокументированное исключение — поиск.** Полнотекстовый путь под
PostgreSQL требует `to_tsvector`/`similarity`, чего в Prisma-запросах нет. Правила для
этого исключения:

* живёт только в `src/server/services/search.ts` (**в разработке**);
* выбирается по `env.DATABASE_PROVIDER`, SQLite-ветка остаётся на `contains`;
* пишется исключительно через `Prisma.sql` с параметрами — **никакой** конкатенации строк
  с пользовательским вводом;
* возвращает только `id` + `score`, сами записи догружаются обычным Prisma-запросом,
  чтобы типы и связи остались типобезопасными.

---

## 6. Адаптеры и провайдеры

Всё, что зависит от внешнего мира, спрятано за интерфейсом и выбирается переменной
окружения. Это позволяет: (а) запустить проект без единого внешнего сервиса, (б) заменить
поставщика услуги, не трогая доменный код.

### Таблица адаптеров

| Адаптер | Переменная | Значения | По умолчанию | Где реализация | Статус |
| --- | --- | --- | --- | --- | --- |
| Хранилище файлов | `STORAGE_DRIVER` | `local` \| `s3` | `local` | `src/server/storage/` | в разработке |
| Почта | `MAIL_DRIVER` | `console` \| `smtp` | `console` | `src/server/mail/` | в разработке |
| SMS | `SMS_DRIVER` | `mock` \| `http` | `mock` | `src/server/sms/` | в разработке |
| Платежи | `PAYMENT_DRIVER` | `mock` \| `maib` \| `victoriabank` \| `paynet` \| `mia` | `mock` | `src/server/payments/` | в разработке |
| Поиск | — (по `DATABASE_PROVIDER`) | SQL (Postgres FTS / SQLite LIKE) | SQL | `src/server/services/search.ts` | в разработке |
| Отчёт об ошибках | `SENTRY_DSN` | пусто = console, иначе Sentry | console | `src/server/observability/` | в разработке |
| Ограничение частоты | — | память + таблица `RateLimitHit` | оба | `src/server/auth/rate-limit.ts` | ✅ готово |

Наборы значений — не выдумка документа: они перечислены в Zod-схеме `src/env.ts`, и любое
другое значение обрушит приложение на старте с внятным сообщением.

> **Расхождение, о котором стоит знать:** `.env.example` в комментарии перечисляет для SMS
> «реальные провайдеры», но `src/env.ts` допускает ровно два значения — `mock` и `http`.
> Авторитетен `src/env.ts`. Конкретный провайдер настраивается внутри `http`-драйвера через
> `SMS_API_KEY` и `SMS_SENDER`.

### Контракты

```ts
// src/server/storage/types.ts                                    [в разработке]
export interface StorageAdapter {
  /** Кладёт объект и возвращает сгенерированный ключ. Имя от пользователя не используется. */
  put(input: {
    body: Buffer | Uint8Array
    contentType: string
    scope: 'public' | 'private'
    prefix: string           // 'products' | 'companies' | 'documents' | 'messages'
  }): Promise<{ key: string; size: number }>

  /** Публичный URL. Только для scope: 'public'. */
  publicUrl(key: string): string

  /** Короткоживущая подписанная ссылка. Единственный путь к приватным объектам. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>

  delete(key: string): Promise<void>
}

// src/server/mail/types.ts
export interface MailAdapter {
  send(input: { to: string; subject: string; html: string; text: string }): Promise<void>
}

// src/server/sms/types.ts
export interface SmsAdapter {
  send(input: { to: string; text: string }): Promise<void>
}

// src/server/payments/types.ts
export interface PaymentAdapter {
  readonly name: string
  /** Создаёт платёж и возвращает URL, куда редиректить плательщика. */
  createCheckout(input: {
    paymentId: string
    amountBani: number
    currency: string
    returnUrl: string
    description: string
  }): Promise<{ redirectUrl: string; providerRef: string }>

  /** Проверяет подпись вебхука. Возвращает null, если подпись неверна. */
  parseWebhook(raw: string, headers: Headers): {
    externalId: string
    providerRef: string
    status: 'SUCCEEDED' | 'FAILED' | 'REFUNDED'
    amountBani: number
  } | null
}
```

### Что делает разработчик, чтобы подключить настоящий адаптер

**Хранилище S3 / MinIO / R2:**

1. `STORAGE_DRIVER="s3"` в `.env`.
2. Заполнить `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`,
   `S3_FORCE_PATH_STYLE` (`true` для MinIO, `false` для AWS).
   Проверка обязательности уже написана: `superRefine` в `src/env.ts` не даст стартовать
   без четырёх ключевых значений.
3. Приватный бакет закрыть полностью: никакого public-read, доступ только через
   `signedUrl()`.
4. Публичному бакету выдать CDN-домен и указать его в `S3_PUBLIC_BASE_URL`.
5. Настроить CORS публичного бакета на `APP_URL`.
6. **Доменный код не меняется** — он работает с `StorageAdapter`.

**SMTP:**

1. `MAIL_DRIVER="smtp"`, заполнить `SMTP_HOST` (обязателен — проверяется в `env.ts`),
   `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`.
2. Настроить SPF, DKIM и DMARC для домена отправителя — иначе письма о подтверждении
   уйдут в спам, и регистрация просто перестанет работать.

**SMS:**

1. `SMS_DRIVER="http"`, задать `SMS_API_KEY` и `SMS_SENDER`.
2. Реализовать вызов конкретного провайдера в `src/server/sms/http.ts`.
3. Держать таймаут и обязательно писать результат в `NotificationDelivery` — SMS платные,
   и «отправилось или нет» должно быть видно.

**Платежи (maib / victoriabank / paynet / MIA):**

1. Получить у банка мерчант-идентификатор и ключи, положить в
   `MAIB_MERCHANT_ID` / `MAIB_PRIVATE_KEY` / `VICTORIABANK_*` / `PAYNET_*`.
2. `PAYMENT_DRIVER="maib"` (или другой).
3. Реализовать `createCheckout` и `parseWebhook` в `src/server/payments/<провайдер>.ts`.
4. Указать банку URL вебхука; секрет подписи — `PAYMENT_WEBHOOK_SECRET`.
5. Обработчик вебхука обязан: сохранить сырое тело в `WebhookEvent` **до** обработки,
   проверить подпись, отбросить дубль по `@@unique([provider, externalId])`, начислить
   баланс через `LedgerEntry` с `idempotencyKey`.
6. Провести тестовый платёж в песочнице банка и проверить сценарии: успех, отказ,
   повторный вебхук, вебхук с испорченной подписью.

**Отчёт об ошибках:** заполнить `SENTRY_DSN` — пустое значение оставляет консольный
репортер; интерфейс `captureException(error, context)` один и тот же.

---

## 7. Аутентификация и сессии

### Что реализовано

| Файл | Содержимое |
| --- | --- |
| `src/server/auth/password.ts` | scrypt: N=16384, r=8, p=1, ключ 64 байта, соль 16 байт. Формат `scrypt$N$r$p$<salt>$<hash>` — параметры внутри строки, поэтому их можно поднять позже, не ломая старые хеши |
| `src/server/auth/session.ts` | Создание/уничтожение/отзыв сессий, `getCurrentUser()` в `cache()` |
| `src/server/auth/tokens.ts` | Одноразовые токены: ссылки и OTP, TTL по типу, сгорание попыток |
| `src/server/auth/totp.ts` | TOTP по RFC 6238 на `node:crypto` |
| `src/server/auth/rate-limit.ts` | Двухуровневый лимитер |
| `src/server/crypto.ts` | AES-256-GCM, HMAC, хеширование токенов, генерация OTP без modulo-bias |

### Почему сессии в БД, а не JWT

Cookie `pmd_session` содержит непрозрачный случайный токен (32 байта, base64url). В базе
лежит **только** `sha256(token + APP_SECRET)`.

| Требование | Сессии в БД | Самодостаточный JWT |
| --- | --- | --- |
| «Выйти на всех устройствах» | `updateMany → revokedAt` | нельзя без списка отзыва |
| Заблокировать пользователя посреди сессии | следующий запрос вернёт `null` | токен живёт до истечения |
| Показать активные устройства (UA, IP, дата) | есть в `Session` | нет данных |
| Смена роли применяется сразу | да | только после перевыпуска |
| Утечка дампа БД | хеши бесполезны | секрет подписи компрометирует всё |
| Стоимость | один индексированный запрос, дедуплицируется `cache()` | ноль запросов |

Список отзыва для JWT — это и есть таблица сессий, только с лишним слоем. Поэтому выбран
прямой вариант.

Параметры cookie (`src/server/auth/session.ts`): `httpOnly: true`, `sameSite: 'lax'`,
`secure` в продакшене, `path: '/'`, `maxAge = SESSION_TTL_DAYS * 86400`.

`getCurrentUser()` обёрнут в `cache()` из React: layout, страница и три вложенных
серверных компонента могут вызывать его независимо, а запрос выполнится один раз за
HTTP-запрос. Возвращаемый `SessionUser` уже содержит связку с компанией (`companyId`,
`isBuyer`, `isSeller`, `companyStatus`), чтобы гардам не приходилось делать второй запрос.

Сессия считается недействительной, если: токена нет, записи нет, `revokedAt` заполнен,
`expiresAt` в прошлом, пользователь не `ACTIVE` или у него стоит `deletedAt`.

---

## 8. Авторизация

Единственное место — `src/server/auth/guards.ts`.

### Правило номер один

> Роль, идентификатор компании, «я владелец» и любой другой признак прав, пришедший из
> формы, query-параметра или заголовка, **игнорируются**. Каждый гард заново читает сессию
> из БД и заново сверяет владение со строкой, которую собирается изменить.

### Два семейства

| Семейство | Для чего | Поведение при отказе |
| --- | --- | --- |
| `require*` | Страницы (RSC) | `redirect()` на осмысленную страницу или `notFound()` |
| `assert*` | Server actions | `throw new AuthorizationError(code)` |

`AuthorizationError.code` ∈ `unauthorized | forbidden | notFound | companyRequired` —
обёртка server action переводит его в локализованное сообщение (`t.errors.*`), а не
показывает стек.

### Лестница гардов

```
requireUser        → нет сессии → /<locale>/login?next=<returnTo>
  requireCompany   → нет компании → /<locale>/onboarding
    requireSeller  → не продавец  → /<locale>/dashboard/settings
    requireBuyer   → не покупатель → /<locale>/dashboard/settings
requireModerator   → не MODERATOR и не ADMIN → notFound()
requireAdmin       → не ADMIN → notFound(); ADMIN без 2FA → /<locale>/settings?setup2fa=1
```

Модератор и админ получают `notFound()`, а не `403`: страница админки не должна
подтверждать своё существование постороннему.

### Проверки владения

| Функция | Проверяет | Особенность |
| --- | --- | --- |
| `assertOwnsProduct(id)` | `Product.companyId === user.companyId` | Модератор/админ проходят, но проверка аутентификации всё равно обязательна; удалённый товар → `notFound` |
| `assertOwnsRequest(id)` | `PurchaseRequest.companyId === user.companyId` | То же |
| `assertDealParticipant(id)` | компания — покупатель **или** продавец сделки | Возвращает `side: 'buyer' \| 'seller'`, чтобы вызывающий не гадал |
| `assertConversationParticipant(id)` | есть строка `ConversationParticipant` | Посторонний не читает переписку |

`assertCompany()` дополнительно отклоняет компанию со статусом `BLOCKED`.

### Инвариант закрытых предложений на уровне архитектуры

Чтения `Offer` не существует ни на одном публичном пути. Доступ идёт только через
`src/server/services/offers.ts` (**в разработке**), где ровно два разрешённых случая:

1. `offer.sellerCompanyId === user.companyId` — своё предложение;
2. `offer.request.companyId === user.companyId` — покупатель, владелец заявки.

Всё остальное — `forbidden`. Это требование безопасности; ему посвящён раздел в
`docs/SECURITY.md` и интеграционный тест `tests/integration/offer-privacy.test.ts`
(**в разработке**), упомянутый прямо в комментарии к модели.

---

## 9. Локализованная маршрутизация

### Идея

URL переводится целиком, а не префиксуется: `/ru/products` и `/ro/produse` — одна и та же
страница. При этом в `src/app/[locale]/` существует **одна** папка `products`.

### Карта сегментов

`ROUTE_SEGMENTS` в `src/lib/i18n/config.ts` — 30+ записей вида
`products: { ru: 'products', ro: 'produse' }`. Примеры:

| Канонический | `ru` | `ro` |
| --- | --- | --- |
| `products` | `products` | `produse` |
| `category` | `category` | `categorie` |
| `suppliers` | `suppliers` | `furnizori` |
| `requests` | `requests` | `cereri` |
| `offers` | `offers` | `oferte` |
| `deals` | `deals` | `tranzactii` |
| `dashboard` | `dashboard` | `cabinet` |
| `balance` | `balance` | `balanta` |
| `pricing` | `pricing` | `tarife` |
| `verification` | `verification` | `verificare` |
| `login` / `register` | `login` / `register` | `autentificare` / `inregistrare` |

Тип: `satisfies Record<string, Record<Locale, string>>` — добавить сегмент и забыть один
из языков нельзя, это ошибка компиляции.

### Механика

```
1. /catalog                     → нет локали
   cookie NEXT_LOCALE? иначе negotiateLocale(Accept-Language)
   → 307 Redirect на /ru/catalog, cookie ставится на 365 дней

2. /ro/produse/oua-de-tara      → локаль есть
   toCanonicalSegment('produse', 'ro') = 'products'
   'oua-de-tara' не найден в карте → проходит как есть (это slug)
   → rewrite на /ro/products/oua-de-tara
   Адресная строка остаётся румынской, рендерит src/app/[locale]/products/[slug]

3. /ru/products                 → изменений нет → NextResponse.next()
```

Обратное направление — `localePath(locale, ...segments)`:
`localePath('ro', 'products')` → `/ro/produse`. Хардкодить пути в ссылках запрещено.

Переключатель языка использует `switchLocalePath(pathname, from, to)`: пользователь
остаётся на той же странице, а не улетает на главную.

### Что middleware не делает

* **Не авторизует.** Edge-рантайм не имеет Prisma; проверка могла бы опираться только на
  непроверенную cookie. Комментарий об этом стоит прямо в `src/middleware.ts`. Права
  проверяются в серверных компонентах через гарды.
* **Не трогает** `/api/*`, `/_next/*`, `/uploads/*`, `robots.txt`, `sitemap.xml`,
  `favicon.ico` и статические файлы (регулярка `PUBLIC_FILE`).

---

## 10. Денежная модель

### Целые бани

`src/lib/money.ts`: `BANI_PER_MDL = 100`. Все денежные поля схемы — `Int` c суффиксом
`Bani` (`priceBani`, `totalBani`, `balanceBani`, `amountBani`, `minOrderBani`,
`deliveryPriceBani`).

Причина в комментарии файла: `0.1 + 0.2 !== 0.3`. На маркетплейсе, где поставщик котирует
95,50 MDL/кг на 3 тонны, ошибка округления — не теория. Количество при этом дробное
(2,5 кг), поэтому единственное место, где float встречается с деньгами —
`lineTotalBani(quantity, unitPriceBani)`, и оно немедленно округляет обратно к целому.

Полезное:

| Функция | Назначение |
| --- | --- |
| `parseAmountToBani('95,50')` | Принимает и точку, и запятую (румынская раскладка), строгая регулярка, `null` на мусор |
| `formatMoney(bani, locale)` | `Intl` с `ru-MD` / `ro-MD`, неразрывный пробел перед `MDL`, копейки скрываются, если сумма целая |
| `resolveTierPriceBani(qty, base, tiers)` | Оптовая лестница: побеждает наибольшая подходящая нижняя граница, пересекающиеся диапазоны деградируют предсказуемо |
| `tierDiscountPercent(base, tier)` | Процент для бейджа «−13 %» |

### Реестр только на добавление

`LedgerEntry` — append-only. Правки и удаления запрещены; исправление ошибки — это новая
запись типа `ADJUSTMENT`.

Каждая строка содержит:

* `amountBani` — со знаком: плюс кредитует, минус дебетует;
* `type` — `TOP_UP | LISTING_DAILY | PROMOTION | REFUND | BONUS | ADJUSTMENT`;
* `balanceBeforeBani` / `balanceAfterBani` — снимки, по которым можно проверить цепочку;
* `entityType` / `entityId` — на что списали;
* `idempotencyKey` — **уникальный индекс**.

`Company.balanceBani` — кеш последнего `balanceAfterBani`. Он пишется **только** внутри
той же транзакции, что добавляет строку реестра. Расхождение кеша и суммы реестра — это
инцидент, а не «нормальная рассинхронизация» (см. чек-лист в `docs/SECURITY.md`).

### Ключи идемпотентности

Ровно то, что делает ежедневное списание безопасным для повторного запуска:

| Операция | Ключ |
| --- | --- |
| Ежедневное списание | `listing-daily:<companyId>:<YYYY-MM-DD>` (день по `chisinauDayKey()`) |
| Пополнение | `payment:<paymentId>` |
| Покупка продвижения | `promotion:<promotionId>` |
| Возврат | `refund:<paymentId>` |
| Ручная корректировка | `adjustment:<cuid>` |

Крон упал на середине и его перезапустили — вторая вставка нарушит уникальный индекс, и
списание не задвоится.

`Payment.idempotencyKey` и `WebhookEvent.@@unique([provider, externalId])` дают ту же
защиту на стороне платежей: повторно доставленный вебхук распознаётся как дубль.

---

## 11. Фоновые задачи

### Ежедневный биллинг

Что делает (**в разработке**, контракт зафиксирован):

1. Берёт компании с активными объявлениями (`Product.status = 'ACTIVE'`,
   `deletedAt = null`).
2. Пропускает тех, у кого `trialEndsAt` в будущем.
3. Считает `количество активных объявлений × LISTING_DAILY_PRICE_BANI` (или значение
   `Tariff['LISTING_DAILY']`, если админ его переопределил).
4. В одной транзакции: добавляет `LedgerEntry` типа `LISTING_DAILY` с
   `idempotencyKey = listing-daily:<companyId>:<день>` и обновляет `balanceBani`.
5. Если средств не хватает — ставит объявлениям `status = 'PAUSED'`,
   `pausedForBalance = true` и отправляет уведомление.
6. Если баланс упал ниже `LOW_BALANCE_THRESHOLD_BANI` — уведомление `LOW_BALANCE` с
   оценкой «хватит на N дней».
7. Если баланс пополнили — снимает паузу с объявлений, у которых
   `pausedForBalance = true`.

Идемпотентность обязательна: задача проектируется под «запустили дважды — ничего не
изменилось».

### Задачи-подметальщики

| Задача | Что делает | Есть ли код |
| --- | --- | --- |
| Истечение объявлений | `ACTIVE` + `expiresAt < now` → `EXPIRED` | в разработке |
| Истечение заявок | `offersDeadlineAt < now` → `EXPIRED` | в разработке |
| Истечение предложений | `validUntil < now` → `EXPIRED` | в разработке |
| Истечение продвижений | `Promotion.endsAt < now` → снять денормализованные флаги с `Product` | в разработке |
| Документы на исходе | `Document.expiresAt` близко → уведомление + `expiryNotifiedAt` | в разработке |
| Чистка сессий | `pruneExpiredSessions()` | ✅ есть в `session.ts` |
| Чистка токенов | `pruneExpiredTokens()` (старше 7 дней после истечения) | ✅ есть в `tokens.ts` |
| Сохранённые поиски | новые совпадения → уведомление, `lastNotifiedAt` | в разработке |
| Пересчёт агрегатов | рейтинг, число сделок, среднее время ответа | в разработке |

### Два способа запуска

**1. Локально / на сервере — через npm-скрипт:**

```bash
npm run cron:daily         # tsx scripts/run-daily-billing.ts   [скрипт в разработке]
```

crontab на сервере (03:00 по Кишинёву):

```cron
0 3 * * *  cd /srv/product-md && /usr/bin/npm run cron:daily >> /var/log/product-md-cron.log 2>&1
```

**2. В контейнере/serverless — через защищённый route handler:**

```
POST /api/cron/daily-billing
Authorization: Bearer $CRON_SECRET
```

Требования к обработчику (**в разработке**):

* сравнение секрета через `safeEqual()` из `src/server/crypto.ts` — константное время;
* без секрета — `401`, без подробностей;
* `export const dynamic = 'force-dynamic'` и `runtime = 'nodejs'`;
* ответ — JSON-сводка (сколько компаний обработано, сколько списано, сколько
  приостановлено), чтобы внешний планировщик мог алертить;
* `CRON_SECRET` валидируется в `src/env.ts` (минимум 16 символов) и в продакшене не может
  быть примерным значением.

Пример вызова:

```bash
curl -X POST https://product.md/api/cron/daily-billing \
     -H "Authorization: Bearer $CRON_SECRET"
```

---

## 12. Кеширование и ревалидация

### Уровни

| Уровень | Что кешируется | Инвалидация |
| --- | --- | --- |
| React `cache()` | `getCurrentUser()` и подобные — в пределах одного запроса | автоматически |
| Full Route Cache | Статические публичные страницы | ревалидация по времени или тегу |
| Data Cache (`unstable_cache`) | Дерево категорий, справочники районов/населённых пунктов, feature-флаги, тарифы | по тегу |
| `revalidatePath` / `revalidateTag` | После мутаций | явно в server action |
| CDN / браузер | Иммутабельные ассеты и изображения | хеш в имени файла |

### Теги

Схема тегов (**в разработке** вместе со страницами):

| Тег | Что покрывает | Кто сбрасывает |
| --- | --- | --- |
| `categories` | Дерево категорий, меню, фасеты | Админ-редактор категорий |
| `product:<id>` | Карточка товара | Редактирование/модерация товара |
| `company:<slug>` | Страница компании | Профиль, отзывы, бейджи |
| `request:<id>` | Страница заявки | Изменения заявки, новое предложение |
| `flags` | Feature-флаги и тарифы | Админ-настройки |
| `geo` | Районы и населённые пункты | Сид/админ |

### Что не кешируется никогда

Кабинет, чат, предложения, сделки, баланс, модерация, админка. Все они читают сессию,
следовательно `dynamic = 'force-dynamic'` и `Cache-Control: no-store`. Ответ с
предложением конкурента, попавший в общий кеш, — это утечка, а не проблема
производительности.

### Ревалидация по времени

| Страница | `revalidate` |
| --- | --- |
| Главная | 300 с |
| Каталог без фильтров | 120 с |
| Страница категории | 300 с |
| Карточка товара | 60 с + точечный сброс по тегу |
| Список поставщиков | 300 с |
| Статические (тарифы, правила, помощь) | 3600 с |

---

## 13. Как заменить поисковый движок

### Что есть сейчас

Поиск строится вокруг денормализованной колонки `searchText`, которая есть и у `Product`,
и у `PurchaseRequest`. В неё при записи складываются: нормализованное название, синонимы
категории, названия категории на обоих языках, ключевые атрибуты.

Нормализация — `src/lib/normalize.ts`:

* `normalize()` — нижний регистр, свёртка диакритики (включая cedilla-варианты `ş`/`ţ`,
  которые выдают Windows-раскладки), удаление пунктуации, схлопывание пробелов. Кириллица
  **не** транслитерируется: `с` и `c` не должны склеиваться.
* `stem()` — грубый стеммер RU/RO. Не лингвистически корректный — намеренно: его задача
  свести «помидоры»/«помидор» и «rosii»/«rosie» к одному токену.
* `editDistance()` — Damerau-Levenshtein с ранним выходом; `isFuzzyMatch()` — порог,
  зависящий от длины слова (≤4 символов — 1 ошибка, ≤7 — 2, дальше — 3).
* `slugify()` — URL-безопасный slug с транслитерацией кириллицы.

Поверх этого — расширение запроса по `CategorySynonym` (у синонима есть `weight` и флаг
`isMisspelling`).

### Интерфейс, который делает замену возможной

```ts
// src/server/services/search.ts                                  [в разработке]
export interface SearchEngine {
  searchProducts(params: ProductSearchParams): Promise<SearchResult<string>>
  searchRequests(params: RequestSearchParams): Promise<SearchResult<string>>
  suggest(query: string, locale: Locale): Promise<Suggestion[]>
  /** Вызывается после записи товара/заявки. Для SQL-движка — пересбор searchText. */
  index(entity: 'product' | 'request', id: string): Promise<void>
  remove(entity: 'product' | 'request', id: string): Promise<void>
}

export interface SearchResult<T> {
  ids: T[]          // только идентификаторы + порядок
  total: number
  facets?: Record<string, { value: string; count: number }[]>
}
```

Ключевое решение: движок возвращает **идентификаторы и порядок**, а не сущности. Данные
догружает Prisma. Поэтому смена движка не задевает ни типы, ни связи, ни рендер.

### Когда мигрировать

Не раньше, чем сработает хотя бы одно:

| Триггер | Порог |
| --- | --- |
| Объём | > 100 000 активных объявлений |
| Задержка | p95 поискового запроса > 300 мс при правильных индексах |
| Функциональность | Нужны фасеты с точными счётчиками по 10+ измерениям одновременно |
| Функциональность | Нужны синонимы/правила ранжирования, редактируемые без деплоя |
| Нагрузка | Поиск начинает мешать транзакционной нагрузке основной БД |

До этого добавление GIN + `pg_trgm` индекса (см. `docs/DATABASE.md`) дешевле и проще, чем
второй сервис в инфраструктуре.

### Порядок миграции (например, на Typesense)

1. Реализовать `src/server/services/search/typesense.ts` — тот же `SearchEngine`.
2. Добавить `SEARCH_DRIVER` в `src/env.ts` (`sql` | `typesense`) со значением `sql` по
   умолчанию, чтобы ничего не сломалось у тех, кто не настраивал.
3. Описать схему коллекции: поля `id`, `title`, `searchText`, `categoryPath`, `districtId`,
   `priceBani`, `status`, `publishedAt`, `ratingAvg`, `isHighlighted`, `bumpedAt`.
4. Написать скрипт первичной заливки: `scripts/reindex-search.ts` — батчами по 500.
5. Держать индекс актуальным: вызывать `index()`/`remove()` из сервисов записи; на случай
   рассинхронизации — ночная сверка.
6. Выкатывать по флагу: `SEARCH_DRIVER=typesense` сначала на staging, метрики сравниваются
   с SQL-путём на одинаковых запросах из `SearchQueryLog`.
7. Обязательное условие: **SQL-путь остаётся рабочим**. Разработчик должен по-прежнему
   поднимать проект без Typesense.

---

## 14. Наблюдаемость и ошибки

| Аспект | Как сделано / планируется |
| --- | --- |
| Уровень логов | `LOG_LEVEL` (`debug \| info \| warn \| error`), по умолчанию `info` |
| Логи Prisma | `['error']` в продакшене, `['error','warn']` в разработке (`src/server/db.ts`) |
| Отчёт об ошибках | Адаптер: пустой `SENTRY_DSN` → консоль, заполненный → Sentry (**в разработке**) |
| Health-check | `GET /api/health` — проверка `SELECT 1` и версия сборки (**в разработке**) |
| Журнал аудита | `AuditLog`: актор, действие, тип и id сущности, снимки «до/после», причина, IP |
| Доставки уведомлений | `NotificationDelivery` — статус, ошибка, время отправки; видно и в UI, и в поддержке |
| Что нельзя логировать | Пароли, токены, содержимое документов, тела предложений. В логи попадают идентификаторы, не значения |

---

## Связанные документы

| Документ | О чём |
| --- | --- |
| [PRD.md](./PRD.md) | Требования к продукту, роли, сценарии, тарифы |
| [DATABASE.md](./DATABASE.md) | Модель данных, индексы, поиск, миграции |
| [SECURITY.md](./SECURITY.md) | Модель угроз и защитные меры |
| [ROADMAP.md](./ROADMAP.md) | Этапы поставки |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Токены и компоненты интерфейса |

---

## Приложение: корневой layout и статус 404

`src/app/[locale]/layout.tsx` — это **корневой** layout: именно он рендерит `<html>` и
`<body>`. Файла `src/app/layout.tsx` намеренно нет.

**Почему так.** Layout выше сегмента `[locale]` не может прочитать локаль из параметров,
поэтому он вынужден был бы зашить один язык в `<html lang="…">`. Для румынской половины
аудитории это означало бы неверный `lang` на каждой странице: скринридер выбирает не тот
голос, браузер — не те правила переносов, поисковик — не тот язык документа.

**Чем платим.** У приложения нет корневой границы `not-found`. Из-за этого `notFound()`,
вызванный на странице, разрешается вложенным `[locale]/not-found.tsx` **внутри уже
сматченного маршрута**, и Next отвечает `200`, а не `404`. Проверено на `next build`:
несуществующий слаг товара или категории отдаёт корректный интерфейс «не найдено», но со
статусом 200; полностью незнакомый путь при этом отдаёт честный 404.

**Как это компенсировано.** Каждая страница, которая может вызвать `notFound()`, в
`generateMetadata` возвращает `robots: { index: false, follow: false }` для случая
«объект не найден». Поэтому такие URL не попадают в индекс, даже отвечая 200. Покрытие
зафиксировано тестом `e2e/catalog.spec.ts` — он проверяет и интерфейс, и `noindex`.

**Альтернатива, если статус станет важнее.** Поднять layout в `src/app/layout.tsx` и
передавать локаль из middleware заголовком запроса, читая его через `headers()`. Это
вернёт честный 404, но переведёт все страницы в динамический рендеринг: обращение к
`headers()` в корневом layout отключает статическую генерацию для всего дерева. На момент
MVP правильный `lang` на каждой странице оценён выше, чем статус-код на несуществующих
адресах.
