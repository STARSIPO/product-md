# Product.md — Модель данных

> **Статус документа.** Схема `prisma/schema.prisma` существует целиком и является
> источником правды для всего, что здесь написано. Разделы про сервисы, миграции и сид
> помечены **`в разработке`** там, где соответствующих файлов ещё нет в репозитории.

---

## Содержание

1. [Контракт переносимости PostgreSQL ↔ SQLite](#1-контракт-переносимости-postgresql--sqlite)
2. [Обзор сущностей по доменам](#2-обзор-сущностей-по-доменам)
3. [Текстовое ER-описание](#3-текстовое-er-описание)
4. [Заметки по ключевым моделям](#4-заметки-по-ключевым-моделям)
5. [Стратегия индексирования](#5-стратегия-индексирования)
6. [Реализация поиска](#6-реализация-поиска)
7. [Инвариант закрытых предложений](#7-инвариант-закрытых-предложений)
8. [Представление денег](#8-представление-денег)
9. [Работа с миграциями](#9-работа-с-миграциями)
10. [Сидинг](#10-сидинг)

---

## 1. Контракт переносимости PostgreSQL ↔ SQLite

### Зачем два провайдера

* **PostgreSQL** — продакшен и цель миграций. Всё, что связано с деньгами, требует
  настоящих транзакций и уровня `Serializable`.
* **SQLite** — только разработка. Цель: `git clone` → `npm install` → `npm run db:push` →
  `npm run dev`, без Docker и без установленной СУБД. Новый разработчик подключается за
  минуты, а не за полдня.

### Почему схема ограничена общим подмножеством

Prisma **не принимает** `env()` в поле `datasource.provider`. Значит, одним файлом два
провайдера не описать. Решение: `prisma/schema.prisma` остаётся канонной (PostgreSQL), а
SQLite-вариант выводится скриптом. Чтобы этот вывод оставался корректным, схема
использует только то, что понимают оба движка. Ограничения перечислены в шапке самого
файла схемы:

| Запрет | Что вместо | Почему |
| --- | --- | --- |
| **Нет нативных enum** | `String` + `const`-кортежи в `src/lib/constants.ts` + валидация Zod | SQLite не имеет `CREATE TYPE`. Добавление значения в Postgres-enum ещё и требует миграции; строка + TypeScript-union даёт ту же строгость при сборке и гибкость в рантайме |
| **Нет колонок `Json`** | `String` с JSON внутри, чтение через `src/lib/json.ts` | Тип `Json` в Prisma недоступен на SQLite. Хелперы `decodeJson`/`decodeStringArray` никогда не бросают исключение — при испорченных данных возвращают fallback |
| **Нет скалярных списков (`String[]`)** | Либо join-таблица, либо JSON-строка | Скалярные массивы — фича Postgres. Список зон доставки — JSON-строка; связь товар↔документ — join-таблица `ProductDocument` |
| **Нет `@db.*`** | Ограничения длины в Zod | `@db.VarChar(255)`, `@db.Decimal`, `@db.Text` не переносятся. Длина проверяется на границе, а не на уровне колонки |
| **Деньги — всегда `Int` в бани** | `priceBani`, `totalBani`, `balanceBani` | `Decimal` ведёт себя по-разному, `Float` вообще недопустим для денег (см. раздел 8) |
| **Postgres-специфика — только в миграциях** | GIN/`pg_trgm` в миграции под провайдером | Схема остаётся переносимой, а Postgres получает свои индексы |

Цена этих ограничений — отсутствие проверки допустимых значений на уровне БД. Она
компенсируется тем, что **каждая** запись проходит Zod-схему, а типы TypeScript выводятся
из тех же кортежей, что перечислены в комментариях к моделям.

### Как `scripts/prisma.mjs` выводит SQLite-схему

Скрипт (98 строк, читается целиком) делает ровно следующее:

```
1. Читает .env самостоятельно — минимальным парсером, потому что значение
   DATABASE_PROVIDER нужно ДО того, как загрузится Prisma.
   Приоритет: process.env.DATABASE_PROVIDER → .env → 'sqlite'.

2. Проверяет значение. Не 'sqlite' и не 'postgresql' →
   "[prisma] DATABASE_PROVIDER must be "sqlite" or "postgresql"" и exit 1.

3. provider === 'postgresql'  →  schemaPath = prisma/schema.prisma. Конец.

4. provider === 'sqlite':
   a. Читает prisma/schema.prisma.
   b. Находит блок регуляркой  /datasource\s+db\s*\{[^}]*\}/m .
      Не нашёл → внятная ошибка и exit 1.
   c. Заменяет ТОЛЬКО этот блок на:
         datasource db {
           provider = "sqlite"
           url      = env("DATABASE_URL")
         }
   d. Приписывает шапку «GENERATED FILE — DO NOT EDIT».
   e. Пишет prisma/schema.sqlite.prisma, но ТОЛЬКО если содержимое изменилось —
      иначе file watcher'ы будут срабатывать на каждой команде.

5. Запускает `npx prisma <ваши аргументы> --schema <выбранный путь>`
   (флаг --schema не добавляется, если вы указали свой), пробрасывая stdio,
   и возвращает его код выхода.
```

Практические следствия:

* **Редактируйте только `prisma/schema.prisma`.** `prisma/schema.sqlite.prisma`
  перезаписывается на каждой db-команде и лежит в `.gitignore`.
* Меняются **исключительно** четыре строки datasource. Модели, индексы и комментарии
  идентичны в обоих файлах — расхождение по определению невозможно.
* Любая команда Prisma работает через обёртку: `node scripts/prisma.mjs studio`,
  `node scripts/prisma.mjs migrate status` и т. д.
* Все npm-скрипты уже завёрнуты: `db:generate`, `db:push`, `db:migrate`, `db:deploy`,
  `db:studio`, `db:reset`.

---

## 2. Обзор сущностей по доменам

Всего 45 моделей.

### Идентичность и доступ (5)

| Модель | Назначение |
| --- | --- |
| `User` | Учётная запись. Платформенная роль, статус, подтверждения email/телефона, зашифрованный секрет TOTP |
| `Session` | Сессия в БД. Хранится хеш токена, UA, IP, срок, отзыв |
| `VerificationToken` | Одноразовые токены: `EMAIL_VERIFY`, `PASSWORD_RESET`, `PHONE_OTP`, `EMAIL_OTP`, `TOTP_ENROLL` |
| `LoginAttempt` | Одна строка на попытку входа — защита от перебора и материал для расследований |
| `RateLimitHit` | Хранилище скользящего окна лимитера (dev/один узел; в продакшене заменяется Redis) |

### Компании (6)

| Модель | Назначение |
| --- | --- |
| `Company` | Профиль организации: реквизиты, контакты, доставка, флаги покупатель/продавец, баланс, агрегаты |
| `CompanyMember` | Связь пользователь↔компания с ролью `OWNER` / `MANAGER` |
| `CompanyPhoto` | Фотографии производства/склада |
| `VerificationBadge` | **Результат** проверки — единственное, что публично |
| `Document` | Загруженный документ в приватном хранилище |
| `DocumentHistory` | История решений модератора по документу |

### География (2)

| Модель | Назначение |
| --- | --- |
| `District` | Район / муниципий / АТО, координаты |
| `Locality` | Населённый пункт, привязан к району, флаг `isMajor` |

### Категории и атрибуты (6)

| Модель | Назначение |
| --- | --- |
| `Category` | Дерево с материализованным путём `path` |
| `CategoryTranslation` | Название, описание и **локализованный slug** |
| `CategorySynonym` | Синонимы, разговорные формы, опечатки |
| `CategoryAttribute` | Атрибут категории: тип, единица, обязательность, фильтруемость, `appliesTo`, наследование |
| `CategoryAttributeTranslation` | Метка и подсказка атрибута |
| `CategoryAttributeOption` + `CategoryAttributeOptionTranslation` | Варианты для `SELECT`/`MULTISELECT` |

### Товары (6)

`Product`, `ProductPhoto`, `PriceTier`, `ProductAttributeValue`, `ProductDocument`,
`ProductStatDaily`.

### Заявки и предложения (4)

`PurchaseRequest`, `RequestAttributeValue`, `RequestAttachment`, `Offer`.

### Сделки (2)

`Deal`, `DealEvent`.

### Переписка (4)

`Conversation`, `ConversationParticipant`, `Message`, `MessageAttachment`.

### Вовлечение (5)

`Favorite`, `SavedSearch`, `Notification`, `NotificationPreference`, `NotificationDelivery`.

### Доверие и модерация (5)

`Review`, `ReviewReply`, `Complaint`, `ModerationTask`, `AuditLog`.

### Деньги и настройки (7)

`LedgerEntry`, `Payment`, `WebhookEvent`, `Promotion`, `Tariff`, `FeatureFlag`, `Setting`.

### Поиск (1)

`SearchQueryLog`.

---

## 3. Текстовое ER-описание

```
User ──1:N── CompanyMember ──N:1── Company
 │                                    │
 ├─1:N─ Session                       ├─1:N─ CompanyPhoto
 ├─1:N─ VerificationToken             ├─1:N─ VerificationBadge   (unique: companyId+type)
 ├─1:N─ Notification                  ├─1:N─ Document ──1:N── DocumentHistory
 ├─1:N─ NotificationPreference        ├─1:N─ Product
 ├─1:N─ Favorite                      ├─1:N─ PurchaseRequest
 ├─1:N─ SavedSearch                   ├─1:N─ Offer            (как sellerCompany)
 ├─1:N─ Message                       ├─1:N─ Deal             (как buyer и как seller)
 ├─1:N─ ConversationParticipant       ├─1:N─ Review           (как автор и как объект)
 ├─1:N─ Complaint (подал / обработал) ├─1:N─ LedgerEntry
 ├─1:N─ AuditLog                      ├─1:N─ Payment
 ├─1:N─ DealEvent                     └─N:1─ District / Locality
 └─1:N─ ModerationTask

District ──1:N── Locality
    │                └──1:N── PurchaseRequest (deliveryLocality)
    └──1:N── Company

Category (самоссылка parent/children, материализованный путь `path`)
 ├─1:N─ CategoryTranslation      (unique: categoryId+locale, unique: locale+slug)
 ├─1:N─ CategorySynonym          (index: normalized)
 ├─1:N─ CategoryAttribute        (unique: categoryId+key)
 │        ├─1:N─ CategoryAttributeTranslation
 │        ├─1:N─ CategoryAttributeOption ──1:N── …OptionTranslation
 │        ├─1:N─ ProductAttributeValue
 │        └─1:N─ RequestAttributeValue
 ├─1:N─ Product
 └─1:N─ PurchaseRequest

Product
 ├─N:1─ Company, Category
 ├─1:N─ ProductPhoto, PriceTier, ProductAttributeValue, ProductStatDaily, Promotion
 ├─N:N─ Document  (через ProductDocument)
 ├─1:N─ Favorite, Deal, Conversation
 └─1:N─ Offer     (как alternativeProduct)

PurchaseRequest
 ├─N:1─ Company, Category, Locality (доставка)
 ├─1:N─ RequestAttributeValue, RequestAttachment
 └─1:N─ Offer ──┐
                │  unique: (requestId, sellerCompanyId)  ← одно предложение от компании
                ▼
              Deal ──1:N── DealEvent
                │  └─1:N── Review (unique: dealId+direction) ──1:1── ReviewReply
                └─1:N── Conversation

Conversation ──1:N── ConversationParticipant (unique: conversationId+userId)
     │         └─1:N── Message ──1:N── MessageAttachment
     └─ контекст: product | request | offer | deal  (все опциональны)

Company ──1:N── LedgerEntry   (idempotencyKey unique)
Company ──1:N── Payment       (idempotencyKey unique)
Product ──1:N── Promotion ──(ledgerEntryId)──▶ LedgerEntry

Одиночные таблицы без связей:
  WebhookEvent  (unique: provider+externalId)
  Tariff, FeatureFlag, Setting  (ключ — первичный)
  SearchQueryLog
  LoginAttempt, RateLimitHit
  NotificationDelivery
  ModerationTask (unique: entityType+entityId+status)
```

### Правила каскадов

| Правило | Где применено | Смысл |
| --- | --- | --- |
| `onDelete: Cascade` | Всё «принадлежащее» родителю: сессии, фото, ступени цены, значения атрибутов, сообщения, участники | Удаление компании не должна оставлять висящие фотографии |
| Без каскада (`Restrict` по умолчанию) | `Product.category`, `Deal.buyerCompany` / `sellerCompany`, `Deal.product` / `request` / `offer` | Нельзя удалить категорию, за которой числятся товары; сделка обязана сохранить обе стороны |
| `SetNull` через опциональность | `AuditLog.actor`, `DealEvent.actor`, `DocumentHistory.actor`, `Message.sender` | История должна пережить удаление пользователя |
| Мягкое удаление | `User.deletedAt`, `Company.deletedAt`, `Product.deletedAt`, `PurchaseRequest.deletedAt`, `Message.deletedAt` | Ссылочная целостность и восстановление; каждый публичный запрос обязан фильтровать `deletedAt: null` |

---

## 4. Заметки по ключевым моделям

### `User`

| Поле | Замечание |
| --- | --- |
| `email`, `phone` | Оба **опциональны** и оба `@unique`: регистрация возможна и по телефону без email, и наоборот. Нормализация (нижний регистр email, формат `+373…`) — на границе, в Zod |
| `passwordHash` | Опционален: аккаунт, созданный по SMS, может не иметь пароля. `verifyPassword(password, null)` возвращает `false`, а не падает |
| `role` | `USER \| MODERATOR \| ADMIN`. Роли покупателя и продавца живут **не здесь**, а на `Company` — об этом сказано в комментарии к полю |
| `status` | `ACTIVE \| BLOCKED \| DELETED`. `getCurrentUser()` возвращает `null` для всего, кроме `ACTIVE` |
| `totpSecretEnc` | Секрет TOTP, зашифрованный AES-256-GCM ключом, производным от `APP_SECRET`. В открытом виде не хранится нигде |
| `emailVerifiedAt`, `phoneVerifiedAt`, `acceptedTermsAt`, `onboardedAt` | Даты, а не булевы: видно «когда», а не только «да» |
| `@@index([role, status])` | Списки модераторов и админов в админке |

### `Company`

| Поле | Замечание |
| --- | --- |
| `slug` | Публичный URL `/suppliers/<slug>`, `@unique` |
| `legalName` / `displayName` | Юридическое имя для документов, отображаемое — для интерфейса |
| `idno` | 13-значный регистрационный номер Молдовы. Опционален: частник (PFA, GT) может его не иметь |
| `workingHours`, `paymentMethods`, `languages`, `deliveryZones` | JSON-строки; читаются только через `src/lib/json.ts` |
| `isBuyer` / `isSeller` | Два независимых флага — отсюда роль «Покупатель+Продавец» |
| `ratingAvg`, `ratingCount`, `dealsCompleted`, `avgResponseMinutes` | Денормализованные агрегаты, пересчитываются на запись. Считать их на лету на каждой карточке — самый быстрый способ убить каталог |
| `balanceBani` | **Кеш** последнего `LedgerEntry.balanceAfterBani`. Пишется только внутри той же транзакции |
| `trialEndsAt` | Конец бесплатного периода продавца |
| `@@index([status, isSeller])` / `([status, isBuyer])` | Списки поставщиков и покупателей |

### `Document`

| Поле | Замечание |
| --- | --- |
| `fileKey` | Ключ в **приватном** хранилище. Наружу не отдаётся никогда — только короткоживущая подписанная ссылка |
| `mimeType`, `sizeByte` | Сохраняются при загрузке, но доверять им нельзя: тип проверяется по «магическим байтам» (см. `docs/SECURITY.md`) |
| `isPublic` | По умолчанию `false`. Публично виден только результат проверки (`VerificationBadge`); показать сам документ — осознанное решение владельца |
| `status` | `PENDING \| APPROVED \| REJECTED \| CHANGES_REQUESTED \| EXPIRED` |
| `expiresAt`, `expiryNotifiedAt` | Срок действия и отметка «уже предупредили», чтобы не слать напоминание каждый день |

### `Category` и спутники

| Особенность | Зачем |
| --- | --- |
| `path` — материализованный путь («meat/beef/chilled») | Все товары поддерева одним `WHERE path LIKE 'meat/%'` вместо рекурсивного CTE, который к тому же по-разному пишется под два движка |
| `level`, `sortOrder`, `isActive`, `isPopular`, `icon` | Меню, главная, витрина популярных категорий |
| `defaultUnit` | Форма товара сразу подставляет KG для мяса и L для масла |
| `CategoryTranslation.@@unique([locale, slug])` | Гарантия уникальности локализованного URL внутри языка |
| `CategorySynonym.normalized` | Результат `normalize()`; индексируется — по нему и идёт сопоставление |
| `CategorySynonym.weight`, `isMisspelling` | Опечатка не должна ранжироваться наравне с точным названием |
| `CategoryAttribute.appliesTo` | `PRODUCT \| REQUEST \| BOTH`: заявка спрашивает не то же, что объявление («нужна ли доставка» против «страна происхождения») |
| `CategoryAttribute.inherited` | Атрибут родителя применяется к потомкам — не нужно копировать «жирность» в каждую подкатегорию молочки |
| `CategoryAttribute.@@unique([categoryId, key])` | Ключ атрибута уникален в пределах категории |

### `Product`, `PriceTier`, `ProductAttributeValue`

| Особенность | Зачем |
| --- | --- |
| 10 статусов | Реальный жизненный цикл: черновик → модерация → активно → пауза → истекло/архив/блок |
| `PUBLIC_PRODUCT_STATUSES = ['ACTIVE']` | Единственный статус, который видит гость. Константа, а не литерал в запросе |
| `pausedForBalance` | Отличает «продавец сам поставил на паузу» от «кончился баланс»: во втором случае показ возобновляется автоматически после пополнения |
| `searchText` | Денормализованная нормализованная строка для поиска (раздел 6) |
| `promotedUntil`, `bumpedAt`, `isHighlighted`, `isUrgent`, `isHomepagePinned` | Денормализованы из `Promotion` — чтобы сортировать без join'а на каждой странице каталога |
| `viewsCount`, `favoritesCount`, `contactsCount` | Счётчики на карточке |
| `ProductStatDaily.@@unique([productId, day])` | `day` — строка `YYYY-MM-DD` в Europe/Chisinau (`chisinauDayKey()`). Строка, а не дата, потому что «день» здесь — календарный день Кишинёва, а не момент времени |
| `PriceTier` | `minQty` включительно, `maxQty` включительно, `null` = без верхней границы. Разрешение цены — `resolveTierPriceBani()`: выигрывает наибольшая подходящая нижняя граница, поэтому пересекающиеся диапазоны деградируют предсказуемо, а не случайно |
| `ProductAttributeValue` | Одна строка на атрибут (`@@unique([productId, attributeId])`), четыре типизированные колонки (`valueText`, `valueNumber`, `valueBool`, `valueDate`) + `optionId`. Хранить всё в тексте нельзя — сломается фильтр «жирность от 3,2 %» |

### `PurchaseRequest`

| Особенность | Зачем |
| --- | --- |
| `desiredPriceBani` и `maxBudgetBani` — оба опциональны | Покупатель вправе не раскрывать бюджет; принуждать нельзя |
| `isRecurring` + `frequency` | Регулярная закупка — главная ценность для поставщика: это не разовая сделка |
| `offersDeadlineAt` | Дедлайн приёма предложений; индексируется для задачи авто-истечения |
| `supplierRadiusKm` | Ограничение по географии — молдавская логистика упирается в километры |
| `verifiedOnly` | Только поставщики с подтверждёнными документами |
| `allowPartial` | Можно ли закрыть заявку частично — иначе мелкий фермер не станет отвечать на большой объём |
| `visibility` | `PUBLIC` / `PRIVATE` |
| `offersCount` | Денормализованный счётчик. Это **единственное**, что поставщик знает о конкуренции |

### `Offer`

Самая чувствительная модель в системе. Комментарий стоит прямо в схеме:

> `/// SEALED BID. A supplier may only ever read its own offer; the buyer who owns the`
> `/// request reads all of them. This is enforced in src/server/services/offers.ts and`
> `/// covered by tests/integration/offer-privacy.test.ts — do not add a public read path.`

| Особенность | Зачем |
| --- | --- |
| `@@unique([requestId, sellerCompanyId])` | Одна компания — одно предложение на заявку. Иначе можно завалить заявку вариациями и вычислить конкурентов |
| `totalBani` хранится, а не считается на лету | Итог фиксируется на момент отправки; изменение цены товара не должно задним числом переписать отправленное предложение |
| `attachmentKey` / `attachmentName` | Коммерческое предложение в PDF — приватный объект, доступен только автору и покупателю |
| `viewedAt` | Первое открытие покупателем; питает метрику «Время ответа» |
| `validUntil` | Срок действия; по нему задача проставляет `EXPIRED` |
| `alternativeProductId` | Поставщик может предложить замену из своего каталога |
| `@@index([sellerCompanyId, status])` | «Мои предложения» у поставщика |
| `@@index([requestId, status])` | Таблица сравнения у покупателя |

### `Deal`

| Особенность | Зачем |
| --- | --- |
| `number` `@unique` | Человекочитаемый номер для переписки и документов |
| `productId`, `requestId`, `offerId` — все опциональны | Сделка рождается из предложения, из карточки товара или вручную |
| `unitPriceBani`, `deliveryPriceBani`, `totalBani` | **Снимок** условий. Сделка не должна «поплыть» вслед за редактированием объявления |
| `buyerConfirmedAt` / `sellerConfirmedAt` | Двустороннее подтверждение |
| `status` + `DEAL_TRANSITIONS` | Конечный автомат читают и сервер, и UI — невозможный переход не пройдёт ни кнопкой, ни подделанным запросом |
| `DealEvent` | Полная история: кто, из какого статуса, в какой, с комментарием |

### `Conversation` / `Message`

| Особенность | Зачем |
| --- | --- |
| Два `@@unique` (по `productId` и по `requestId` вместе с парой компаний) | Обсуждение одного товара двумя компаниями не расщепляется на десять диалогов |
| Контекстные ссылки опциональны | Тип `DIRECT` не привязан ни к чему |
| `Message.kind = SYSTEM` + `params` (JSON) | Системное сообщение рендерится из i18n-ключа с параметрами. Если хранить готовый текст, он не переведётся при смене языка |
| `ConversationParticipant.lastReadAt` | Непрочитанное считается сравнением с `Message.createdAt` — без отдельной таблицы «прочитано» |
| `isBlocked`, `isArchived` | На стороне участника, а не диалога: блокировка односторонняя |

### `LedgerEntry`

| Особенность | Зачем |
| --- | --- |
| Append-only | Финансовая история не редактируется. Ошибка исправляется записью `ADJUSTMENT` |
| `amountBani` со знаком | Плюс — кредит, минус — дебет. Одна колонка вместо пары «дебет/кредит» |
| `balanceBeforeBani` / `balanceAfterBani` | Снимки позволяют проверить непрерывность цепочки, не пересчитывая всю историю |
| `idempotencyKey` `@unique` | Единственная причина, по которой ежедневное списание можно перезапускать без страха (раздел «Денежная модель» в `docs/ARCHITECTURE.md`) |
| `entityType` / `entityId` | За что списали — объявление, продвижение, платёж |

### `Payment` и `WebhookEvent`

| Особенность | Зачем |
| --- | --- |
| `Payment.provider` | `mock \| maib \| victoriabank \| paynet \| mia` |
| `Payment.idempotencyKey` `@unique` | Двойное нажатие «Оплатить» не создаёт два платежа |
| `WebhookEvent.payload` | **Сырое** тело запроса сохраняется до обработки: реплей детектируется, упавший обработчик можно перезапустить, не потеряв данные |
| `WebhookEvent.@@unique([provider, externalId])` | Повторная доставка вебхука распознаётся как дубль |
| `signatureValid` | Результат проверки подписи фиксируется вместе с телом |

### `AuditLog`

| Особенность | Зачем |
| --- | --- |
| `oldValue` / `newValue` — JSON-снимки | Видно не только «изменил», но и «что именно» |
| `actorId` опционален | Системные действия (крон, вебхук) не имеют актора |
| `reason` | Обязателен для действий модератора: блокировка без причины не проходит |
| `ip` | Для расследований |
| Три индекса | По сущности, по актору, по времени — три типовых вопроса при разборе инцидента |

---

## 5. Стратегия индексирования

Правило: каждый индекс должен отвечать конкретному запросу из интерфейса. Лишний индекс —
замедление записи и лишний размер.

### Публичный каталог

| Индекс | Запрос |
| --- | --- |
| `Product.@@index([status, publishedAt])` | Лента «новые объявления», главная |
| `Product.@@index([categoryId, status])` | Страница категории |
| `Product.@@index([status, priceBani])` | Сортировка по цене, фильтр диапазона |
| `Product.@@index([bumpedAt])` | Продвинутые вверх |
| `Product.@@index([companyId, status])` | Товары на странице поставщика и в кабинете |
| `Category.@@index([path])` | Подзапрос по поддереву `path LIKE 'meat/%'` |
| `Category.@@index([parentId, sortOrder])` | Отрисовка меню |
| `Category.@@index([isActive, isPopular])` | Популярные категории на главной |
| `CategoryTranslation.@@index([locale])` + `@@unique([locale, slug])` | Разрешение локализованного URL категории |
| `Company.@@index([status, isSeller])` | Каталог поставщиков |
| `Company.@@index([districtId])` | Фильтр по району |
| `Company.@@index([ratingAvg])` | Сортировка по рейтингу |
| `Locality.@@index([isMajor])` | Быстрый выбор крупных городов в фильтре |

### Заявки и предложения

| Индекс | Запрос |
| --- | --- |
| `PurchaseRequest.@@index([status, createdAt])` | Лента заявок |
| `PurchaseRequest.@@index([categoryId, status])` | Заявки в категории поставщика |
| `PurchaseRequest.@@index([companyId, status])` | «Мои заявки» |
| `PurchaseRequest.@@index([offersDeadlineAt])` | Задача авто-истечения |
| `Offer.@@unique([requestId, sellerCompanyId])` | Инвариант «одно предложение» + быстрый поиск своего |
| `Offer.@@index([requestId, status])` | Таблица сравнения |
| `Offer.@@index([sellerCompanyId, status])` | «Мои предложения» |

### Сделки, чат, уведомления

| Индекс | Запрос |
| --- | --- |
| `Deal.@@index([buyerCompanyId, status])` / `([sellerCompanyId, status])` | Списки сделок с обеих сторон |
| `Deal.@@index([status, createdAt])` | Админ-обзор |
| `DealEvent.@@index([dealId, createdAt])` | Хронология сделки |
| `Conversation.@@index([lastMessageAt])` | Сортировка списка диалогов |
| `Message.@@index([conversationId, createdAt])` | Пагинация переписки |
| `ConversationParticipant.@@index([userId, isArchived])` | «Мои диалоги» |
| `Notification.@@index([userId, readAt, createdAt])` | Колокольчик: непрочитанные первыми |

### Модерация, доверие, аудит

| Индекс | Запрос |
| --- | --- |
| `Document.@@index([status, createdAt])` | Очередь модерации документов |
| `Document.@@index([companyId, status])` | Документы компании |
| `Document.@@index([expiresAt])` | Задача «истекает срок» |
| `ModerationTask.@@index([status, priority, createdAt])` | Очередь с приоритетом |
| `ModerationTask.@@unique([entityType, entityId, status])` | Один объект не попадает в очередь дважды |
| `Complaint.@@index([status, createdAt])` / `([entityType, entityId])` | Очередь жалоб и жалобы на объект |
| `Review.@@index([targetCompanyId, status, createdAt])` | Отзывы на странице компании |
| `AuditLog` × 3 | Разбор инцидента: по объекту, по актору, по времени |

### Деньги и безопасность

| Индекс | Запрос |
| --- | --- |
| `LedgerEntry.@@index([companyId, createdAt])` | История операций компании |
| `LedgerEntry.@@index([type, createdAt])` | Отчёт «сколько списано за период» |
| `LedgerEntry.idempotencyKey @unique` | Защита от двойного списания |
| `Payment.@@index([companyId, createdAt])`, `([status])` | История платежей, поиск зависших |
| `Session.@@index([userId])`, `([expiresAt])` | Список устройств, чистка |
| `VerificationToken.@@index([target, type])`, `([tokenHash])`, `([expiresAt])` | Поиск активного токена, проверка, чистка |
| `LoginAttempt.@@index([identifier, createdAt])`, `([ip, createdAt])` | Обе оси защиты от перебора |
| `RateLimitHit.@@index([bucket, createdAt])` | Подсчёт скользящего окна |
| `SearchQueryLog.@@index([normalized, createdAt])` | Популярные запросы |

### Порядок колонок в составных индексах

Всегда: сначала колонка с равенством, потом — с диапазоном/сортировкой.
`@@index([status, publishedAt])` обслуживает
`WHERE status = 'ACTIVE' ORDER BY publishedAt DESC` целиком. Обратный порядок — нет.

---

## 6. Реализация поиска

### Колонка `searchText`

Есть у `Product` и `PurchaseRequest`, `String @default("")`. Заполняется при каждой
записи из:

1. `normalize(title)`;
2. `normalize(description)` — усечённое;
3. названия категории на обоих языках;
4. нормализованных синонимов категории (`CategorySynonym.normalized`);
5. значимых значений атрибутов (например, названия сорта или страны происхождения);
6. названия производителя и страны происхождения.

Всё пропущено через `normalize()` из `src/lib/normalize.ts`, поэтому «Carne de vită»,
«carne de vita» и «КАРНЕ ДЕ ВИТА» дают одну и ту же строку индексации.

### Расширение запроса синонимами

```
Запрос: "помидоры черри"
  1. normalize()      → "помидоры черри"
  2. tokenize()       → ["помидоры", "черри"]
  3. stem()           → ["помидор", "черри"]        (RU_SUFFIXES)
  4. поиск по CategorySynonym.normalized:
       "помидор" → категория "tomatoes" (weight 100)
       синонимы категории: "томат", "roșii", "rosii", "tomate"
  5. набор для поиска: исходные токены + синонимы найденных категорий
  6. если ничего не нашлось — isFuzzyMatch() с порогом по длине слова
       (≤4 симв. → 1 ошибка, ≤7 → 2, дальше → 3)
  7. результат: WHERE searchText LIKE … по каждому токену
       + буст: точное совпадение названия > синоним > нечёткое
```

Найденная категория используется дважды: как фильтр и как подсказка «искать в категории
Помидоры» в поисковом оверлее.

### Как добавить GIN + `pg_trgm` в миграции под провайдером

Индекс существует только для PostgreSQL, поэтому в `prisma/schema.prisma` его нет —
только в SQL-миграции.

```bash
# 1. Убедиться, что работаем на PostgreSQL
#    .env:  DATABASE_PROVIDER="postgresql"

# 2. Создать пустую миграцию
npx prisma migrate dev --create-only --name add_search_indexes --schema prisma/schema.prisma
```

Наполнить `prisma/migrations/<timestamp>_add_search_indexes/migration.sql`:

```sql
-- Триграммный поиск: работает для подстроки, опечатки и любого языка,
-- в отличие от to_tsvector, которому нужен конкретный словарь.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Основной индекс поиска по товарам.
CREATE INDEX IF NOT EXISTS "Product_searchText_trgm_idx"
  ON "Product" USING GIN ("searchText" gin_trgm_ops);

-- Тот же индекс для заявок.
CREATE INDEX IF NOT EXISTS "PurchaseRequest_searchText_trgm_idx"
  ON "PurchaseRequest" USING GIN ("searchText" gin_trgm_ops);

-- Типизация в подсказках категорий.
CREATE INDEX IF NOT EXISTS "CategorySynonym_normalized_trgm_idx"
  ON "CategorySynonym" USING GIN ("normalized" gin_trgm_ops);

-- Частичный индекс: 95 % публичных запросов смотрят только на ACTIVE.
-- Индекс получается в разы меньше полного.
CREATE INDEX IF NOT EXISTS "Product_active_published_idx"
  ON "Product" ("publishedAt" DESC)
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

-- Порог похожести по умолчанию 0.3 — для коротких названий товаров слишком строгий.
-- Ставится в сессии сервисом поиска, а не глобально:
--   SET LOCAL pg_trgm.similarity_threshold = 0.22;
```

Применить:

```bash
npx prisma migrate dev --schema prisma/schema.prisma
```

**Важно.** Такая миграция не может быть применена к SQLite. Правила:

* SQLite-разработчики используют `npm run db:push` — миграции к ним вообще не применяются;
* сервис поиска обязан ветвиться по `env.DATABASE_PROVIDER`: `similarity()` и GIN — для
  Postgres, `LIKE '%…%'` по `searchText` — для SQLite;
* обе ветки обязаны возвращать одинаковую форму результата, иначе разработка на SQLite
  перестанет отражать продакшен.

Для больших таблиц в проде используется `CREATE INDEX CONCURRENTLY` — но Prisma
оборачивает миграцию в транзакцию, а `CONCURRENTLY` в транзакции запрещён. Поэтому такой
индекс создаётся вручную в окне обслуживания и отмечается через
`prisma migrate resolve --applied`.

### Логирование запросов

Каждый поиск пишется в `SearchQueryLog`: исходная строка, `normalized`, число
результатов, локаль, пользователь (если есть). Это даёт:

* «Популярные запросы» и «Недавние запросы» в поисковом оверлее;
* список запросов с нулевой выдачей — прямой список пробелов в каталоге и в синонимах;
* базу сравнения при смене поискового движка.

---

## 7. Инвариант закрытых предложений

**Формулировка.** Поставщик не может узнать цену, условия, вложения или наличие
предложения другого поставщика по той же заявке — ни через интерфейс, ни через server
action, ни через прямой запрос.

### Где обеспечивается

| Уровень | Механизм |
| --- | --- |
| Схема | Комментарий-требование над моделью `Offer`; `@@unique([requestId, sellerCompanyId])` |
| Сервис | `src/server/services/offers.ts` (**в разработке**) — единственный путь чтения. Два разрешённых случая: автор предложения и владелец заявки |
| Server actions | `assertSeller()` / `assertBuyer()` + проверка владения перед любым чтением |
| Маршруты | Публичного эндпоинта чтения предложений нет. Страница заявки для поставщика отдаёт только `offersCount` |
| Хранилище | `Offer.attachmentKey` — приватный объект; подписанная ссылка выдаётся только двум сторонам |
| Уведомления | Письмо «получено новое предложение» уходит покупателю. Поставщикам не сообщается ни число, ни диапазон цен конкурентов |
| Тест | `tests/integration/offer-privacy.test.ts` (**в разработке**) — назван прямо в схеме как обязательный |

### Что должен покрывать тест

1. Поставщик A отправил предложение — читает его.
2. Поставщик B по той же заявке **не** получает предложение A ни одним публичным вызовом.
3. Покупатель — владелец заявки — видит оба.
4. Посторонняя компания не видит ничего.
5. Гость не видит ничего.
6. Подписанная ссылка на вложение A не работает для B.
7. Список предложений поставщика содержит только его собственные.
8. Отклонённое предложение остаётся невидимым для остальных.

Тест обязателен в CI. Провал = блокирующий баг, а не «регресс UI».

---

## 8. Представление денег

| Правило | Реализация |
| --- | --- |
| Все суммы — целые бани | Колонки `Int` с суффиксом `Bani` |
| 1 MDL = 100 бани | `BANI_PER_MDL` в `src/lib/money.ts` |
| Никаких `Float` для денег | `Float` в схеме встречается только у количеств (`minOrderQty`, `availableQty`, `quantity`), координат и `ratingAvg` |
| Единственная точка «float × деньги» | `lineTotalBani(quantity, unitPriceBani)` — округляет немедленно |
| Ввод пользователя | `parseAmountToBani()` принимает `95.50` и `95,50`, `null` на всё остальное |
| Вывод | `formatMoney(bani, locale)` — `Intl` + неразрывный пробел |
| Валюта | Поле `currency` со значением `MDL` по умолчанию — задел на расширение, но MVP работает только в MDL |

Почему не `Decimal`: тип отсутствует в SQLite в том же виде, поведение при округлении
различается, а Prisma отдаёт `Decimal.js`-объект, который приходится сериализовать на
границе серверных компонентов. Целые бани решают все три проблемы разом.

Пример последовательности:

```ts
parseAmountToBani('95,50')                 // 9550
resolveTierPriceBani(150, 9550, tiers)     // 9200  (ступень «от 100 кг»)
lineTotalBani(150, 9200)                   // 1_380_000
formatMoney(1_380_000, 'ru')               // "13 800 MDL"
tierDiscountPercent(9550, 9200)            // 4
```

---

## 9. Работа с миграциями

### Золотое правило

> Редактируется **только** `prisma/schema.prisma`. Файл `prisma/schema.sqlite.prisma`
> генерируется и лежит в `.gitignore`.

### PostgreSQL — путь миграций (продакшен и то, что коммитится)

```bash
# .env
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://productmd:productmd@localhost:5432/productmd?schema=public"

# 1. Изменить prisma/schema.prisma
# 2. Создать и применить миграцию локально
npm run db:migrate -- --name add_product_video_url
#   ↳ node scripts/prisma.mjs migrate dev --name …

# 3. Проверить SQL в prisma/migrations/<timestamp>_add_product_video_url/migration.sql
# 4. Закоммитить И схему, И миграцию — одним коммитом

# Продакшен
npm run db:deploy      # prisma migrate deploy — не создаёт, только применяет
```

`migrate deploy` никогда не сбрасывает базу и не создаёт новых миграций — только применяет
уже существующие. Это и есть продакшен-команда.

### SQLite — путь `db push` (только разработка)

```bash
# .env
DATABASE_PROVIDER="sqlite"
DATABASE_URL="file:./dev.db"

npm run db:push        # приводит dev.db к схеме, без файлов миграций
npm run db:reset       # db push --force-reset --accept-data-loss + повторный сид
```

Почему для SQLite не используется `migrate`: миграции написаны на диалекте PostgreSQL
(включая GIN-индексы, которых в SQLite нет). Попытка их применить провалится. Для
локальной разработки история миграций не нужна — нужна актуальная схема.

### Матрица команд

| Задача | PostgreSQL | SQLite |
| --- | --- | --- |
| Применить схему | `npm run db:migrate` | `npm run db:push` |
| Продакшен-развёртывание | `npm run db:deploy` | не применимо |
| Полный сброс | `migrate reset` | `npm run db:reset` |
| Сгенерировать клиент | `npm run db:generate` | `npm run db:generate` |
| Просмотр данных | `npm run db:studio` | `npm run db:studio` |
| Статус миграций | `node scripts/prisma.mjs migrate status` | не применимо |

### Правила безопасных миграций

1. **Никогда не редактировать применённую миграцию.** Нужна правка — новая миграция.
2. **Схема и миграция — в одном коммите.** Иначе у коллеги окажется схема без SQL.
3. **Обязательная колонка добавляется в три шага:** добавить как опциональную → заполнить
   данные → сделать обязательной. Одним шагом это упадёт на непустой таблице.
4. **Переименование колонки** Prisma по умолчанию выражает как `DROP` + `ADD` — это потеря
   данных. Нужен `--create-only` и ручная правка на `ALTER TABLE … RENAME COLUMN`.
5. **Проверить SQL глазами** до применения на проде — особенно на `DROP`.
6. **Бэкап перед `migrate deploy` на проде.** Всегда.
7. **Проверить на копии продакшен-данных** — миграция, мгновенная на 100 строках, может
   блокировать таблицу на миллионе.
8. **Postgres-специфика (GIN, `CONCURRENTLY`, расширения) — только в `.sql` миграциях**,
   не в схеме.

---

## 10. Сидинг

**Статус: `prisma/seed.ts` в разработке.** Скрипт уже объявлен в `package.json`
(`"prisma": { "seed": "tsx prisma/seed.ts" }` и `npm run db:seed`), контракт ниже
фиксирован.

### Что должен создавать сид

| Порядок | Данные | Объём | Обязательность |
| --- | --- | --- | --- |
| 1 | Районы и населённые пункты Молдовы | 32 района + муниципии + АТО Гагаузия, крупные города с `isMajor` | Справочник, нужен всегда |
| 2 | Дерево категорий с `path`, переводами RU/RO и локализованными slug'ами | 8–12 корневых (мясо, молочные, овощи и фрукты, бакалея, напитки, выпечка, рыба, упаковка, HoReCa-инвентарь), 3 уровня | Справочник |
| 3 | Синонимы категорий на обоих языках, включая типовые опечатки | 5–15 на категорию | Справочник — без них не работает умный подбор |
| 4 | Атрибуты категорий + переводы + варианты | по профилю категории | Справочник |
| 5 | Тарифы из `DEFAULT_TARIFFS` | 7 записей | Справочник |
| 6 | Feature-флаги из `DEFAULT_FEATURE_FLAGS` | 6 записей | Справочник |
| 7 | Тестовые пользователи и компании | 4 аккаунта (см. `README.md`) | Только не-продакшен |
| 8 | Демонстрационные товары, заявки, предложения, сделки, отзывы | 40–60 товаров, 10–15 заявок | Только не-продакшен |

### Требования к сиду

* **Идемпотентность.** Только `upsert` по стабильным ключам (`slug`, `email`, `key`).
  Повторный запуск не должен плодить дубликаты.
* **Разделение справочников и демо-данных.** Справочники (пп. 1–6) нужны и в проде;
  тестовые аккаунты и демо-контент — только когда `NODE_ENV !== 'production'`. Сид обязан
  отказаться создавать тестовые пароли в продакшене.
* **`searchText` заполняется тем же кодом**, что и в рантайме, — иначе локальный поиск
  будет вести себя иначе, чем боевой.
* **Пароли хешируются `hashPassword()`**, а не подставляются готовой строкой.
* **Работает на обоих провайдерах** — никакого `$queryRaw` с Postgres-диалектом.
* **Реалистичные данные:** молдавские названия компаний и населённых пунктов, цены в
  правдоподобном диапазоне (говядина 90–120 MDL/кг, помидоры 15–35 MDL/кг), минимальные
  партии, оптовые ступени. На пустых или абсурдных данных невозможно оценить интерфейс.

### Запуск

```bash
npm run db:seed        # tsx prisma/seed.ts
npm run db:reset       # снести SQLite-базу и засеять заново
```

---

## Связанные документы

| Документ | О чём |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Слой доступа к данным, транзакции, адаптеры |
| [SECURITY.md](./SECURITY.md) | Приватность документов, инвариант предложений, аудит |
| [PRD.md](./PRD.md) | Что означают эти сущности для бизнеса |
