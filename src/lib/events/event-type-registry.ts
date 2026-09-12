import type { EventFormat } from "@prisma/client";

// Event Engine — расширяемый реестр типов события (задача "Event Engine").
// Чистый модуль без React и без Prisma-запросов: используется и клиентским
// EventWizard (список шагов/подписи), и сервером (Publish checklist — CLAUDE.md
// §19, backend не доверяет фронту). Формат хранится в уже существующем
// enum `EventFormat` (schema.prisma) — не заводим отдельный "type" в БД,
// чтобы не дублировать смысл. WIZARD_EVENT_FORMATS — те значения, для
// которых есть карточка выбора в мастере; FESTIVAL/INTENSIVE переиспользуют
// generic-конфигурацию (см. ниже) — существующая возможность их создать не
// теряется, просто без отдельной карточки на первом экране мастера.
export type EventStepId =
  | "type"
  | "basic"
  | "location"
  | "datetime"
  | "partyDetails"
  | "sessions"
  | "details"
  | "tickets"
  | "preview"
  | "publish";

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
    label: "Party",
    description: "Social & nightlife",
    icon: "🪩",
    steps: ["type", "basic", "location", "datetime", "partyDetails", "tickets", "preview", "publish"],
  },
  MASTERCLASS: {
    format: "MASTERCLASS",
    label: "Masterclass",
    description: "Classes & teachers",
    icon: "🎓",
    // "Teacher" из ТЗ не выделен отдельным пустым шагом — преподаватель
    // выбирается прямо у каждой сессии (у мастер-класса может быть несколько
    // занятий с разными преподавателями, как в примере ТЗ), см. StepSessions.
    steps: ["type", "basic", "location", "datetime", "sessions", "details", "tickets", "preview", "publish"],
  },
  CONTEST: {
    format: "CONTEST",
    label: "JNJ Competition",
    description: "Dance competition",
    icon: "🏆",
    // Сознательно короче остальных — по решению пользователя (2026-09-12):
    // мастер собирает только общую карточку события; Categories/Rounds/
    // Judges/Scoring/Final/Rematch/Registration — уже существующий,
    // отдельный, глубоко реализованный Competition Engine
    // (/admin/competitions/[id]), не дублируется здесь.
    steps: ["type", "basic", "location", "datetime", "preview", "publish"],
  },
  // Generic-конфигурация — сохраняет существующую (до этой задачи) возможность
  // создать эти форматы, без специфичных для них полей/шагов.
  FESTIVAL: {
    format: "FESTIVAL",
    label: "Festival",
    description: "Multi-day dance festival",
    icon: "🎪",
    steps: ["type", "basic", "location", "datetime", "tickets", "preview", "publish"],
  },
  INTENSIVE: {
    format: "INTENSIVE",
    label: "Workshop intensive",
    description: "Multi-session workshop block",
    icon: "🔥",
    steps: ["type", "basic", "location", "datetime", "tickets", "preview", "publish"],
  },
};

// Порядок карточек на первом экране мастера — только три "первых типа" из
// задачи; остальные значения EventFormat остаются валидными (генерируются
// формой без карточки, см. WIZARD_EVENT_FORMATS ниже), но не рекламируются
// как основной путь.
export const FEATURED_EVENT_FORMATS: EventFormat[] = ["PARTY", "MASTERCLASS", "CONTEST"];
export const ALL_EVENT_FORMATS: EventFormat[] = ["PARTY", "MASTERCLASS", "FESTIVAL", "CONTEST", "INTENSIVE"];

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
