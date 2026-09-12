import type { EventFormat, DanceLevel, EventStatus } from "@prisma/client";

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

export type WizardDraft = {
  id?: string;
  slug?: string;
  status: EventStatus;
  format: EventFormat;
  title: string;
  description: string;
  media: WizardMediaItem[];
  level: DanceLevel;
  cityId: string;
  schoolId: string;
  organizerName: string;
  venueName: string;
  venueAddress: string;
  latitude: string;
  longitude: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  registrationEnabled: boolean;
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
  competitionId: string | null;
};

export function emptyWizardDraft(defaultCityId: string): WizardDraft {
  return {
    status: "DRAFT",
    format: "PARTY",
    title: "",
    description: "",
    media: [],
    level: "ALL_LEVELS",
    cityId: defaultCityId,
    schoolId: "",
    organizerName: "",
    venueName: "",
    venueAddress: "",
    latitude: "",
    longitude: "",
    startsAt: "",
    endsAt: "",
    capacity: "",
    registrationEnabled: false,
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
    competitionId: null,
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
    format: d.format,
    title: d.title,
    description: d.description || undefined,
    level: d.level,
    cityId: d.cityId || undefined,
    schoolId: d.schoolId || undefined,
    organizerName: d.organizerName || undefined,
    venueName: d.venueName || undefined,
    venueAddress: d.venueAddress || undefined,
    latitude: d.latitude ? Number(d.latitude) : undefined,
    longitude: d.longitude ? Number(d.longitude) : undefined,
    startsAt: d.startsAt || undefined,
    endsAt: d.endsAt || undefined,
    capacity: d.capacity ? Number(d.capacity) : undefined,
    registrationEnabled: d.registrationEnabled,
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
  };
}
