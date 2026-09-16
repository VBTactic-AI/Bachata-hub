import type { EventFormat, EventRegistrationStatus, EventStatus, ModerationStatus } from "@prisma/client";

// Человекочитаемые подписи EventRegistrationStatus — раньше были продублированы
// (2026-09-15, §19 Statistics обнаружило это при добавлении 4-го места
// использования) в EventRegistrationStatusSelect.tsx, registration-export.ts
// и registrations/page.tsx. Единый источник, остальные три — импортируют.
export const EVENT_REGISTRATION_STATUS_LABELS: Record<EventRegistrationStatus, string> = {
  REGISTERED: "Зарегистрирован",
  CONFIRMED: "Подтверждён",
  WAITLIST: "Лист ожидания",
  CANCELLED: "Отменил сам",
  REJECTED: "Отклонён",
  NO_SHOW: "Не пришёл",
};

// Тот же список значений enum'а — раньше отдельно повторялся в трёх местах
// (валидация ?status= в page.tsx и двух API-роутах) как литеральный массив.
export const EVENT_REGISTRATION_STATUS_VALUES = Object.keys(EVENT_REGISTRATION_STATUS_LABELS) as EventRegistrationStatus[];

// Человекочитаемый статус события (черновик/на модерации/опубликовано/
// отклонено/архив) — раньше жила только внутри EventWizard.tsx ("use client"),
// перенесена сюда (2026-09-15, Event Dashboard §12): импорт функции из
// "use client"-файла в серверный компонент уже один раз ловил баг в этом
// проекте (см. docs/PROGRESS.md, Notification Control Center — константа из
// "use client"-файла превращалась в клиентскую ссылку в RSC и возвращала
// undefined) — этот модуль специально без "use client", безопасен для обеих
// сторон.
export function myEventStatusLabel(status: EventStatus, moderationStatus: ModerationStatus): string {
  if (status === "DRAFT") return "Черновик";
  if (status === "ARCHIVED") return "В архиве";
  if (moderationStatus === "APPROVED") return "Опубликовано";
  if (moderationStatus === "REJECTED") return "Отклонено модератором";
  return "На модерации";
}

// Цвет точки статуса (StatusBadge) — вынесено из [id]/layout.tsx (было
// инлайн-тернарником только там) в общий хелпер, чтобы таблица "Мои события"
// (admin/content/page.tsx) и карточка события считали цвет одинаково, не
// дублируя тернарник в двух местах.
export type MyEventStatusVariant = "success" | "danger" | "warning" | "neutral";
export function myEventStatusVariant(status: EventStatus, moderationStatus: ModerationStatus): MyEventStatusVariant {
  if (status === "PUBLISHED" && moderationStatus === "APPROVED") return "success";
  if (moderationStatus === "REJECTED") return "danger";
  if (status === "ARCHIVED") return "neutral";
  return "neutral";
}

// Фильтр "Статус" на табличке "Мои события" — пять пользовательских
// категорий из myEventStatusLabel(), сведённые в explicit where-условие
// (не голый `status`/`moderationStatus` — их комбинация нетривиальна, см.
// myEventStatusLabel() выше). "" (по умолчанию) = всё, кроме архива, то же
// поведение, что и раньше было жёстко зашито в page.tsx.
export type MyEventStatusFilter = "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
export const MY_EVENT_STATUS_FILTER_OPTIONS: { value: MyEventStatusFilter; label: string }[] = [
  { value: "DRAFT", label: "Черновик" },
  { value: "PENDING", label: "На модерации" },
  { value: "PUBLISHED", label: "Опубликовано" },
  { value: "REJECTED", label: "Отклонено модератором" },
  { value: "ARCHIVED", label: "В архиве" },
];
export function myEventStatusFilterWhere(filter?: string) {
  switch (filter as MyEventStatusFilter | undefined) {
    case "DRAFT":
      return { status: "DRAFT" as const };
    case "PUBLISHED":
      return { status: "PUBLISHED" as const, moderationStatus: "APPROVED" as const };
    case "REJECTED":
      return { status: { not: "ARCHIVED" as const }, moderationStatus: "REJECTED" as const };
    case "PENDING":
      return { status: { notIn: ["DRAFT", "ARCHIVED"] as EventStatus[] }, moderationStatus: "PENDING" as const };
    case "ARCHIVED":
      return { status: "ARCHIVED" as const };
    default:
      // По умолчанию — как и раньше: всё, кроме архива.
      return { status: { not: "ARCHIVED" as const } };
  }
}

// Event Engine — расширяемый реестр типов события (задача "Event Engine").
// Чистый модуль без React и без Prisma-запросов: используется и клиентским
// EventWizard (список шагов/подписи), и сервером (Publish checklist — CLAUDE.md
// §19, backend не доверяет фронту). Формат хранится в уже существующем
// enum `EventFormat` (schema.prisma) — не заводим отдельный "type" в БД,
// чтобы не дублировать смысл. WIZARD_EVENT_FORMATS — те значения, для
// которых есть карточка выбора в мастере; FESTIVAL/INTENSIVE переиспользуют
// generic-конфигурацию (см. ниже) — существующая возможность их создать не
// теряется, просто без отдельной карточки на первом экране мастера.
// Редизайн мастера (2026-09-16, по прямому запросу пользователя, макет
// согласован заранее): "type"/"location"/"preview" перестали быть
// ОТДЕЛЬНЫМИ шагами. Выбор типа события и место проведения переехали внутрь
// "basic" (один экран "Тип и основное" — три колонки: тип / форма /
// живой предпросмотр), сам предпросмотр стал ПОСТОЯННО видимой боковой
// панелью на каждом шаге (см. EventPreviewSidebar.tsx), а не отдельным
// шагом в конце.
// "recurrence" — НЕ часть EVENT_TYPE_REGISTRY ниже (не зависит от формата
// события): EventWizard.tsx добавляет его в конец эффективного списка шагов
// динамически, только если организатор отметил "Сделать регулярным" на шаге
// "Публикация" (Recurring Events v2, см. wizard-types.ts).
export type EventStepId =
  | "basic"
  | "datetime"
  | "partyDetails"
  | "sessions"
  | "details"
  | "tickets"
  | "publish"
  | "recurrence";

export type EventTypeConfig = {
  format: EventFormat;
  label: string;
  description: string;
  icon: string;
  steps: EventStepId[];
};

// Добавление нового типа (Festival/Workshop/Bootcamp/Social/Battle/Show/...)
// в будущем = новая запись здесь + значение в enum EventFormat (одна
// дешёвая ALTER TYPE ... ADD VALUE миграция, есть прецедент —
// docs/00_DECISIONS.md A27) — Wizard/API/checklist не переписываются.
export const EVENT_TYPE_REGISTRY: Record<EventFormat, EventTypeConfig> = {
  PARTY: {
    format: "PARTY",
    label: "Вечеринка",
    description: "Тусовки и вечеринки",
    icon: "🪩",
    steps: ["basic", "datetime", "partyDetails", "tickets", "publish"],
  },
  MASTERCLASS: {
    format: "MASTERCLASS",
    label: "Мастер-класс",
    description: "Занятия и преподаватели",
    icon: "🎓",
    // "Teacher" из ТЗ не выделен отдельным пустым шагом — преподаватель
    // выбирается прямо у каждой сессии (у мастер-класса может быть несколько
    // занятий с разными преподавателями, как в примере ТЗ), см. StepSessions.
    steps: ["basic", "datetime", "sessions", "details", "tickets", "publish"],
  },
  CONTEST: {
    format: "CONTEST",
    label: "Конкурс (JNJ)",
    description: "Танцевальное соревнование",
    icon: "🏆",
    // Сознательно короче остальных — по решению пользователя (2026-09-12):
    // мастер собирает только общую карточку события; Categories/Rounds/
    // Judges/Scoring/Final/Rematch/Registration — уже существующий,
    // отдельный, глубоко реализованный Competition Engine
    // (/admin/competitions/[id]), не дублируется здесь.
    steps: ["basic", "datetime", "publish"],
  },
  // Festival Engine — FESTIVAL больше НЕ создаётся через Event Wizard:
  // Festival — отдельная first-class сущность со своим флоу создания (см.
  // docs/FESTIVAL_ENGINE_ER.md), bridge-Event для неё заводится изнутри
  // этого флоу, не выбором формата организатором (см.
  // WIZARD_SELECTABLE_EVENT_FORMATS ниже — FESTIVAL туда не входит).
  // Запись в реестре остаётся: существующие bridge-Event уже имеют
  // format=FESTIVAL, label/icon им всё ещё нужны в общих списках/карточках.
  FESTIVAL: {
    format: "FESTIVAL",
    label: "Фестиваль",
    description: "Многодневный танцевальный фестиваль",
    icon: "🎪",
    steps: ["basic", "datetime", "tickets", "publish"],
  },
  INTENSIVE: {
    format: "INTENSIVE",
    label: "Воркшоп-интенсив",
    description: "Блок из нескольких занятий",
    icon: "🔥",
    steps: ["basic", "datetime", "tickets", "publish"],
  },
  // Events Engine (2026-09-15) — добавлены аддитивно к enum EventFormat
  // (см. комментарий у enum в schema.prisma), тоже generic-конфигурация: без
  // выделенной 1:1-таблицы деталей, как и FESTIVAL/INTENSIVE выше.
  SOCIAL: {
    format: "SOCIAL",
    label: "Соушл",
    description: "Свободные танцы без концепции вечеринки",
    icon: "💃",
    steps: ["basic", "datetime", "tickets", "publish"],
  },
  OPEN_AIR: {
    format: "OPEN_AIR",
    label: "Open Air",
    description: "Танцы на открытом воздухе",
    icon: "🌤️",
    steps: ["basic", "datetime", "tickets", "publish"],
  },
  PRACTICE: {
    format: "PRACTICE",
    label: "Практика",
    description: "Практика/тренировка без преподавателя",
    icon: "🕺",
    steps: ["basic", "datetime", "tickets", "publish"],
  },
  OTHER: {
    format: "OTHER",
    label: "Другое",
    description: "Формат, не покрытый остальными категориями",
    icon: "✨",
    steps: ["basic", "datetime", "tickets", "publish"],
  },
};

// Порядок карточек на первом экране мастера — только три "первых типа" из
// задачи; остальные значения EventFormat остаются валидными (генерируются
// формой без карточки, см. WIZARD_EVENT_FORMATS ниже), но не рекламируются
// как основной путь.
export const FEATURED_EVENT_FORMATS: EventFormat[] = ["PARTY", "MASTERCLASS", "CONTEST"];
export const ALL_EVENT_FORMATS: EventFormat[] = [
  "PARTY",
  "MASTERCLASS",
  "FESTIVAL",
  "CONTEST",
  "INTENSIVE",
  "SOCIAL",
  "OPEN_AIR",
  "PRACTICE",
  "OTHER",
];

// Festival Engine — форматы, которые организатор может выбрать САМ при
// создании обычного события (Event Wizard/EventTemplate). FESTIVAL
// исключён: он больше не создаётся выбором формата — bridge-Event для
// Festival заводится изнутри флоу создания Festival, см. комментарий у
// EVENT_TYPE_REGISTRY.FESTIVAL. Отличается от ALL_EVENT_FORMATS
// (используется там, где FESTIVAL — валидный существующий формат для
// фильтра/подписки, а не выбор при создании — списки событий, настройки
// уведомлений).
export const WIZARD_SELECTABLE_EVENT_FORMATS: EventFormat[] = ALL_EVENT_FORMATS.filter((f) => f !== "FESTIVAL");

export function getEventTypeConfig(format: EventFormat): EventTypeConfig {
  return EVENT_TYPE_REGISTRY[format];
}

// ---------------------------------------------------------------------------
// Publish checklist — единая логика клиент (дизейблит кнопку "Publish") и
// сервер (последнее слово, CLAUDE.md §19 "не доверяй данным из браузера").
// ---------------------------------------------------------------------------

export type ChecklistItem = { id: string; label: string; ok: boolean };

export type MasterclassSessionDraft = { teacherId?: string | null };

// Минимальный набор полей черновика, нужный для расчёта чеклиста — не весь
// Event (чтобы серверный и клиентский код могли передавать облегчённый
// объект, не гоняя лишнее туда-сюда).
export type EventDraftForChecklist = {
  title?: string | null;
  cityId?: string | null;
  venueName?: string | null;
  startsAt?: string | Date | null;
  masterclassSessions?: MasterclassSessionDraft[];
};

export function computePublishChecklist(format: EventFormat, draft: EventDraftForChecklist): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { id: "title", label: "Название события", ok: !!draft.title && draft.title.trim().length >= 3 },
    { id: "city", label: "Город", ok: !!draft.cityId },
    { id: "venue", label: "Место проведения", ok: !!draft.venueName && draft.venueName.trim().length > 0 },
    { id: "startsAt", label: "Дата и время", ok: !!draft.startsAt },
  ];

  if (format === "MASTERCLASS") {
    const sessions = draft.masterclassSessions ?? [];
    items.push({ id: "sessions", label: "Хотя бы одно занятие (сессия)", ok: sessions.length > 0 });
    items.push({
      id: "instructor",
      label: "Указан преподаватель хотя бы одного занятия",
      ok: sessions.some((s) => !!s.teacherId),
    });
  }

  return items;
}

export function isChecklistComplete(items: ChecklistItem[]): boolean {
  return items.every((i) => i.ok);
}
