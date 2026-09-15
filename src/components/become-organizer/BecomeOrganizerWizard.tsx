"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccessRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { OrganizerHeroPanel } from "./OrganizerHeroPanel";

// Access Request Engine — визард "Стать организатором" (/become-organizer).
// Значения enum'ов здесь ДОЛЖНЫ совпадать с src/server/access-requests/schemas.ts
// (сознательно не импортируем zod-схему в client-бандл напрямую — только её
// значения продублированы, по образцу src/components/admin/events/wizard-types.ts,
// который тоже держит собственные литеральные типы рядом с формой).
//
// Редизайн (2026-09-16, по прямому запросу пользователя — макет заранее
// согласован в артефакте): двухколоночная "витрина" — статичная
// OrganizerHeroPanel слева на всех шагах визарда (включая экран успеха),
// карточки выбора роли с иконками справа. Сама пошаговая машина (типы →
// общее → детали по каждому выбранному типу → подтверждение) НЕ изменена —
// это чисто визуальный редизайн контейнера и первых двух шагов.

type AccessType = "EVENT_ORGANIZER" | "FESTIVAL_ORGANIZER" | "SCHOOL_HEAD" | "COMPETITION_ORGANIZER";
type LinkType = "INSTAGRAM" | "FACEBOOK" | "WEBSITE" | "TELEGRAM" | "OTHER";

// Статус последней заявки по каждому типу (2026-09-16, по прямому запросу
// пользователя) — отображается прямо на карточке роли ниже (цвет + подсказка
// по наведению), отдельный список "Мои заявки на доступ" на этой странице
// больше не показывается.
export type RequestStatusByType = Partial<Record<AccessType, { status: AccessRequestStatus; reviewComment: string | null }>>;

// PENDING/APPROVED блокируют повторную заявку по этому типу (одна уже
// одобрена, или уже рассматривается — дублировать нет смысла). NEEDS_INFO/
// REJECTED/REVOKED — прямое решение пользователя: НЕ блокируют, можно сразу
// подать заново с уточнениями, просто подсвечены другим цветом.
const REQUEST_STATUS_META: Record<AccessRequestStatus, { label: string; dot: string; border: string; bg: string; blocked: boolean }> = {
  PENDING: { label: "Заявка на проверке", dot: "bg-amber-400", border: "border-amber-400/50", bg: "bg-amber-400/10", blocked: true },
  NEEDS_INFO: { label: "Нужна информация", dot: "bg-orange-400", border: "border-orange-400/50", bg: "bg-orange-400/10", blocked: false },
  APPROVED: { label: "Доступ одобрен", dot: "bg-night-success", border: "border-night-success/50", bg: "bg-night-success/10", blocked: true },
  REJECTED: { label: "Заявка отклонена", dot: "bg-red-400", border: "border-red-400/50", bg: "bg-red-400/10", blocked: false },
  REVOKED: { label: "Доступ отозван", dot: "bg-night-disabled", border: "border-night-disabled/50", bg: "bg-night-disabled/10", blocked: false },
};

function EventIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function SchoolIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}
function FestivalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 2 2.6 6.6L21 11l-6.4 2.4L12 20l-2.6-6.6L3 11l6.4-2.4z" />
    </svg>
  );
}
function CompetitionIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const TYPE_CARDS: { type: AccessType; title: string; description: string; icon: React.ReactNode }[] = [
  {
    type: "EVENT_ORGANIZER",
    title: "Организатор мероприятий",
    description: "Создавайте события, управляйте регистрациями и участниками.",
    icon: <EventIcon />,
  },
  {
    type: "SCHOOL_HEAD",
    title: "Руководитель школы",
    description: "Представляйте школу, преподавателей, расписание и мероприятия.",
    icon: <SchoolIcon />,
  },
  {
    type: "FESTIVAL_ORGANIZER",
    title: "Организатор фестиваля",
    description: "Создавайте фестивали, программу, workshops, parties и регистрации.",
    icon: <FestivalIcon />,
  },
  {
    type: "COMPETITION_ORGANIZER",
    title: "Организатор соревнований",
    description: "Создавайте и проводите Jack & Jill соревнования на платформе.",
    icon: <CompetitionIcon />,
  },
];

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WEBSITE: "Website",
  TELEGRAM: "Telegram",
  OTHER: "Другое",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  NEW: "Только начинаю",
  UNDER_1Y: "До 1 года",
  "1_3Y": "1–3 года",
  "3Y_PLUS": "3+ лет",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  PARTY: "Parties",
  WORKSHOP: "Workshops",
  OPEN_AIR: "Open Air",
  SOCIALS: "Socials",
  COMPETITIONS: "Competitions",
  OTHER: "Other",
};

const FESTIVAL_FREQUENCY_LABELS: Record<string, string> = {
  FIRST: "Первый фестиваль",
  ANNUAL: "Ежегодный",
  MULTIPLE: "Несколько раз в год",
  OTHER: "Другое",
};

const FESTIVAL_SCALE_LABELS: Record<string, string> = {
  UP_TO_100: "до 100 участников",
  "100_300": "100–300",
  "300_500": "300–500",
  "500_PLUS": "500+",
};

const FESTIVAL_FORMAT_LABELS: Record<string, string> = {
  WORKSHOPS: "Workshops",
  PARTIES: "Parties",
  COMPETITIONS: "Competitions",
  SHOWS: "Shows",
  SOCIALS: "Socials",
  GUEST_TEACHERS: "Guest teachers",
};

const TEACHERS_COUNT_LABELS: Record<string, string> = {
  "1": "1",
  "2_5": "2–5",
  "6_10": "6–10",
  "10_PLUS": "10+",
};

// Обязательность полей — по серверной схеме валидации
// (src/server/access-requests/schemas.ts), не выдумана заново: помечены
// ровно те поля, которые там заданы через .min(1)/без .optional() (по
// прямому запросу пользователя, 2026-09-14 — "обязательные поля" должны
// быть видны, а не обнаруживаться только по ошибке после отправки).
function Required() {
  return (
    <span className="text-red-400" aria-hidden>
      {" "}
      *
    </span>
  );
}

function csvToArray(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

const selectClass = "border-night-border bg-night-card2 text-night-text focus:border-night-primary focus:ring-night-primary/20";
const inputClass = selectClass;
const ctaClass = "w-full rounded-full border-none bg-gradient-night-cta py-3.5 text-[15px] shadow-[0_12px_28px_-12px_rgba(255,45,138,0.55)]";

type City = { id: string; nameRu: string; countryId: string };

export function BecomeOrganizerWizard({
  cities,
  initialCityId,
  requestStatusByType = {},
}: {
  cities: City[];
  initialCityId: string | null;
  requestStatusByType?: RequestStatusByType;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [types, setTypes] = useState<AccessType[]>([]);

  // Общие поля
  const [brandName, setBrandName] = useState("");
  const [description, setDescription] = useState("");
  const [cityId, setCityId] = useState(initialCityId ?? "");
  const [phone, setPhone] = useState("");
  const [links, setLinks] = useState<{ type: LinkType; url: string }[]>([{ type: "INSTAGRAM", url: "" }]);
  const [confirmedAccurate, setConfirmedAccurate] = useState(false);

  // EVENT_ORGANIZER
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventExperience, setEventExperience] = useState("NEW");
  const [eventExampleUrl, setEventExampleUrl] = useState("");

  // FESTIVAL_ORGANIZER
  const [festivalName, setFestivalName] = useState("");
  const [festivalUrl, setFestivalUrl] = useState("");
  const [festivalFrequency, setFestivalFrequency] = useState("FIRST");
  const [festivalScale, setFestivalScale] = useState("UP_TO_100");
  const [festivalFormats, setFestivalFormats] = useState<string[]>([]);
  const [festivalPastUrl, setFestivalPastUrl] = useState("");

  // SCHOOL_HEAD
  const [schoolName, setSchoolName] = useState("");
  const [schoolWebsite, setSchoolWebsite] = useState("");
  const [schoolInstagram, setSchoolInstagram] = useState("");
  const [teachingStylesCsv, setTeachingStylesCsv] = useState("");
  const [teachersCount, setTeachersCount] = useState("1");
  const [hasRegularClasses, setHasRegularClasses] = useState(false);
  const [schoolAddress, setSchoolAddress] = useState("");

  // COMPETITION_ORGANIZER
  const [compFormatsCsv, setCompFormatsCsv] = useState("");
  const [compExperience, setCompExperience] = useState("NEW");
  const [compExampleUrl, setCompExampleUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const typeSteps = TYPE_CARDS.filter((c) => types.includes(c.type)).map((c) => c.type);
  const steps = ["TYPES", "COMMON", ...typeSteps, "CONFIRM"] as const;
  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  function goNext() {
    if (current === "TYPES" && types.length === 0) {
      setError("Выберите хотя бы один вид доступа.");
      return;
    }
    if (current === "COMMON" && (!brandName.trim() || !description.trim() || !cityId)) {
      setError("Заполните название, описание и город — это обязательные поля.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function addLink() {
    setLinks((l) => [...l, { type: "OTHER", url: "" }]);
  }
  function removeLink(i: number) {
    setLinks((l) => l.filter((_, idx) => idx !== i));
  }
  function updateLink(i: number, patch: Partial<{ type: LinkType; url: string }>) {
    setLinks((l) => l.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function submit() {
    setLoading(true);
    setError(null);

    const payloadByType: Record<string, unknown> = {};
    if (types.includes("EVENT_ORGANIZER")) {
      payloadByType.EVENT_ORGANIZER = {
        eventTypes,
        experience: eventExperience,
        exampleUrl: eventExampleUrl || undefined,
      };
    }
    if (types.includes("FESTIVAL_ORGANIZER")) {
      payloadByType.FESTIVAL_ORGANIZER = {
        festivalName,
        url: festivalUrl || undefined,
        frequency: festivalFrequency,
        scale: festivalScale,
        formats: festivalFormats,
        pastFestivalUrl: festivalPastUrl || undefined,
      };
    }
    if (types.includes("SCHOOL_HEAD")) {
      payloadByType.SCHOOL_HEAD = {
        schoolName,
        website: schoolWebsite || undefined,
        instagram: schoolInstagram || undefined,
        teachingStyles: csvToArray(teachingStylesCsv),
        teachersCount,
        hasRegularClasses,
        address: schoolAddress || undefined,
      };
    }
    if (types.includes("COMPETITION_ORGANIZER")) {
      payloadByType.COMPETITION_ORGANIZER = {
        formats: csvToArray(compFormatsCsv),
        experience: compExperience,
        exampleUrl: compExampleUrl || undefined,
      };
    }

    const city = cities.find((c) => c.id === cityId);

    const res = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        types,
        brandName,
        description,
        cityId,
        countryId: city?.countryId,
        phone: phone || undefined,
        links: links.filter((l) => l.url.trim()),
        payloadByType,
        confirmedAccurate,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      setError("Не удалось отправить заявку. Проверьте, что все обязательные поля по каждому выбранному типу заполнены.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <div className="grid overflow-hidden rounded-app border border-night-border bg-night-card lg:grid-cols-[minmax(260px,42%)_1fr]">
      <OrganizerHeroPanel />

      <div className="flex flex-col p-6 sm:p-8 lg:p-10">
        {done ? (
          <div className="flex flex-1 flex-col justify-center">
            <Card className="border-night-border bg-night-card2">
              <p className="m-0 text-night-text">🟡 Заявка отправлена и ожидает проверки.</p>
              <p className="mt-2 text-sm text-night-muted">
                Мы проверим предоставленную информацию — статус будет виден на странице профиля.
              </p>
            </Card>
          </div>
        ) : (
          <>
            <p className="m-0 mb-4 text-xs text-night-muted">
              <span className="text-red-400">*</span> — обязательное поле
            </p>

            {current === "TYPES" && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Кем вы хотите быть?</h2>
                <p className="m-0 mb-1 text-sm text-night-muted">
                  Выберите одну или несколько ролей — мы покажем, как платформа может помочь именно вам.
                </p>
                <div className="flex flex-col gap-2.5">
                  {TYPE_CARDS.map((c) => {
                    const checked = types.includes(c.type);
                    const request = requestStatusByType[c.type];
                    const meta = request ? REQUEST_STATUS_META[request.status] : null;
                    const blocked = meta?.blocked ?? false;
                    const cardColorClass = blocked
                      ? `cursor-not-allowed opacity-80 ${meta!.border} ${meta!.bg}`
                      : checked
                        ? "border-night-primary bg-night-primary/10"
                        : meta
                          ? `${meta.border} ${meta.bg} hover:border-night-primary/40`
                          : "border-night-border bg-night-card2 hover:border-night-primary/40";
                    return (
                      <div key={c.type} className="group relative">
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => !blocked && setTypes((prev) => toggle(prev, c.type))}
                          className={`flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition-colors ${cardColorClass}`}
                        >
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-night-border text-night-pink"
                            style={{ background: "linear-gradient(135deg, rgba(255,45,138,0.22), rgba(108,43,255,0.18))" }}
                          >
                            {c.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block text-[15px] font-bold text-night-text">{c.title}</strong>
                            <span className="mt-0.5 block text-xs leading-snug text-night-muted">{c.description}</span>
                          </span>
                          {meta && !checked ? (
                            <span className={`h-[10px] w-[10px] shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                          ) : (
                            <span
                              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                                checked ? "border-night-primary bg-night-primary" : "border-night-disabled"
                              }`}
                            >
                              {checked && <CheckIcon />}
                            </span>
                          )}
                        </button>

                        {/* Подсказка по наведению (2026-09-16, по прямому запросу
                            пользователя) — что с заявкой и причина, если есть.
                            Чисто CSS (group-hover), без лишнего JS-состояния. */}
                        {meta && (
                          <div className="pointer-events-none absolute left-3 top-full z-10 mt-1.5 w-64 max-w-[calc(100%-1.5rem)] rounded-app-sm border border-night-border bg-night-card2 p-3 text-xs opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100">
                            <p className="m-0 flex items-center gap-1.5 font-semibold text-night-text">
                              <span className={`h-[8px] w-[8px] shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                              {meta.label}
                            </p>
                            {request?.reviewComment && <p className="m-0 mt-1.5 text-night-muted">Причина: {request.reviewComment}</p>}
                            {blocked && <p className="m-0 mt-1.5 text-night-disabled">Повторная заявка по этой роли недоступна.</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {current === "COMMON" && (
              <div className="flex flex-col gap-3.5">
                <h2 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Информация о вас</h2>
                <Label className="text-night-muted">
                  <span>
                    Как вас представить (название/бренд)
                    <Required />
                  </span>
                  <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputClass} placeholder="Warsaw Bachata Community" />
                </Label>
                <Label className="text-night-muted">
                  <span>
                    Краткое описание
                    <Required />
                  </span>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                    className={inputClass}
                    maxLength={500}
                    placeholder="Организуем регулярные bachata-вечеринки и workshops"
                  />
                </Label>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Label className="text-night-muted">
                    <span>
                      Город
                      <Required />
                    </span>
                    <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className={selectClass}>
                      <option value="">Выберите город</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nameRu}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Label className="text-night-muted">
                    Телефон (необязательно)
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+375 29 123 45 67" />
                  </Label>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="m-0 text-sm text-night-muted">
                    Ссылки на деятельность
                    <Required /> <span className="text-xs">(хотя бы одна)</span>
                  </p>
                  {links.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <Select value={l.type} onChange={(e) => updateLink(i, { type: e.target.value as LinkType })} className={`${selectClass} !w-[130px]`}>
                        {Object.entries(LINK_TYPE_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <Input value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} className={`flex-1 ${inputClass}`} placeholder="https://..." />
                      <Button type="button" size="sm" variant="secondary" onClick={() => removeLink(i)} className="border-night-border bg-transparent text-night-muted">
                        ✕
                      </Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="secondary" onClick={addLink} className="self-start border-night-border bg-transparent text-night-text">
                    + Добавить ещё ссылку
                  </Button>
                </div>
              </div>
            )}

            {current === "EVENT_ORGANIZER" && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 font-night text-lg font-bold text-night-text">Организатор мероприятий</h2>
                <div className="flex flex-col gap-1.5">
                  <p className="m-0 text-sm text-night-muted">
                    Какие мероприятия вы организуете?
                    <Required />
                  </p>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-night-text">
                      <input type="checkbox" checked={eventTypes.includes(k)} onChange={() => setEventTypes((prev) => toggle(prev, k))} />
                      {label}
                    </label>
                  ))}
                </div>
                <Label className="text-night-muted">
                  <span>
                    Как давно организуете мероприятия?
                    <Required />
                  </span>
                  <Select value={eventExperience} onChange={(e) => setEventExperience(e.target.value)} className={selectClass}>
                    {Object.entries(EXPERIENCE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="text-night-muted">
                  Ссылка на мероприятие/страницу события (необязательно)
                  <Input value={eventExampleUrl} onChange={(e) => setEventExampleUrl(e.target.value)} className={inputClass} />
                </Label>
              </div>
            )}

            {current === "FESTIVAL_ORGANIZER" && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 font-night text-lg font-bold text-night-text">Организатор фестиваля</h2>
                <Label className="text-night-muted">
                  <span>
                    Название фестиваля/бренда
                    <Required />
                  </span>
                  <Input value={festivalName} onChange={(e) => setFestivalName(e.target.value)} className={inputClass} placeholder="Bachata Warsaw Festival" />
                </Label>
                <Label className="text-night-muted">
                  Сайт/Instagram (необязательно)
                  <Input value={festivalUrl} onChange={(e) => setFestivalUrl(e.target.value)} className={inputClass} />
                </Label>
                <Label className="text-night-muted">
                  <span>
                    Периодичность
                    <Required />
                  </span>
                  <Select value={festivalFrequency} onChange={(e) => setFestivalFrequency(e.target.value)} className={selectClass}>
                    {Object.entries(FESTIVAL_FREQUENCY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="text-night-muted">
                  <span>
                    Примерный масштаб
                    <Required />
                  </span>
                  <Select value={festivalScale} onChange={(e) => setFestivalScale(e.target.value)} className={selectClass}>
                    {Object.entries(FESTIVAL_SCALE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <div className="flex flex-col gap-1.5">
                  <p className="m-0 text-sm text-night-muted">
                    Что организуете?
                    <Required />
                  </p>
                  {Object.entries(FESTIVAL_FORMAT_LABELS).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-night-text">
                      <input type="checkbox" checked={festivalFormats.includes(k)} onChange={() => setFestivalFormats((prev) => toggle(prev, k))} />
                      {label}
                    </label>
                  ))}
                </div>
                <Label className="text-night-muted">
                  Ссылка на прошлый фестиваль (если есть)
                  <Input value={festivalPastUrl} onChange={(e) => setFestivalPastUrl(e.target.value)} className={inputClass} />
                </Label>
              </div>
            )}

            {current === "SCHOOL_HEAD" && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 font-night text-lg font-bold text-night-text">Руководитель школы</h2>
                <Label className="text-night-muted">
                  <span>
                    Название школы
                    <Required />
                  </span>
                  <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className={inputClass} placeholder="Bachata Warsaw" />
                </Label>
                <Label className="text-night-muted">
                  Website (необязательно)
                  <Input value={schoolWebsite} onChange={(e) => setSchoolWebsite(e.target.value)} className={inputClass} />
                </Label>
                <Label className="text-night-muted">
                  Instagram (необязательно)
                  <Input value={schoolInstagram} onChange={(e) => setSchoolInstagram(e.target.value)} className={inputClass} />
                </Label>
                <Label className="text-night-muted">
                  <span>
                    Что преподаёте (через запятую)
                    <Required />
                  </span>
                  <Input value={teachingStylesCsv} onChange={(e) => setTeachingStylesCsv(e.target.value)} className={inputClass} placeholder="Bachata, Sensual, Dominicana" />
                </Label>
                <Label className="text-night-muted">
                  <span>
                    Количество преподавателей
                    <Required />
                  </span>
                  <Select value={teachersCount} onChange={(e) => setTeachersCount(e.target.value)} className={selectClass}>
                    {Object.entries(TEACHERS_COUNT_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <label className="flex items-center gap-2 text-sm text-night-text">
                  <input type="checkbox" checked={hasRegularClasses} onChange={(e) => setHasRegularClasses(e.target.checked)} />
                  Есть регулярные занятия
                </label>
                <Label className="text-night-muted">
                  Адрес школы (можно добавить позже)
                  <Input value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} className={inputClass} />
                </Label>
              </div>
            )}

            {current === "COMPETITION_ORGANIZER" && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 font-night text-lg font-bold text-night-text">Организатор соревнований</h2>
                <Label className="text-night-muted">
                  <span>
                    Какие форматы Jack & Jill проводите/планируете (через запятую)
                    <Required />
                  </span>
                  <Input value={compFormatsCsv} onChange={(e) => setCompFormatsCsv(e.target.value)} className={inputClass} placeholder="Jack & Jill, Strictly" />
                </Label>
                <Label className="text-night-muted">
                  <span>
                    Опыт проведения/судейства
                    <Required />
                  </span>
                  <Select value={compExperience} onChange={(e) => setCompExperience(e.target.value)} className={selectClass}>
                    {Object.entries(EXPERIENCE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="text-night-muted">
                  Ссылка на пример (необязательно)
                  <Input value={compExampleUrl} onChange={(e) => setCompExampleUrl(e.target.value)} className={inputClass} />
                </Label>
              </div>
            )}

            {current === "CONFIRM" && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Проверьте и отправьте</h2>
                <Card className="border-night-border bg-night-card2 text-sm text-night-muted">
                  <p className="m-0 text-night-text">{brandName || "—"}</p>
                  <p className="mt-1">{description || "—"}</p>
                  <p className="mt-1">{cities.find((c) => c.id === cityId)?.nameRu ?? "—"}</p>
                  <p className="mt-1">Роли: {types.map((t) => TYPE_CARDS.find((c) => c.type === t)?.title).join(", ")}</p>
                </Card>
                <label className="flex items-start gap-2 text-sm text-night-text">
                  <input type="checkbox" checked={confirmedAccurate} onChange={(e) => setConfirmedAccurate(e.target.checked)} className="mt-0.5" />
                  <span>
                    Я подтверждаю, что предоставленная информация является достоверной.
                    <Required />
                  </span>
                </label>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <div className="mt-6 flex flex-col gap-2.5">
              {isLast ? (
                <Button type="button" disabled={loading || !confirmedAccurate} onClick={submit} className={ctaClass}>
                  Отправить заявку →
                </Button>
              ) : (
                <Button type="button" onClick={goNext} className={ctaClass}>
                  {current === "TYPES" ? "Продолжить →" : "Далее →"}
                </Button>
              )}
              {!isFirst && (
                <button type="button" onClick={goBack} className="self-center text-sm text-night-muted hover:text-night-text hover:underline">
                  ← Назад
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
