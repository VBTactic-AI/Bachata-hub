import type { EventFormat, DanceLevel, EventStatus, EventCertainty, EventTicketingMode } from "@prisma/client";
import type { RecurrenceRule } from "@/server/events/recurrence";

// Event Engine — форма черновика в состоянии React (клиент). Отдельно от
// EventDraftInput (server/events/schemas.ts, zod) намеренно: инпуты формы
// всегда строки (даже для чисел/дат), сериализация в правильные типы
// происходит один раз, перед отправкой (toApiPayload в EventWizard.tsx) —
// как и остальные формы проекта (см. AddEventForm/CreateCompetitionForm).
export type WizardPriceOption = { label: string; price: string; currency: string };

// Event Media Gallery — зеркалит EventMedia (см. schema.prisma). photoUrl
// больше НЕ поле формы (см. комментарий у Event.photoUrl) — это то, что
// реально загружено и сохранено сервером, не черновое состояние.
export type WizardMediaItem = {
  id: string;
  url: string;
  isMain: boolean;
  sortOrder: number;
  width: number | null;
  height: number | null;
  objectPosition: string;
};

export type WizardMasterclassSession = {
  title: string;
  teacherId: string;
  startTime: string;
  endTime: string;
  room: string;
  level: DanceLevel | "";
  capacity: string;
};

// Events Engine, этап 6 — пункт программы фестиваля. linkedEventId
// сознательно не редактируется из Wizard'а (см. комментарий у
// festivalProgramItemSchema, server/events/schemas.ts).
export type WizardProgramItem = {
  title: string;
  type: "WORKSHOP" | "PARTY" | "COMPETITION" | "OTHER";
  startTime: string;
  endTime: string;
  teacherId: string;
};

export type WizardDraft = {
  id?: string;
  slug?: string;
  status: EventStatus;
  format: EventFormat;
  // Events Engine — независимая ось от status, см. комментарий у enum
  // EventCertainty в schema.prisma.
  certainty: EventCertainty;
  title: string;
  description: string;
  media: WizardMediaItem[];
  level: DanceLevel;
  cityId: string;
  schoolId: string;
  organizerName: string;
  venueName: string;
  venueAddress: string;
  // Широта/долгота убраны из мастера (2026-09-16, по прямому запросу
  // пользователя) — поля Event.latitude/longitude остаются в схеме/API
  // (см. schemas.ts, оба optional) для уже существующих событий, просто
  // черновик их больше не собирает и не отправляет.
  startsAt: string;
  endsAt: string;
  capacity: string;
  registrationEnabled: boolean;
  // "Способ доступа" — см. комментарий у Event.ticketingMode в schema.prisma.
  ticketingMode: EventTicketingMode;
  priceText: string;
  externalLinkUrl: string;
  tags: string;
  priceOptions: WizardPriceOption[];
  party: {
    musicStyles: string;
    djs: string;
    danceFloors: string;
    artists: string;
    dressCode: string;
    photographer: string;
    foodAndDrinks: string;
    parking: boolean;
    cloakroom: boolean;
  };
  masterclass: {
    style: string;
    format: string;
    partnerRequired: boolean;
    sessions: WizardMasterclassSession[];
  };
  festival: {
    programItems: WizardProgramItem[];
  };
  competitionId: string | null;

  // Recurring Events v2 — "Дополнительно" на шаге "Публикация" (не поля
  // самого Event, никогда не попадают в toApiPayload/POST /api/events).
  makeTemplate: boolean;
  templateName: string;
  makeRecurring: boolean;
  // Состояние шага "Повторение" (появляется только если makeRecurring) —
  // хранится здесь, а не локальным state компонента, чтобы не сбрасываться
  // при переходе "Назад"/"Далее" между шагами мастера.
  recurrence: WizardRecurrenceState;
  // ID серии, созданной по кнопке "Сохранить регулярность" — используется
  // только для редиректа на карточку серии после успеха.
  seriesId: string | null;

  // Recurring Events v2 — шаблон, из которого создаётся ЭТО событие
  // (?templateId= на /admin/content/new, см. new/page.tsx). Отправляется
  // серверу ТОЛЬКО при первом создании (toApiPayload не шлёт его при
  // редактировании уже существующего события) — сервер копирует
  // EventTemplateTicketType/EventTemplatePass шаблона в настоящие
  // TicketType/Pass нового Event один раз, при создании (event-service.ts).
  sourceTemplateId: string | null;
};

export type WizardRecurrenceState = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  daysOfWeek: number[]; // 0=вс..6=сб, см. src/server/events/recurrence.ts
  monthlyDayOfMonth: string; // строка для поля ввода, число 1..31
  endless: boolean;
  endDate: string; // "YYYY-MM-DD", используется только если !endless
  generationHorizonDays: number;
  autoPublish: boolean;
  publishDaysBefore: number;
  publishAtTime: string; // "HH:mm"
};

export function emptyWizardRecurrenceState(): WizardRecurrenceState {
  return {
    frequency: "WEEKLY",
    interval: 1,
    daysOfWeek: [],
    monthlyDayOfMonth: "1",
    endless: true,
    endDate: "",
    generationHorizonDays: 84,
    autoPublish: true,
    publishDaysBefore: 3,
    publishAtTime: "10:00",
  };
}

// Форма "Повторение" -> тело POST /api/event-drafts/[id]/make-recurring.
// Бросает понятную ошибку, если пользователь не выбрал ни одного дня недели
// для WEEKLY — тот же принцип, что и обязательный checklist на "Публикации"
// (не отправлять заведомо отклоняемый сервером запрос).
export function recurrenceStateToApiPayload(s: WizardRecurrenceState) {
  let recurrenceRule: RecurrenceRule;
  if (s.frequency === "WEEKLY") {
    if (s.daysOfWeek.length === 0) throw new Error("Выберите хотя бы один день недели.");
    recurrenceRule = { frequency: "WEEKLY", interval: s.interval, daysOfWeek: s.daysOfWeek };
  } else if (s.frequency === "MONTHLY") {
    const dayOfMonth = Number(s.monthlyDayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) throw new Error("Укажите число месяца от 1 до 31.");
    recurrenceRule = { frequency: "MONTHLY", interval: s.interval, mode: "DAY_OF_MONTH", dayOfMonth };
  } else {
    recurrenceRule = { frequency: "DAILY", interval: s.interval };
  }

  return {
    recurrenceRule,
    endDate: s.endless ? undefined : s.endDate || undefined,
    generationHorizonDays: s.generationHorizonDays,
    autoPublish: s.autoPublish,
    publishDaysBefore: s.autoPublish ? s.publishDaysBefore : undefined,
    publishAtTime: s.autoPublish ? s.publishAtTime : undefined,
  };
}

// Обратное преобразование — уже сохранённая серия (EventSeries) в состояние
// формы шага "Повторение", для редактирования уже существующей серии
// (см. SeriesRecurrenceEditor.tsx). Симметрично recurrenceStateToApiPayload
// выше.
export function seriesToWizardRecurrenceState(series: {
  recurrenceRule: RecurrenceRule;
  endDate: Date | null;
  generationHorizonDays: number;
  autoPublish: boolean;
  publishDaysBefore: number | null;
  publishAtTime: string | null;
}): WizardRecurrenceState {
  const rule = series.recurrenceRule;
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    daysOfWeek: rule.frequency === "WEEKLY" ? rule.daysOfWeek : [],
    // NTH_WEEKDAY (например, "второй вторник месяца") не поддерживается этим
    // шагом мастера (StepRecurrence умеет только DAY_OF_MONTH) — такая серия
    // существующая до этого попапа, показывает дефолт "1", не падает.
    monthlyDayOfMonth: rule.frequency === "MONTHLY" && rule.mode === "DAY_OF_MONTH" ? String(rule.dayOfMonth) : "1",
    endless: !series.endDate,
    endDate: series.endDate ? series.endDate.toISOString().slice(0, 10) : "",
    generationHorizonDays: series.generationHorizonDays,
    autoPublish: series.autoPublish,
    publishDaysBefore: series.publishDaysBefore ?? 3,
    publishAtTime: series.publishAtTime ?? "10:00",
  };
}

export function emptyWizardDraft(defaultCityId: string): WizardDraft {
  return {
    status: "DRAFT",
    format: "PARTY",
    certainty: "CONFIRMED",
    title: "",
    description: "",
    media: [],
    level: "ALL_LEVELS",
    cityId: defaultCityId,
    schoolId: "",
    organizerName: "",
    venueName: "",
    venueAddress: "",
    startsAt: "",
    endsAt: "",
    capacity: "",
    registrationEnabled: false,
    ticketingMode: "UNSET",
    priceText: "",
    externalLinkUrl: "",
    tags: "",
    priceOptions: [],
    party: {
      musicStyles: "",
      djs: "",
      danceFloors: "",
      artists: "",
      dressCode: "",
      photographer: "",
      foodAndDrinks: "",
      parking: false,
      cloakroom: false,
    },
    masterclass: { style: "", format: "", partnerRequired: false, sessions: [] },
    festival: { programItems: [] },
    competitionId: null,
    makeTemplate: false,
    templateName: "",
    makeRecurring: false,
    recurrence: emptyWizardRecurrenceState(),
    seriesId: null,
    sourceTemplateId: null,
  };
}

// Обратная сторона DateTimeField ("YYYY-MM-DDTHH:mm") — используется только
// при загрузке уже сохранённого черновика назад в форму (single-timezone
// допущение проекта, как и в остальном коде — src/lib/events.ts).
export function dateToLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function csvToArray(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

// Сериализация в тело запроса POST/PATCH /api/events — единственное место,
// где строки формы превращаются в числа/массивы (сервер как источник
// истины валидирует ещё раз, CLAUDE.md §19/§44).
export function toApiPayload(d: WizardDraft, status: "DRAFT" | "PUBLISHED") {
  return {
    status,
    // Только при создании — см. комментарий у WizardDraft.sourceTemplateId.
    templateId: !d.id && d.sourceTemplateId ? d.sourceTemplateId : undefined,
    format: d.format,
    certainty: d.certainty,
    title: d.title,
    description: d.description || undefined,
    level: d.level,
    cityId: d.cityId || undefined,
    schoolId: d.schoolId || undefined,
    organizerName: d.organizerName || undefined,
    venueName: d.venueName || undefined,
    venueAddress: d.venueAddress || undefined,
    startsAt: d.startsAt || undefined,
    endsAt: d.endsAt || undefined,
    capacity: d.capacity ? Number(d.capacity) : undefined,
    registrationEnabled: d.registrationEnabled,
    ticketingMode: d.ticketingMode,
    priceText: d.priceText || undefined,
    externalLinkUrl: d.externalLinkUrl || undefined,
    tags: csvToArray(d.tags),
    priceOptions: d.priceOptions
      .filter((p) => p.label.trim())
      .map((p) => ({ label: p.label, price: p.price ? Number(p.price) : undefined, currency: p.currency || undefined })),
    party:
      d.format === "PARTY"
        ? {
            musicStyles: csvToArray(d.party.musicStyles),
            djs: csvToArray(d.party.djs),
            danceFloors: csvToArray(d.party.danceFloors),
            artists: csvToArray(d.party.artists),
            dressCode: d.party.dressCode || undefined,
            photographer: d.party.photographer || undefined,
            foodAndDrinks: d.party.foodAndDrinks || undefined,
            parking: d.party.parking,
            cloakroom: d.party.cloakroom,
          }
        : undefined,
    masterclass:
      d.format === "MASTERCLASS"
        ? {
            style: d.masterclass.style || undefined,
            format: d.masterclass.format || undefined,
            partnerRequired: d.masterclass.partnerRequired,
            sessions: d.masterclass.sessions
              .filter((s) => s.title.trim())
              .map((s) => ({
                title: s.title,
                teacherId: s.teacherId || undefined,
                startTime: s.startTime,
                endTime: s.endTime,
                room: s.room || undefined,
                level: s.level || undefined,
                capacity: s.capacity ? Number(s.capacity) : undefined,
              })),
          }
        : undefined,
    festival:
      d.format === "FESTIVAL"
        ? {
            programItems: d.festival.programItems
              .filter((p) => p.title.trim())
              .map((p) => ({
                title: p.title,
                type: p.type,
                startTime: p.startTime,
                endTime: p.endTime || undefined,
                teacherId: p.teacherId || undefined,
              })),
          }
        : undefined,
  };
}
