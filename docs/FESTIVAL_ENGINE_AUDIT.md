# Festival Engine — аудит существующей архитектуры

Дата: 2026-09-16
Статус: Stage 1 (AUDIT). Код не менялся. Миграции не создавались.
Источники: `prisma/schema.prisma` (3116 строк, прочитан целиком в релевантных
разделах), `docs/EVENTS_ENGINE_AUDIT.md`, `docs/00_DECISIONS.md`,
`src/server/events/access.ts`, `src/lib/events/event-type-registry.ts`,
`src/app/admin/festival/**`, `src/app/admin/content/[id]/layout.tsx`,
`src/components/admin/sidebars/FestivalAdminSidebar.tsx`.

Этот документ **не дублирует** `docs/EVENTS_ENGINE_AUDIT.md` — он его
предполагает прочитанным (там уже зафиксировано, что `FestivalDetails`/
`EventProgramItem` реализованы, Stage 6, 2026-09-15) и **идёт на уровень
глубже** конкретно по вопросу Festival Engine.

---

## 1. Existing Architecture — общая картина

Проект — три слоя в одном Next.js/Prisma/PostgreSQL(Supabase) репозитории:

1. **Events Engine** (Слой 1) — `Event` и всё вокруг него (Party/Masterclass/
   Festival/Contest/Intensive/Social/OpenAir/Practice/Other), RBAC —
   `User.role` + `AccessRequest`-верификация + per-Event `EventTeamMember`.
2. **Competition/JNJ Engine** (Слой 3) — `Competition` и ~35 связанных
   моделей (Division/Round/Heat/Draw/JudgeScore/...), **полностью
   независимый permission-based RBAC** (`Permission`/`Role`/
   `RolePermission`/`UserRoleAssignment`/`CompetitionMember`) — см.
   `docs/00_DECISIONS.md` D2, "Два независимых RBAC вместо одного".
3. **Ticket/Pass Engine** (условно "Слой 2") — `Pass`/`PassTemplate`/
   `PassPriceTier`/`PassAccessGrant`/`TicketType`/`Ticket`/`PromoCode` —
   привязан к `Event`, не к Competition.

Мост между Слоем 1 и Слоем 3 — ровно одно поле:
`Competition.eventId String? @unique` (nullable, опциональная афишная
карточка, `docs/00_DECISIONS.md` D3). Никакой другой связи между слоями нет.

**Festival сегодня — это `Event` с `format = FESTIVAL`, не что-то отдельное.**
У него уже есть собственная 1:1-таблица деталей (`FestivalDetails`) и
программа (`EventProgramItem[]`) — тот же паттерн, что `PartyDetails`
(PARTY) и `MasterclassDetails`+`MasterclassSession[]` (MASTERCLASS). Это
реализовано и работает (Wizard-шаг "Программа", публичная страница
показывает программу по дням) — не черновик, не заглушка.

Отдельно существует `/admin/festival` — **это заглушка** (один пункт меню,
текст "система в разработке"), гейтится ДРУГИМ флагом верификации
(`isVerifiedFestivalOrganizer`, из `AccessRequest(type: FESTIVAL_ORGANIZER)`),
и сегодня не даёт вообще никакой дополнительной функциональности сверх той,
что уже доступна через `/admin/content/[id]` для любого события формата
FESTIVAL. Это принципиально важный факт — см. §5 "Конфликт A".

---

## 2. Relevant Existing Models (полные, прочитаны из schema.prisma)

### 2.1 Event (`schema.prisma:474`)
```
Event {
  id, slug, title, cityId → City, schoolId? → School, organizerName?,
  format: EventFormat, eventType: EventType (REGULAR/CONTEST),
  level: DanceLevel, startsAt, endsAt?,
  venueName: String, venueAddress?: String, latitude?: Float, longitude?: Float,
  capacity?: Int,
  registrationEnabled: Boolean,
  description?, photoUrl? (денормализованный кэш EventMedia.isMain),
  priceText?, externalLinkUrl?, ticketingMode: EventTicketingMode,
  tags: String[],
  status: EventStatus (DRAFT/PUBLISHED/ARCHIVED),
  certainty: EventCertainty (TENTATIVE/CONFIRMED),
  moderationStatus: ModerationStatus (PENDING/APPROVED/REJECTED),
  createdById → User, moderatedById? → User, isArchived,
  seriesId? → EventSeries, occurrenceDate? (recurring events, copy-on-write),

  attendances[], achievements[], competition? (1:1 → Competition, обратная связь D3),
  registrations: EventRegistration[], teamMembers: EventTeamMember[],
  partyDetails?, masterclassDetails?, festivalDetails?,
  priceOptions[], ticketTypes[], passes[], tickets[], promoCodes[], media[],
  linkedFromProgramItems: EventProgramItem[] («ProgramItemLinkedEvent» — обратная связь)
}
```
**Важно: `venueName`/`venueAddress`/`latitude`/`longitude` — простые поля
строкой/числом прямо на `Event`. Отдельной модели `Venue`/`Location` НЕТ
нигде в схеме** (см. §2.7).

### 2.2 FestivalDetails / EventProgramItem (`schema.prisma:1120-1160`, Events Engine Stage 6)
```
FestivalDetails {
  id, eventId (1:1, @unique) → Event
  programItems: EventProgramItem[]
}

EventProgramItem {
  id, festivalDetailsId → FestivalDetails,
  title: String,
  type: FestivalProgramItemType (WORKSHOP | PARTY | COMPETITION | OTHER),
  startTime: DateTime, endTime?: DateTime,
  teacherId? → Teacher,
  linkedEventId? → Event («ProgramItemLinkedEvent»),
  order: Int,
  passAccessGrants: PassAccessGrant[]
}
```
Плоский список, **без** понятия "зал"/"сцена"/"день" как отдельной строки —
день определяется исключительно датой в `startTime`. Ссылка на "настоящее"
дочернее событие (workshop/party как отдельный Event, или competition через
`Event.competition`) уже реализована через `linkedEventId` — комментарий в
схеме прямо говорит: "не заводим отдельный `linkedCompetitionId`, `Event`
уже покрывает оба случая".

### 2.3 Ticket/Pass (`schema.prisma:678-1055`)
```
TicketType (простой билет НА ОДНО событие: name, price?, quantity?, soldQuantity, salesStart/EndAt, status: PassStatus, sortOrder)
Pass (предложение доступа: type: PassType (FULL_PASS/PARTY_PASS/WORKSHOP_PASS/DAY_PASS/COMPETITION_PASS/VIP_PASS/FREE_PASS/CUSTOM), price?, quantity?, status: PassStatus, allowMultipleEntry)
PassTemplate (заготовка Pass, переиспользуемая между событиями одного User)
PassPriceTier (Early Bird/Regular/Late — по Pass)
PassAccessGrant (passId + РОВНО ОДНО ИЗ: programItemId → EventProgramItem, ИЛИ masterclassSessionId → MasterclassSession; пусто у Pass = доступ ко всему)
PromoCode / PromoCodePass (скидки, схема заведена, механика расчёта — нет)
Ticket (универсальный: eventId, passId? XOR ticketTypeId? XOR оба null (passless fallback), dancerId, status, price-снимок, isPaid/paidAt)
```
`PassType.DAY_PASS` — значение enum **уже существует**, но
инфраструктуры "весь день" НЕТ: `PassAccessGrant` умеет ссылаться только на
конкретный `programItemId`/`masterclassSessionId`, не на "все пункты дня N".
Сегодня организатору пришлось бы вручную создавать грант на каждый пункт
программы этого дня по отдельности, чтобы реализовать `DAY_PASS` буквально.

### 2.4 EventTeamMember (`schema.prisma:1308-1337`)
```
EventTeamMember {
  eventId → Event, userId → User, role: EventTeamRole (MANAGER|EDITOR|CHECK_IN|FINANCE),
  invitedById → User, createdAt
  @@unique([eventId, userId])
}
```
Комментарий в схеме прямо фиксирует: **все 4 роли сегодня дают одинаковый
эффективный доступ** — это намеренно минимальная модель ("по прямому
требованию задания", `docs/EVENTS_ENGINE_AUDIT.md` Stage 5). Проверка доступа
(`src/server/events/access.ts`):
```ts
isOwnerOrAdmin(event, user) = event.createdById === user.id || user.role === "ADMIN"
hasEventAccess(event, user) = isOwnerOrAdmin(...) || existsEventTeamMember(eventId, userId)
```
Область действия — **один конкретный Event**, включая Event формата FESTIVAL
(отдельной модели team для фестиваля нет и не требуется — Festival это уже
Event).

### 2.5 Teacher (`schema.prisma:250-264`)
```
Teacher { id, name, photoUrl?, bio?, schoolId? → School (nullable — "может быть без школы, приглашённый преподаватель"), isActive,
  schedules: ClassSchedule[], masterclassSessions: MasterclassSession[], festivalProgramItems: EventProgramItem[] }
```
Комментарий у `EventProgramItem`/`MasterclassSession` прямо документирует
намеренное решение: "не дублируется отдельной сущностью" — `Teacher` уже
служит и школьным преподавателем, и фестивальным артистом/лектором.
**Полей `country`/`socialLinks`/`internationalArtist`-флага у `Teacher` НЕТ.**

### 2.6 Competition (`schema.prisma:1815-1856`) — только релевантные Festival Engine поля
```
Competition {
  id, name, slug, organizerName?, venue?: String, cityId? → City, timezone,
  startAt?, endAt?, status: CompetitionStatus, templateId? → CompetitionTemplate,
  eventId? @unique → Event (D3, опциональная афишная карточка),
  ... (Division/Round/Heat/Draw/JudgeScore и т.д. — не нужны Festival Engine напрямую)
}
```
`Competition.venue` — тоже просто `String?`, как и `Event.venueName`. **Ни
одна из ~95 моделей проекта не моделирует площадку/зал как отдельную
сущность** — единственное исключение: `MasterclassSession.room: String?`
(свободный текст, не FK).

### 2.7 RBAC / Access (два независимых механизма, уже задокументированы в D2)
- Layer 1 (Events, включая Festival): `User.role` (DANCER/SCHOOL_REP/
  ORGANIZER/MODERATOR/ADMIN) + флаги верификации `isVerifiedEventOrganizer`/
  `isVerifiedFestivalOrganizer`/... (из одобренных `AccessRequest`) +
  per-Event `isOwnerOrAdmin`/`hasEventAccess`/`EventTeamMember`.
- Layer 3 (Competition/JNJ): `Permission`+`Role`+`RolePermission`+
  `UserRoleAssignment`(глобально)+`CompetitionMember`(в рамках одного
  Competition). Мост — только `User.role === "ADMIN"` даёт полный набор
  Layer-3-прав (`src/server/rbac/actor.ts`, не проверялся построчно в этом
  аудите, но задокументирован в D2).
- **Эти две системы НЕ объединены и объединять их — прямо против решения
  D2** ("ломать эту систему... means переписывать `src/lib/auth.ts` и все
  API слоя 1" — признано более дорогим, чем вести два RBAC).

### 2.8 EventTemplate / EventSeries (`schema.prisma:1352-1553`, ещё не закоммичено)
Только что добавлены для **регулярных** событий (например, "Bachata Friday
каждую пятницу"). Ключевое архитектурное решение, прямо записанное в схеме:
**нет runtime-наследования** Template → Series → Event — оба используются
только В МОМЕНТ генерации, чтобы один раз записать значения в обычный
`Event` (`copy-on-write`, тот же принцип, что и `JudgingCriterionCatalog` →
`FinalCriterion`, см. `docs/00_DECISIONS.md` A32). После генерации —
самостоятельный `Event`, изменения шаблона задним числом не пересчитываются.
Это **не рассчитано** на "ежегодный фестиваль, похожий на прошлогодний" —
`EventSeries`/`recurrence.ts` заточены именно под периодическую генерацию по
календарному правилу (еженедельно/ежемесячно), не под "раз в год, вручную
запускаемое клонирование".

---

## 3. Existing Reusable Functionality (что уже решает то, что просит Festival Engine)

| Что просит задача | Уже существует как | Комментарий |
|---|---|---|
| Многодневная структура фестиваля | `Event.startsAt/endsAt` (охватывает несколько дней) + `EventProgramItem.startTime` (абсолютный DateTime, день считается по дате) | День — производная величина, не хранится отдельно |
| Program Item → Event / Competition / Standalone | `EventProgramItem.linkedEventId? → Event`, а через `Event.competition` — и Competition (двухшаговая связь), `type=OTHER` без `linkedEventId` — standalone | Уже реализовано полностью, без новой FK на Competition |
| Artists/Teachers | `Teacher` (nullable `schoolId`, уже используется `EventProgramItem.teacherId`) | Нет country/socials — см. §5 вопрос |
| Festival-specific Team | `EventTeamMember` (per-Event, Festival — Event) | Все роли сегодня равнозначны |
| Tickets/Passes/Day Pass (частично) | `Pass`/`PassAccessGrant`/`TicketType`/`Ticket` | `DAY_PASS` как enum есть, механики "весь день одним грантом" нет |
| Publication | `Event.status`+`moderationStatus`+`certainty` (три независимые оси) | Уже покрывает DRAFT/PUBLISHED/ARCHIVED + модерация + TENTATIVE/CONFIRMED |
| Per-festival admin console | `/admin/content/[id]` (`EventDashboardLayout` — общий заголовок/вкладки/access-check, уже включает Обзор/Участники/Команда/Статистика для ЛЮБОГО формата, включая FESTIVAL) | См. Конфликт A — пересекается с `/admin/festival` |
| Venue | **Не существует нигде.** `Event.venueName`/`venueAddress` — строки, `Competition.venue` — строка, `MasterclassSession.room` — строка | Единственный прецедент "зала" — свободный текст `room` у `MasterclassSession`, не FK |

---

## 4. Existing Relations Snapshot (ER, только факты, без предложений)

```
City 1───N Event
City 1───N Competition
Event 1───1 FestivalDetails (nullable, только когда format=FESTIVAL)
FestivalDetails 1───N EventProgramItem
EventProgramItem N───1 Teacher (nullable)
EventProgramItem N───1 Event ("linkedEvent", nullable — дочернее событие)
Event 1───1 Competition (nullable, обратная сторона — Competition.eventId @unique)
Event 1───N EventTeamMember
Event 1───N Pass
Pass 1───N PassAccessGrant
PassAccessGrant N───1 EventProgramItem (nullable) ИЛИ N───1 MasterclassSession (nullable) — ровно одно из двух
Event 1───N TicketType
Event 1───N Ticket
Ticket N───1 Pass (nullable) ИЛИ N───1 TicketType (nullable) ИЛИ ни то ни другое (passless)
Event N───1 EventSeries (nullable, recurring)
Competition N───1 CompetitionTemplate (nullable)
Competition 1───N Division ... (Layer 3, дальше не разворачивается — не нужно Festival Engine)
```

---

## 5. Potential Conflicts (обнаружено при аудите — НЕ решено, требует ответа)

### Конфликт A — два параллельных "festival"-интерфейса без определённой границы
`/admin/content/[id]` уже полностью работает для Event формата FESTIVAL
(создание через Wizard, программа, Pass/TicketType, Team, Статистика).
Отдельно существует `/admin/festival` — самостоятельный раздел верхнего
уровня со своим сайдбаром, гейтящийся ДРУГИМ флагом
(`isVerifiedFestivalOrganizer` ≠ `isVerifiedEventOrganizer`), сегодня не
дающий вообще ничего сверх уже перечисленного. Задача просит "Festival
Dashboard" — неясно, это (A) доработка уже рабочей `/admin/content/[id]`
для формата FESTIVAL, (B) наполнение отдельного `/admin/festival` как
агрегированного хаба ПО ВСЕМ фестивалям организатора (список
разных Event(FESTIVAL), статистика по каждому), или (C) оба, где (B) — это
список, из которого попадаешь в (A). Выбор определяет, где физически будет
жить новый UI, и не создаём ли мы дублирующий вход в те же данные.

### Конфликт B — предложенная `FestivalVenue` вводит паттерн, которого нет нигде в проекте
Ни у `Event`, ни у `Competition`, ни у `MasterclassSession` нет формальной
модели площадки — везде свободный текст (`venueName`/`venue`/`room`).
Введение `FestivalVenue` как отдельной сущности с FK было бы **первым**
такого рода в кодовой базе. Это оправдано, только если реально нужны
**параллельные** залы/сцены (несколько мероприятий одновременно в разных
местах) — вопрос был задан ранее в сессии (см. §6 Q2) и остаётся открытым.
Если параллельных залов нет — `EventProgramItem.room: String?` (по аналогии
с уже существующим `MasterclassSession.room`) полностью закрывает
потребность без новой модели.

### Конфликт C — предложенная `FestivalArtist` дублирует `Teacher`
Комментарий в самой схеме прямо фиксирует осознанное решение НЕ заводить
отдельную сущность "артист фестиваля" — `Teacher` (с `schoolId = null` для
приглашённых) уже играет эту роль и уже подключена к
`EventProgramItem.teacherId`. Новая параллельная модель напрямую
противоречила бы этому уже принятому и закомментированному в коде решению.
Реальный пробел — не отсутствие сущности, а отсутствие полей (`country`,
`socialLinks`) у `Teacher`, если они нужны для международных артистов.

### Конфликт D — предложенная `FestivalTeamMember` дублирует `EventTeamMember`
Festival — это `Event`. `EventTeamMember` уже скоуплен на `Event` и уже
покрывает "команда одного события", включая формат FESTIVAL. Отдельная
`FestivalTeamMember` была бы прямым дублированием модели совместного
управления, которое сам пользователь просил не создавать (см. постановку
задачи, §"КРИТИЧЕСКИЕ ОГРАНИЧЕНИЯ" — "не создавать дубликаты Registration/
Team"). Если нужны festival-специфичные роли (например, "Stage Manager",
"Workshop Check-in"), это расширение `EventTeamRole`, не новая модель.

### Конфликт E — предложенная `FestivalProduct` дублирует Pass/TicketType
Уже полностью реализовано (`Pass`/`PassAccessGrant`/`TicketType`/`Ticket`).
Единственный реальный пробел — гранулярность "весь день" (см. §3, `DAY_PASS`
существует как enum-значение, но не как механика). Новая параллельная
сущность не нужна — нужно (если требуется) расширение существующей модели
доступа днём/`FestivalDay`.

### Конфликт F — "День фестиваля" не существует как сущность, только как производная от даты
Если день нужен ТОЛЬКО для отображения программы по датам — уже работает
(текущая публичная страница фестиваля, по данным `EVENTS_ENGINE_AUDIT.md`,
уже группирует программу по дням из `startTime`). Если день нужен как
объект первого класса (для `DAY_PASS`-грантов, для day-level статистики,
для явного планирования "у нас 4 дня, вот номера") — нужна новая модель
(`FestivalDay`), которой сегодня нет.

### Конфликт G — двойной RBAC не позволяет "просто дать доступ" к фестивалю с конкурсом внутри
Если фестиваль включает JNJ-конкурс (`EventProgramItem.type=COMPETITION` →
`linkedEvent` → `Event.competition`), команда фестиваля
(`EventTeamMember`) НЕ получает автоматически никаких прав в
Competition Engine (`CompetitionMember` — отдельное назначение, по
дизайну D2). Это не баг, а прямое следствие уже принятого решения "два
независимых RBAC" — но стоит явно подтвердить, что это ожидаемое поведение
для Festival Engine, а не то, что нужно "исправить" интеграцией.

### Конфликт H — "FestivalPublication" как отдельный механизм не имеет обоснования
`Event.status`/`moderationStatus`/`certainty` уже полностью управляют
публикацией ЛЮБОГО Event, включая FESTIVAL, тремя независимыми осями.
Если задача не называет конкретный сценарий, который эти три оси не
покрывают, третий (уже четвёртый) независимый механизм публикации будет
избыточным усложнением (прямо против CLAUDE.md §49 "не добавляй лишние
оси состояния" по духу, и против явного требования задачи "не создавай
второй механизм публикации без необходимости").

---

## 6. Recommended Integration Points (факты + минимально рискованные точки расширения, НЕ окончательное решение)

1. **Festival = `Event` с `format=FESTIVAL`** — не новая сущность верхнего
   уровня. `FestivalDetails`/`EventProgramItem` — расширяются, не
   заменяются.
2. **Program**: `EventProgramItem` остаётся источником истины программы;
   если нужны залы — добавить `room: String?` (аналог `MasterclassSession`,
   без новой модели) ИЛИ `stageId? → FestivalStage` (новая модель, если
   параллельные залы — подтверждённое требование, см. Конфликт B).
3. **Days**: если нужен объект первого класса — новая модель `FestivalDay`
   (`festivalDetailsId`, `date`, `order`), `EventProgramItem.dayId?` +
   `PassAccessGrant.festivalDayId?` как третий вариант гранта (наравне с
   `programItemId`/`masterclassSessionId`).
4. **Competition-связь**: НЕ заводить прямой FK
   `EventProgramItem.competitionId` — уже есть двухшаговый путь
   `linkedEventId → Event.competition`, он согласован с D3 и не требует
   изменений.
5. **Artists**: расширить `Teacher` полями (`country?`, `socialLinks?
   Json`), не заводить `FestivalArtist`.
6. **Team**: расширить `EventTeamRole` enum новыми значениями при
   необходимости (например `STAGE_MANAGER`), не заводить
   `FestivalTeamMember`.
7. **Tickets/Passes**: переиспользовать `Pass`/`PassAccessGrant` как есть;
   `DAY_PASS`-механику реализовать через `FestivalDay` (см. п.3), если день
   как сущность будет подтверждён.
8. **Publication**: переиспользовать `Event.status`/`moderationStatus`/
   `certainty` без изменений.
9. **Admin UI**: развивать существующий `EventDashboardLayout`
   (`/admin/content/[id]`) для FESTIVAL-специфичных вкладок (Дни/Программа/
   Артисты), НЕ дублировать в параллельном `/admin/festival` — если только
   не подтверждено, что `/admin/festival` должен стать агрегированным
   хабом (Конфликт A).
10. **RBAC**: не трогать D2 (два независимых RBAC остаются) — Festival Team
    работает только в границах Layer 1, Competition-доступ по-прежнему
    отдельно через `CompetitionMember`.

---

## 7. Open Architectural Questions (требуют ответа до ER/UI/implementation)

Ниже — вопросы, от которых зависит структура БД. Часть уже была поднята в
предыдущем раунде `grill-me` этой сессии (перечислены здесь ещё раз, т.к.
задача явно требует зафиксировать их в этом документе) — плюс новые,
обнаруженные при более глубоком чтении кода.

1. **Назначение `/admin/festival`** (Конфликт A) — доработка
   `/admin/content/[id]` для FESTIVAL, отдельный агрегированный хаб, или
   оба?
2. **Параллельные залы** (Конфликт B) — нужна ли новая сущность
   `FestivalStage`/`Venue`, или достаточно `room: String?` на
   `EventProgramItem`, как уже сделано у `MasterclassSession`?
3. **День как сущность первого класса** (Конфликт F) — нужен ли
   `FestivalDay` (для day-level Pass/статистики/явного планирования), или
   достаточно производной даты из `EventProgramItem.startTime`, как уже
   работает публичная страница?
4. **Гранулярность Pass** (Конфликт E) — если день нужен (вопрос 3), нужен
   ли `PassAccessGrant.festivalDayId` как третий вариант гранта?
5. **Capacity/запись на конкретный workshop** — нужен ли лимит мест и
   отдельная запись на пункт программы (мини-Registration), независимо от
   того, что Pass уже куплен, или пока это не проблема?
6. **Артисты** (Конфликт C) — расширение `Teacher` полями (country/
   socials) или в текущей итерации не требуется вообще?
7. **Door check-in/сканирование** — в объёме этой итерации или отдельная
   будущая задача?
8. **Festival Team роли** (Конфликт D) — расширение `EventTeamRole` новыми
   значениями (Stage Manager, Workshop Check-in) или существующих
   MANAGER/EDITOR/CHECK_IN/FINANCE достаточно?
9. **Повторяемость по годам** — нужен ли механизм "клонировать фестиваль
   как черновик на новый год", отдельный от `EventSeries`
   (которая рассчитана на еженедельную генерацию, не годовую)?
10. **`FestivalPublication`** (Конфликт H) — есть ли конкретный сценарий,
    который `Event.status`/`moderationStatus`/`certainty` не покрывают?

---

## 8. Что НЕ делается в Stage 1

- Не создана ER-модель (`docs/FESTIVAL_ENGINE_ER.md`) — Stage 2, после
  ответов на §7.
- Не создан UI-прототип — Stage 3, после ER.
- Не создана ни одна миграция.
- Не изменён ни один существующий файл кода.
