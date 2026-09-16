# Перенос UI-фич Festival Engine в БД — план (реализовано)

Дата: 2026-09-17. Продолжение `docs/FESTIVAL_ENGINE_AUDIT.md` и
`docs/FESTIVAL_ENGINE_ER.md`.

**Статус: схема реализована.** Все решения из раздела 2 внесены в
`prisma/schema.prisma`, миграция написана —
`prisma/migrations/20260917000000_festival_ui_features/migration.sql`.
`npx prisma validate`/`generate`, `npx tsc --noEmit` (после точечных правок в
`reviews/page.tsx`, `BroadcastComposer.tsx`, `subscriptions.ts`,
`pass-service.test.ts` — см. `docs/PROGRESS.md`), `npx vitest run` (1358
тестов) и `npx next build` — все зелёные. **Миграция НЕ применена к реальной
БД** — Supabase MCP недоступен в этой сессии (та же ситуация, что и с
`20260916140000_festival_engine`); применить `apply_migration`, когда MCP
будет доступен, ДО того, как начнётся сервисный слой поверх этих таблиц.

## 0. Исправление моей ошибки

В прошлом сообщении я сказал, что всё UI, что мы добавили в макет, "только
UI, бэкенда нет вообще". **Это неверно для двух пунктов** — я не сверился
со схемой перед ответом, сделал это только сейчас:

- **Промокоды** — модель `PromoCode`/`PromoCodePass` уже существует в
  `prisma/schema.prisma` (строки 895-926), привязана к `Event`, с
  `discountType`/`discountValue`/`validFrom`/`validUntil`/`maxUses`. Уже
  есть сервисные функции `createPromoCode()`/`listPromoCodesForEvent()`/
  `setPromoCodeActive()` в `pass-service.ts` и роуты
  `/api/events/[slug]/promo-codes`.
- **Ступенчатое ценообразование (Early Bird)** — модель `PassPriceTier`
  (строки 844-858) 1:1 совпадает с тем, что я нарисовал в макете (label/
  price/validFrom/validUntil/sortOrder), плюс `createPriceTier()`/
  `updatePriceTier()`/`deletePriceTier()` и роуты
  `/api/events/[slug]/passes/[id]/price-tiers`.

Обе фичи были построены в **другой сессии этого же проекта, в тот же день**
(судя по комментариям в схеме и `docs/PROGRESS.md`, разделы "Расширение
архитектуры Pass — Early Bird/доступ/промокоды" и "Ticket Engine v2"), я
просто не проверил это перед тем, как ответить. Раз `Pass` принадлежит
`Event`, а у фестиваля уже есть bridge-Event — эти две фичи для Festival
почти не требуют новой схемы, только связать существующий бэкенд с
консолью фестиваля (см. раздел 1).

Также ниже выяснилось, что для «рассылки» уже есть немалая инфраструктура
(`Broadcast`/`Notification`/`Subscription`) — но с оговоркой по аудитории,
см. решение №1 в разделе 2.

## 1. Аудит: что уже есть в БД vs что нужно создать

### 1.1 Уже полностью существует — только связать интерфейс, схему не трогать
| Функция макета | Модель | Комментарий |
|---|---|---|
| Промокоды | `PromoCode`, `PromoCodePass` | Уже на `Event` = уже на bridge-Event фестиваля |
| Ступенчатое ценообразование | `PassPriceTier` | Поля совпадают с макетом почти дословно |
| «Доступ к пунктам программы» у Pass | `PassAccessGrant` | Уже именно так и работает |

### 1.2 Нужно расширить существующую модель (1-3 поля/enum, БЕЗ новой таблицы)
| Функция макета | Где | Предлагаемые поля |
|---|---|---|
| Лимит мест на пункт программы + переключатель «показывать публично» | `ProgramItem` | `capacity Int?` (по образцу уже существующего `Event.capacity`), `showCapacityPublicly Boolean @default(true)` |
| Условия возврата Pass | `Pass` | `refundPolicy PassRefundPolicy @default(NONE)` (enum `NONE/UNTIL_DATE/PARTIAL/FULL`), `refundDeadline DateTime?`, `refundFeePercent Decimal?` |

`Ticket.status = REFUNDED` уже существует, но это факт свершившегося
возврата, а не настраиваемая политика — этих двух вещей в схеме
сегодня нет, их не хватает.

### 1.3 Полностью новые модели (новые таблицы)
| Модель | Поля (черновик) |
|---|---|
| `FestivalSponsor` | `id, festivalId→Festival, name, tier String, logoUrl String?, websiteUrl String?, sortOrder Int @default(0), createdAt/updatedAt` |
| `FestivalFaqItem` | `id, festivalId→Festival, question, answer, sortOrder Int @default(0), createdAt/updatedAt` |
| `FestivalGuestQuestion` | `id, festivalId→Festival, askerName String?, question String, moderationStatus ModerationStatus @default(PENDING), moderatedById→User?, moderatedAt?, answer String?, answeredById→User?, answeredAt?, createdAt` — модерация (виден на сайте) и ответ организатора — две независимые оси, см. решение №3 |
| `FestivalExpense` | `id, festivalId→Festival, title, category enum(ARTISTS/VENUE/MARKETING/EQUIPMENT/OTHER), amount Decimal, currency String?, status(PENDING/PAID), note String?, createdAt/updatedAt` |
| `FestivalReferralCode` | см. точную схему ниже (решение №4) |

### 1.4 `FestivalReferralCode` — точная схема (по решению пользователя)

Отдельная модель, НЕ расширение `PromoCode`. Поля и связь с `Ticket` — как
задано пользователем, с двумя уточнениями, помеченными ⚠️ (нужно
подтверждение, дальше не угадываю):

```prisma
enum ReferralCommissionType {
  PERCENT
  FIXED_AMOUNT
}

model FestivalReferralCode {
  id                String                 @id @default(cuid())
  festivalId        String
  festival          Festival               @relation(fields: [festivalId], references: [id], onDelete: Cascade)
  code              String
  ownerTeacherId    String?
  ownerTeacher      Teacher?               @relation(fields: [ownerTeacherId], references: [id])
  ownerSchoolId     String?
  ownerSchool       School?                @relation(fields: [ownerSchoolId], references: [id])
  // ⚠️ discountType не был в твоём списке полей — без него discountValue
  // непонятно, это "5" (%) или "5" (BYN). Добавил, переиспользуя тот же
  // enum, что и у PromoCode (PromoDiscountType), чтобы не заводить третий
  // одинаковый enum. Если скидки у реферальных кодов не нужны вообще —
  // скажи, уберу оба поля.
  discountType      PromoDiscountType?
  discountValue     Decimal?               @db.Decimal(10, 2)
  commissionType    ReferralCommissionType
  commissionValue   Decimal                @db.Decimal(10, 2)
  // ⚠️ назвал active/startsAt/expiresAt так, как ты написал — но у
  // PromoCode это isActive/validFrom/validUntil. Разные имена для очень
  // похожих по смыслу полей в соседних моделях — сознательно оставляю на
  // твоё решение, не привожу автоматически к единообразию.
  active            Boolean                @default(true)
  startsAt          DateTime?
  expiresAt         DateTime?
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  tickets Ticket[]

  @@unique([festivalId, code])
  @@index([festivalId])
  @@index([ownerTeacherId])
  @@index([ownerSchoolId])
}
```

Плюс CHECK на уровне БД (Prisma DSL не умеет декларативно, как и у
`PassAccessGrant`/`Ticket` — в migration.sql): ровно одно из
`ownerTeacherId`/`ownerSchoolId` заполнено.

**Связь с `Ticket`** (чтобы считать привлечённых покупателей/выручку/
скидку/комиссию, как ты просил) — по образцу уже существующей связи
`Ticket.promoCodeId`/`discountAmount`:

```prisma
// добавить в существующую model Ticket:
referralCodeId          String?
referralCode            FestivalReferralCode? @relation(fields: [referralCodeId], references: [id])
referralDiscountAmount  Decimal?              @db.Decimal(10, 2) // снимок скидки на момент выдачи
referralCommissionAmount Decimal?             @db.Decimal(10, 2) // снимок комиссии владельца на момент выдачи
```

Снимки (не пересчитываются задним числом при изменении кода) — тот же
принцип неизменности, что уже используется в проекте (CLAUDE.md §39/§51,
уже применено к цене самого `Ticket`). Дальше агрегаты считаются простым
запросом по `FestivalReferralCode.tickets` — новых полей для статистики
не требуется, как и у `PromoCode`.

### 1.5 Ничего не требуется в схеме — только чтение существующих данных
- **Личный кабинет участника** — не отдельная сущность. Страница просто
  читает `Ticket`/`Pass` танцора + `PassAccessGrant` → список доступных
  `ProgramItem`. «QR-код» — это просто `ticket.id` в штрихкоде, для этого
  ничего заводить не нужно (сам сканер/чекин — отдельная будущая задача,
  уже в бэклоге).
- **Рассылка** — по решению №1 ниже нужно небольшое расширение enum
  `SubscriptionType` (значение `PASS`), таблицу `Broadcast` менять не
  нужно — она уже достаточно общая (`targetType`/`targetId`).

## 2. Решения (утверждены пользователем 2026-09-17)

1. **Рассылка — и то, и то.** `Broadcast`/`SubscriptionType` расширяется
   новым значением `PASS` (`targetId` = id конкретного Pass), СУЩЕСТВУЮЩИЕ
   варианты (`EVENT` и т.д.) не убираются. Организатор при отправке
   рассылки выбирает: по подписчикам bridge-Event ИЛИ по держателям
   конкретного Pass — оба пути идут через один и тот же `Broadcast`,
   просто разный `targetType`/`targetId`. Схема: только новое значение
   enum, без новой таблицы. Логика резолва аудитории для `targetType=PASS`
   (кто держит активный Ticket на этот Pass) — сервисный слой, не в этом
   плане.
2. **Отзывы фестиваля — расширить `Review`.** `Review.schoolId` становится
   `String?`, добавляется `Review.festivalId String? → Festival`. Ровно
   одно из двух полей должно быть заполнено — CHECK-constraint (как уже
   сделано для `PassAccessGrant.programItemId`/`masterclassSessionId`).
   Существующая модерация (`moderationStatus`) переиспользуется как есть.
3. **Модерация UGC — с модерацией, как у школ.** Применяется и к отзывам
   (уже покрыто решением 2, `Review.moderationStatus` уже существует), и к
   вопросам гостей: `FestivalGuestQuestion` получает СВОЁ ПОЛЕ
   `moderationStatus ModerationStatus @default(PENDING)` (переиспользуем
   существующий enum `ModerationStatus`, не заводим новый) — это ОТДЕЛЬНАЯ
   ось от того, ответил ли уже организатор. Публично на сайте виден только
   вопрос с `moderationStatus = APPROVED`, независимо от того, есть ли уже
   `answer`.
4. **Реферальные коды — отдельная модель `FestivalReferralCode`**, НЕ
   расширение `PromoCode` (мой вариант "расширить PromoCode" отклонён:
   `PromoCode.discountValue` обязателен и означает скидку покупателю;
   реферальный код — в первую очередь атрибуция продаж конкретному
   владельцу и может быть без скидки вообще). См. точную схему в разделе
   1.4 ниже — поля и связь с `Ticket` заданы пользователем напрямую.
5. **`FestivalSponsor.tier`** — предлагаю оставить свободной строкой (как
   в макете, организатор печатает "Генеральный спонсор" сам) — не
   переспрашивал отдельно, это low-risk решение; если нужен фиксированный
   enum вместо строки — скажи, поменяю до миграции.

## 3. Миграция (после утверждения)

Одна миграция (руками SQL, как всегда в этом проекте — `prisma migrate
dev` недоступен, см. `00_DECISIONS.md`), применяется через Supabase MCP
`apply_migration`, если будет доступен в сессии реализации. RLS включается
без политик на новых таблицах — как у всех остальных таблиц проекта.

## 4. Что НЕ входит в этот план

Сервисный слой (`festival-sponsor-service.ts` и т.п.), API-роуты, реальные
React-страницы консоли фестиваля и публичной страницы, перенос самого
макета — следующие этапы, начинаются отдельной командой пользователя (по
его словам в этом же сообщении).
