# Festival Engine — сервисный слой: план разработки

Дата: 2026-09-17. Продолжение `docs/FESTIVAL_ENGINE_AUDIT.md`,
`docs/FESTIVAL_ENGINE_ER.md`, `docs/FESTIVAL_UI_TO_DB_PLAN.md` (схема уже
реализована и применена к реальной БД).

**Статус: Stage 1 и Stage 2 реализованы** (2026-09-17).

Stage 1 — `festival-service.ts`, `program-item-service.ts`, RBAC
(`isOwnerOrAdminFestival`/`hasFestivalAccess` в `access.ts`), ленивое
создание bridge-Event, `publishFestival`, 6 API-роутов `/api/festivals/*`.

Stage 2 — `festival-sponsor-service.ts`, `festival-faq-service.ts`,
`festival-expense-service.ts`, `festival-budget-service.ts`
(`getFestivalBudgetSummary` — выручка Pass на bridge-Event +
взносы спонсоров - расходы), небольшая доп-миграция
`20260917010000_festival_sponsor_amount` (`FestivalSponsor.amount`/
`currency` — решение №2, применена к реальной БД), 8 API-роутов, экспорт
общего `requireFestivalAccess` из `festival-service.ts` (переиспользован
program-item-service.ts вместо дублирования).

Stage 3 — `festival-review-service.ts` (отзыв о фестивале — РАСШИРЕНИЕ уже
существующего `Review`, требует логин, как и отзывы школ; модератор —
организатор фестиваля, не сайтовый модератор; переиспользован общий
`logModeration()`/entity `"REVIEW"`), `festival-guest-question-service.ts`
(анонимная форма без логина + анти-спам лимит по IP — доп-миграция
`20260917020000_festival_guest_question_ip`, `submitterIp`+индекс; две
независимые оси — `moderationStatus` и `answer`), 5 API-роутов.

`tsc`/`vitest` (1455 тестов, +97 с начала сервисного слоя)/`next build` —
зелёные (build дважды словил транзиентный обрыв сети до Supabase на
`/sitemap.xml`, не связано с кодом — прошло чисто при повторе). Stage 4-7
— см. ниже, не начаты.

Важное исправление в процессе реализации: `createFestivalDraft` изначально
планировался под `canCreateEvents` — оказалось, в проекте уже есть ОТДЕЛЬНЫЙ,
более узкий гейт именно для фестивалей (`isVerifiedFestivalOrganizer`,
выдаётся через одобрение `AccessRequest(FESTIVAL_ORGANIZER)`, уже
используется в `/admin/festival/layout.tsx`) — использован он, не
`canCreateEvents`.

## 0. Ключевая находка — меняет приоритеты

Сервисного слоя для `Festival` **не существует вообще**, только схема БД.
Проверено: ни одного `festival-service.ts`, ни одного API-роута
`/api/festivals/*`. Единственные три места, которые вообще трогают
`prisma.festival`/`prisma.programItem` — это старые страницы
(`passes/page.tsx`, `registrations/page.tsx`, `ticket-service.ts`), и все
три — ЧТЕНИЕ ради программы, доставшееся ещё от бывшей `FestivalDetails`.
Создать/опубликовать/отредактировать Festival сегодня нельзя никак — ни
кода, ни API, ни страницы.

**Следствие**: нельзя начинать сразу со «Спонсоров»/«Бюджета» — сначала
нужен фундамент (Stage 1), иначе не к чему привязывать остальное. План
ниже — по стадиям, каждая независимо проверяема и коммитится отдельно
(как и раньше в этой сессии).

## Stage 1 — Festival core (фундамент, блокирует всё остальное)

- **`src/server/events/festival-service.ts`** (новый):
  - `createFestivalDraft(user, input)` — название/город/даты/описание/
    площадка, `createdById = user.id`, slug генерируется как у Event.
  - `updateFestivalDraft(festivalId, user, input)`.
  - `getFestivalForEdit(festivalId, user)` / `getFestivalBySlug(slug)`
    (публичная, только видимые).
  - `listFestivalsForUser(user)` — для Хаба фестивалей.
  - `computeFestivalStatus(festival)` — чистая функция:
    `DRAFT` (`eventId == null`) / `LINKED` (`eventId` есть, bridge не
    опубликован) / `PUBLISHED` (bridge `Event.status=PUBLISHED &&
    moderationStatus=APPROVED`) — **не enum-поле, как решено в ER-доке**.
  - `archiveFestival` / `deleteFestivalDraft` (только черновик без
    публикаций — тот же принцип, что и у Event/EventSeries).
- **`src/server/events/program-item-service.ts`** (новый) — CRUD
  `ProgramItem` под конкретным `Festival`: create/update/delete/reorder,
  проверка `capacity`/`showCapacityPublicly`, опциональная привязка
  `linkedEventId`.
- **RBAC**: `isOwnerOrAdminFestival(festival, user)` в `access.ts` (по
  образцу `isOwnerOrAdmin` для Event) — `createdById` ИЛИ `ADMIN`. Доступ
  через команду (`EventTeamMember` bridge-Event) добавляется только когда
  `eventId` не `null` — до этого момента только владелец+ADMIN (уже
  зафиксировано в ER-доке как осознанное ограничение черновика).
- **Bridge-Event — ленивое создание при первом Festival Pass (решено,
  вариант A).** Прямая спецификация пользователя:
  1. `createFestivalPass(festivalId, user, input)` (новая обёртка над
     `createPass()` для контекста фестиваля) проверяет `Festival.eventId`.
  2. Если уже есть — используется он.
  3. Если нет — создаётся служебный `Event` (формат `FESTIVAL`, черновик,
     без своей публичной "продажи" — имя/город/даты зеркалят Festival) и
     сразу пишется в `Festival.eventId`.
  4. Затем создаётся сам `Pass` на этом `eventId`.
  5. Шаги 2-4 — **одна транзакция** (`prisma.$transaction`) — не может
     получиться так, что bridge создан, а Pass — нет (или наоборот).
  - Bridge создаётся ТОЛЬКО в этот момент — фестиваль, у которого ещё нет
    ни одного Pass, никакого Event не получает (не создаём заранее "на
    всякий случай").
  - Из формы Pass в макете убирается поле "На каком событии продавать" —
    в контексте фестиваля выбирать нечего, `eventId` определяется
    полностью автоматически по правилам выше. Это единственное отличие от
    того, что нарисовано в UI-прототипе — поле было основано на
    отклонённом варианте B.
  - Подтверждено пользователем отдельно: механизм "держатель Pass
    материализуется участником и в фестивале, и в каждом конкретном
    дочернем событии" (`findFestivalPassForEvent`/`issueFestivalPassEntry`,
    уже существует) полностью сохраняется и не зависит от способа
    появления bridge — он работает от `Pass.id`/`ProgramItem.linkedEventId`,
    а `Festival.eventId` для него просто "на каком событии куплен Pass".
- Zod-схемы: `src/server/events/festival-schemas.ts`.
- API: `/api/festivals`, `/api/festivals/[id]`, `/api/festivals/[id]/
  program-items`, `/api/festivals/[id]/program-items/[itemId]`.
- Тесты: `tests/events/festival-service.test.ts`,
  `tests/events/program-item-service.test.ts` (RBAC, computeFestivalStatus,
  capacity, CHECK на CRUD).

## Stage 2 — Sponsors / FAQ / Expenses (простой CRUD, одна форма на все три)

Как только Stage 1 есть — эти три модели тривиальны, один и тот же шаблон:
- `festival-sponsor-service.ts`, `festival-faq-service.ts`,
  `festival-expense-service.ts` — create/update/delete/reorder (sponsor/
  faq) или create/update/delete (expense), RBAC = `isOwnerOrAdminFestival`
  (+ доступ команды, если bridge уже есть).
- API-роуты по образцу уже существующих `/api/events/[slug]/promo-codes`.
- Доход для «Бюджета» — НЕ новый сервис, агрегирующий запрос по уже
  существующим `Ticket`/`Pass`/`FestivalSponsor` (сумма — не факт продажи
  спонсорства, спонсор либо платит организатору напрямую вне системы,
  либо это будущая доработка — см. открытый вопрос №2).

## Stage 3 — Отзывы и вопросы гостей (модерация организатором)

- Расширение существующего flow отзывов (`/api/schools/[slug]/reviews` —
  посмотреть точную структуру перед копированием) под
  `festivalId`-вариант: `submitFestivalReview(festivalId, user, {rating,
  text})`, `moderateFestivalReview(reviewId, moderator, decision)` — RBAC
  ЯВНО другой, чем у сайтовой модерации школ: `isOwnerOrAdminFestival`, не
  роль `MODERATOR`/`ADMIN` (прямое решение пользователя, уже в схеме
  комментарием).
- `festival-guest-question-service.ts`: `submitGuestQuestion` (публично,
  без авторизации — как в макете, только имя+вопрос), `moderateGuestQuestion`
  (organizer: APPROVED/REJECTED), `answerGuestQuestion` (organizer).
- Публичные роуты не требуют сессии (гость без аккаунта задаёт вопрос) —
  нужна базовая защита от спама (rate limit по IP? см. открытый вопрос №3).

## Stage 4 — Реферальные коды (атрибуция + привязка к Ticket)

- `festival-referral-code-service.ts`: CRUD (владелец — ровно один из
  Teacher/School, CHECK уже в БД, сервис только валидирует то же самое до
  запроса, чтобы не ловить голый Postgres-error), `getReferralCodeStats`
  (агрегат: количество Ticket, сумма скидок/комиссий — простой `groupBy`).
- **`issueTicket()` в `ticket-service.ts`** — расширить
  `options` необязательным `referralCode?: string`: если передан и валиден
  (активен, в пределах `startsAt`/`expiresAt`), проставить
  `referralCodeId`/снимки `referralDiscountAmount`/`referralCommissionAmount`
  на создаваемый `Ticket` — по тому же принципу, что и у `PromoCode`
  (сейчас это ручной ввод при выдаче билета организатором, не
  автоматический чекаут — в проекте нет онлайн-эквайринга, оплата
  отмечается вручную, см. `docs/PROGRESS.md`). Не пытаюсь реализовать то,
  чего нет даже у обычного `PromoCode` (расчёт скидки на чекауте) — только
  привязка+снимок, как решено пользователем.

## Stage 5 — Рассылка держателям Pass

- **НЕ через сайтовый Broadcast Composer** (`BroadcastComposer.tsx`) — тот
  инструмент общий для ВСЕХ админов и ВСЕХ Pass сайта, обычный организатор
  фестиваля туда доступа не имеет и не должен. Вместо этого — отдельная
  тонкая функция в новом `festival-broadcast-service.ts`:
  `sendFestivalPassBroadcast(festivalId, passId, user, {title, body})`,
  которая (а) проверяет `isOwnerOrAdminFestival`, (б) проверяет, что
  `passId` действительно принадлежит одному из событий, связанных с
  программой ЭТОГО фестиваля, (в) вызывает уже существующий
  `sendBroadcast()` из `broadcast.ts` с
  `audience: {kind: "SUBSCRIBERS", type: "PASS", targetId: passId}`.
- **`resolveAudience()` в `broadcast.ts`** — расширить веткой для
  `type === "PASS"`: аудитория — держатели активного (`status: "ISSUED"`)
  `Ticket` на этот `Pass` (`dancer.userId`), НЕ строки `Subscription`
  (`TARGET_EXISTS.PASS` уже добавлен в прошлой сессии, сама аудитория —
  ещё нет).
- Компонент `BroadcastComposer.tsx`/`SUBSCRIPTION_TYPE_LABELS` НЕ трогаем
  повторно — `PASS` остаётся не показан там, это осознанно (см.
  `docs/PROGRESS.md`).

## Stage 6 — Личный кабинет участника

- Не новый сервис — переиспользование уже существующего
  `findFestivalPassForEvent`/`PassAccessGrant` (`ticket-service.ts`) для
  вычисления "какие ProgramItem доступны этому Ticket/Pass". Новое —
  только страница `/profile/festivals/[slug]` (или похожий путь), которая
  собирает: `Ticket` танцора на bridge-Event фестиваля + список
  `ProgramItem`, отфильтрованный по `PassAccessGrant` этого `Pass`. QR —
  просто `ticket.id`, закодированный на клиенте (библиотека для генерации
  QR — `qrcode`/аналог, пока не установлена, см. открытый вопрос №4).

## Stage 7 — Условия возврата Pass (по большей части уже готово)

- Поля уже в схеме (`Pass.refundPolicy/refundDeadline/refundFeePercent`).
  Нужно только: (а) добавить их в Zod-схему создания/редактирования Pass
  в `pass-service.ts`/`schemas.ts` (сейчас там нет упоминания), (б) отдать
  их наружу в публичном API события/Pass, чтобы страница могла показать
  условия покупателю. Никакой отдельной "обработки возврата по правилам"
  не реализуется — `refundTicket()` уже существует (ручной, организатор
  решает сам), политика тут — только информационная, не блокирующая
  проверка (как и было решено: это "условия", не автоматический движок
  возвратов).

## 1. Порядок и способ приёмки

Как и раньше в этой сессии — предлагаю Stage 1 первым, отдельным
коммитом, с `tsc`/`vitest`/`build` после каждого стейджа, и на каждый
стейдж — короткое подтверждение перед началом следующего (не обязательно
целый раунд вопросов — где решения уже очевидны, начинаю сразу).

## 2. Решения (утверждены пользователем 2026-09-17)

1. **Bridge-Event** — ленивое автосоздание при первом `Festival Pass`,
   вариант A. Подробности перенесены в Stage 1 выше.
2. **Доход от спонсоров** — ДА, попадает в «Доход» бюджета. Следствие для
   схемы: у `FestivalSponsor` сейчас НЕТ поля суммы взноса вообще (упущено
   в прошлой миграции) — нужно добавить `amount Decimal?`/`currency
   String?` небольшой доп.миграцией в начале Stage 2, иначе агрегировать
   в «Бюджете» нечего.
3. **Спам-защита публичных форм (вопрос/отзыв гостя без авторизации) —
   нужна.** Реализуется в Stage 3: базовый rate-limit по IP (тот же
   принцип, что уже наверняка используется в проекте для других
   анонимных форм — проверить перед реализацией, не изобретать новый
   подход, если есть существующий `rate-limit`-хелпер).
4. **QR-библиотека для Stage 6 — можно добавить** (`qrcode` или аналог,
   уточнить самую популярную/поддерживаемую опцию перед `npm install`).

Все вопросы плана закрыты — можно начинать со Stage 1.
