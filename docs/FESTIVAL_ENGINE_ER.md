# Festival Engine — ER-модель (Stage 2)

Дата: 2026-09-16. Продолжение `docs/FESTIVAL_ENGINE_AUDIT.md`.

**Статус: Stage "Prisma models + migration" реализован** (2026-09-16,
коммит после этого документа) — схема (`Festival`/`ProgramItem`,
`FestivalDetails` удалена), миграция `20260916140000_festival_engine`
(написана, **не применена к реальной БД** — Supabase MCP недоступен в этой
сессии, применить вручную `apply_migration` перед деплоем, см.
`docs/00_DECISIONS.md` "Инфраструктура БД"), весь серверный код/тесты,
ссылавшиеся на старые модели, обновлены (`event-service.ts`, `schemas.ts`,
`ticket-service.ts`, публичная `/events/[slug]`, `passes/page.tsx`,
`registrations/page.tsx` — там нашёлся реальный сломанный вызов
`prisma.eventProgramItem`, не только комментарий), мёртвый код Wizard'а
(`StepFestivalProgram.tsx`, шаг `festivalProgram`, `WizardProgramItem`)
удалён, `FESTIVAL` убран из выбора формата в Event Wizard/Template
(`WIZARD_SELECTABLE_EVENT_FORMATS`), но остался в `ALL_EVENT_FORMATS`
(фильтры/уведомления) и в реестре меток/иконок. `npx tsc --noEmit`,
`npx vitest run` (1358 тестов), `npx next build` — все зелёные.

Ниже — исходный документ решений (не менялся, всё ещё актуален):

## Согласованная история решений (коротко, для будущих сессий)

1. Festival — first-class сущность верхнего уровня, НЕ `Event(format=FESTIVAL)`.
2. `FestivalDetails` удаляется. `EventProgramItem` переименовывается в
   `ProgramItem`, переезжает с `festivalDetailsId → FestivalDetails` на
   `festivalId → Festival` (миграция — `ALTER TABLE ... RENAME`, id не
   меняются, `PassAccessGrant`/`Teacher`-связи не требуют пересчёта).
3. Прямой `ProgramItem.competitionId` **не заводится** — связь с JNJ
   остаётся двухшаговой: `ProgramItem.linkedEvent → Event.competition`
   (без изменений, тот же путь, что и сегодня).
4. `PassAccessGrant`, `Pass`, `TicketType`, `Ticket`, `PromoCode`,
   `EventTeamMember`, RBAC — не меняются.
5. `Festival.eventId` — nullable bridge к `Event` (по образцу
   `Competition.eventId`). Публикация/модерация/SEO/Pass-продажа Festival
   **продуктово требуют** bridge (гейт в сервисном слое), но в БД поле
   остаётся nullable — черновик Festival можно готовить без bridge.
6. `Festival` получает собственный `slug` и собственную публичную страницу
   `/festivals/[slug]` — НЕ переиспользует `/events/[slug]`.
7. `Festival.status`/`moderationStatus` — НЕ заводятся отдельно. Видимость
   гейтится статусом привязанного `Event` (см. п.5).
8. `EventFormat.FESTIVAL` — enum-значение остаётся, но меняет смысл: теперь
   это метка "этот Event — bridge-инфраструктура Festival", не "Event
   содержит FestivalDetails". Значение убирается из пользовательского
   выбора формата в Event Wizard (обычное создание события больше не
   предлагает "Фестиваль" как тип) — bridge-Event создаётся только изнутри
   Festival-флоу (автоматически или на шаге публикации).
9. Мёртвый код Wizard'а (`StepFestivalProgram.tsx`, `festivalProgram`-шаг,
   `festivalDetailsInputSchema`/`festivalProgramItemSchema`,
   `draft.festival`) удаляется в том же проходе, что и схема — не
   оставляется как temporarily-dead.
10. Тестовые данные в БД — не критичны, миграция не обязана их бережно
    сохранять (прямое разрешение пользователя).

## Явно ВНЕ СКОУПА этого ER-прохода (не выдумываю, не решаю сам)

Следующее упоминалось в более ранней гипотезе ("Festival ├── FestivalDay ├──
FestivalVenue ├── FestivalArtist ├── FestivalTeam ├── FestivalSettings"), но
пользователь **не подтвердил** ни один из них как отдельную модель в
финальном списке решений — поэтому они НЕ включены в ER ниже как факт:

- **FestivalDay** — день как объект первого класса (для day-level Pass,
  day-level статистики). Сегодня день — производная от
  `ProgramItem.startTime` (та же логика группировки, что уже работает на
  публичной странице). Остаётся так же, пока не подтверждено иное (открытый
  вопрос §7.3 из `FESTIVAL_ENGINE_AUDIT.md`).
- **FestivalVenue/Stage** — параллельные залы. `ProgramItem` пока без поля
  `room` (можно добавить как `String?` по аналогии с
  `MasterclassSession.room`, если подтвердится необходимость — открытый
  вопрос §7.2).
- **FestivalArtist** — не заводится, `Teacher` (nullable `schoolId`)
  переиспользуется как есть (открытый вопрос §7.6 про доп. поля
  country/socials — не решён).
- **FestivalTeamMember** — не заводится. Team-доступ к Festival
  переиспользует существующий `EventTeamMember` привязанного bridge-Event
  (тот же принцип, что уже согласован в раунде B+). **Важное следствие**:
  пока у Festival нет bridge-Event (черновик), team-доступ к
  редактированию — только через `Festival.createdById` (владелец) +
  сайтовый ADMIN, ровно как `isOwnerOrAdmin()` сегодня работает для Event —
  приглашать со-редакторов до появления bridge-Event нельзя. Если это
  неприемлемо — отдельный вопрос, см. конец документа.
- **FestivalSettings** — не заводится отдельной моделью; настройки, если
  понадобятся, — обычные nullable-поля на самой `Festival` (не отдельная
  1:1-таблица, т.к. паттерн "деталь-по-формату" здесь неприменим — у
  Festival нет "формата", который бы диктовал таблицу).

---

## A. Entities (новые/изменённые)

```
Festival        — НОВАЯ
ProgramItem     — ПЕРЕИМЕНОВАНА из EventProgramItem (структура сохранена)
FestivalDetails — УДАЛЕНА
```
Все остальные сущности (Event, Competition, Pass, PassAccessGrant, Ticket,
TicketType, EventTeamMember, Teacher, MasterclassSession, ...) — без
структурных изменений.

## B/C/D/E/F/G/H/I/J — Festival

| Поле | Тип | Nullable | PK/FK/Unique | Комментарий |
|---|---|---|---|---|
| id | String (cuid) | нет | PK | |
| slug | String | нет | Unique | собственный публичный идентификатор, `/festivals/[slug]` |
| name | String | нет | | |
| description | String? | да | | |
| cityId | String | нет | FK → City, onDelete: (как у Event — RESTRICT по умолчанию Prisma) | для листинга/фильтра городов, тот же паттерн, что Event/Competition |
| venueName | String? | да | | **свободный текст**, как `Event.venueName`/`Competition.venue` — формальной Venue-модели нет нигде в проекте (см. "вне скоупа" выше), заводить только для Festival было бы первым таким прецедентом |
| startsAt | DateTime | нет | | для листинга/сортировки (как `Event.startsAt`) |
| endsAt | DateTime? | да | | |
| createdById | String | нет | FK → User, onDelete: не задаётся явно (как `Event.createdById` — Prisma default `NO ACTION`, см. QA-риск в комментарии `EventTeamMember`, тот же класс проблемы, не блокирует) | |
| eventId | String? | да | FK → Event, **@unique**, onDelete: SetNull (симметрично `Event.seriesId`, чтобы удаление/отвязка Event не роняло Festival) | bridge, п.5 решений |
| createdAt/updatedAt | DateTime | нет | | стандартные |

Relations: `programItems ProgramItem[]`, `event Event? @relation(...)`.

**Lifecycle/statuses (п. K/L):** Festival НЕ имеет собственного enum
статуса. Эффективное состояние вычисляется, не хранится:
```
DRAFT      — eventId == null
LINKED     — eventId != null, но bridge Event.status != PUBLISHED || moderationStatus != APPROVED
PUBLISHED  — eventId != null, bridge Event.status == PUBLISHED && moderationStatus == APPROVED
```
Это НЕ enum-поле в БД — производное значение в сервисном слое (совпадает с
принципом "не заводить вторую publication-систему", п.7 решений).

## B/C/D/E/F/G/H/I/J — ProgramItem (было EventProgramItem)

| Поле | Было | Станет |
|---|---|---|
| id | String @id | без изменений |
| festivalDetailsId → FestivalDetails | FK, `onDelete: Cascade` | **`festivalId String` → `Festival`, `onDelete: Cascade`** (единственное структурное изменение) |
| title, type, startTime, endTime, teacherId→Teacher, linkedEventId→Event("ProgramItemLinkedEvent"), order | без изменений | без изменений |
| passAccessGrants PassAccessGrant[] | без изменений | без изменений |

`FestivalProgramItemType` enum (`WORKSHOP\|PARTY\|COMPETITION\|OTHER`) —
без изменений, значения и семантика те же.

Индексы: `@@index([festivalId])` (было `festivalDetailsId`),
`@@index([teacherId])`, `@@index([linkedEventId])` — без изменений состава,
только имя первого.

## M. Integration with existing entities (диаграмма связей)

```
City 1───N Festival
User 1───N Festival (createdById)
Festival 1───1 Event (eventId, nullable, UNIQUE)         ← bridge, как Competition.eventId

Festival 1───N ProgramItem (festivalId, CASCADE)

ProgramItem N───1 Teacher (teacherId, nullable)
ProgramItem N───1 Event (linkedEventId, nullable, "ProgramItemLinkedEvent")
  Event 1───1 Competition (competition, nullable)         ← JNJ виден только двухшаговым путём, БЕЗ прямой FK

ProgramItem 1───N PassAccessGrant (programItemId, nullable — без изменений)
PassAccessGrant N───1 Pass (passId)                       ← Pass живёт на bridge-Event Festival, не на самой Festival
Pass N───1 Event (eventId)                                ← без изменений

Event 1───N EventTeamMember                               ← Festival team = team bridge-Event (см. "вне скоупа")
Event 1───N Ticket / TicketType / PromoCode                ← без изменений
```

Ключевой факт диаграммы: **Festival не имеет НИ ОДНОЙ прямой связи с
Ticket/Pass/EventTeamMember/Competition** — все они по-прежнему живут на
`Event`, до которого Festival дотягивается ровно одним прыжком
(`Festival.event`) или, для Competition, двумя (`ProgramItem.linkedEvent.competition`).
Это ровно то, что требовалось: Festival — оркестрирующий контейнер,
не дублирующий ни один из существующих движков.

## Public-facing последствия (не в этом ER, но затронуто им напрямую)

- `/events/[slug]/page.tsx` теряет секцию "Программа фестиваля" (программа
  туда больше не запрашивается).
- Новая `/festivals/[slug]/page.tsx` — агрегирует `Festival.programItems`,
  bridge-Event для Pass-покупки, `linkedEvent` для отдельно продаваемых
  пунктов. Видимость = вычисляемый статус `PUBLISHED` выше.
- `sitemap.ts` — второй источник `prisma.festival.findMany` (только
  `PUBLISHED`).

---

## Единственный открытый вопрос ER-уровня, который остался

**Team-доступ к Festival-черновику без bridge-Event.** Я зафиксировал выше
(раздел "вне скоупа"): пока у Festival нет привязанного Event, соредакторов
пригласить нельзя — доступ есть только у `createdById`+ADMIN, т.к.
`EventTeamMember` физически висит на Event, которого ещё нет. Это
осознанное ограничение черновика или нужно что-то отдельное для
до-bridge-стадии (например, временный `Festival.createdById`-only режим
специально помечается в UI как "пригласите соредакторов после привязки
события")? Если устраивает как есть — ER считаю финальным, можно двигаться
к Stage 3 (UI-прототип) по твоей команде.

Схему/миграции/код не менял.
