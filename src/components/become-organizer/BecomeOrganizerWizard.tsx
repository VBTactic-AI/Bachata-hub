"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

// Access Request Engine — визард "Стать организатором" (/become-organizer).
// Значения enum'ов здесь ДОЛЖНЫ совпадать с src/server/access-requests/schemas.ts
// (сознательно не импортируем zod-схему в client-бандл напрямую — только её
// значения продублированы, по образцу src/components/admin/events/wizard-types.ts,
// который тоже держит собственные литеральные типы рядом с формой).

type AccessType = "EVENT_ORGANIZER" | "FESTIVAL_ORGANIZER" | "SCHOOL_HEAD" | "COMPETITION_ORGANIZER";
type LinkType = "INSTAGRAM" | "FACEBOOK" | "WEBSITE" | "TELEGRAM" | "OTHER";

const TYPE_CARDS: { type: AccessType; title: string; description: string }[] = [
  {
    type: "EVENT_ORGANIZER",
    title: "Организатор мероприятий",
    description: "Создавайте события, управляйте регистрациями и участниками.",
  },
  {
    type: "FESTIVAL_ORGANIZER",
    title: "Организатор фестиваля",
    description: "Создавайте фестивали, программу, workshops, parties и регистрации.",
  },
  {
    type: "SCHOOL_HEAD",
    title: "Руководитель школы",
    description: "Представляйте школу, преподавателей, расписание и мероприятия.",
  },
  {
    type: "COMPETITION_ORGANIZER",
    title: "Организатор соревнований",
    description: "Создавайте и проводите Jack & Jill соревнования на платформе.",
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

type City = { id: string; nameRu: string; countryId: string };

export function BecomeOrganizerWizard({ cities, initialCityId }: { cities: City[]; initialCityId: string | null }) {
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

  if (done) {
    return (
      <Card className="border-night-border bg-night-card">
        <p className="m-0 text-night-text">🟡 Заявка отправлена и ожидает проверки.</p>
        <p className="mt-2 text-sm text-night-muted">
          Мы проверим предоставленную информацию — статус будет виден на странице профиля.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {current === "TYPES" && (
        <div className="flex flex-col gap-3">
          <h2 className="m-0 font-night text-lg font-bold text-night-text">Какой доступ вам нужен?</h2>
          <p className="m-0 text-sm text-night-muted">Можно выбрать несколько — например, руководитель школы и организатор фестиваля одновременно.</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {TYPE_CARDS.map((c) => {
              const checked = types.includes(c.type);
              return (
                <label
                  key={c.type}
                  className={`flex cursor-pointer flex-col gap-1 rounded-app border p-3.5 transition-colors ${
                    checked ? "border-night-primary bg-night-primary/10" : "border-night-border bg-night-card hover:border-night-primary/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={checked} onChange={() => setTypes((prev) => toggle(prev, c.type))} />
                    <strong className="text-night-text">{c.title}</strong>
                  </span>
                  <span className="text-xs text-night-muted">{c.description}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {current === "COMMON" && (
        <div className="flex flex-col gap-3">
          <h2 className="m-0 font-night text-lg font-bold text-night-text">Основная информация</h2>
          <Label className="text-night-muted">
            Как вас представить (название/бренд)
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputClass} placeholder="Warsaw Bachata Community" />
          </Label>
          <Label className="text-night-muted">
            Краткое описание
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              className={inputClass}
              maxLength={500}
              placeholder="Организуем регулярные bachata-вечеринки и workshops"
            />
          </Label>
          <Label className="text-night-muted">
            Город
            <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className={selectClass}>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameRu}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="text-night-muted">
            Телефон (необязательно)
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </Label>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm text-night-muted">Ссылки на деятельность</p>
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
            <p className="m-0 text-sm text-night-muted">Какие мероприятия вы организуете?</p>
            {Object.entries(EVENT_TYPE_LABELS).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={eventTypes.includes(k)} onChange={() => setEventTypes((prev) => toggle(prev, k))} />
                {label}
              </label>
            ))}
          </div>
          <Label className="text-night-muted">
            Как давно организуете мероприятия?
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
            Название фестиваля/бренда
            <Input value={festivalName} onChange={(e) => setFestivalName(e.target.value)} className={inputClass} placeholder="Bachata Warsaw Festival" />
          </Label>
          <Label className="text-night-muted">
            Сайт/Instagram (необязательно)
            <Input value={festivalUrl} onChange={(e) => setFestivalUrl(e.target.value)} className={inputClass} />
          </Label>
          <Label className="text-night-muted">
            Периодичность
            <Select value={festivalFrequency} onChange={(e) => setFestivalFrequency(e.target.value)} className={selectClass}>
              {Object.entries(FESTIVAL_FREQUENCY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="text-night-muted">
            Примерный масштаб
            <Select value={festivalScale} onChange={(e) => setFestivalScale(e.target.value)} className={selectClass}>
              {Object.entries(FESTIVAL_SCALE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Label>
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-sm text-night-muted">Что организуете?</p>
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
            Название школы
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
            Что преподаёте (через запятую)
            <Input value={teachingStylesCsv} onChange={(e) => setTeachingStylesCsv(e.target.value)} className={inputClass} placeholder="Bachata, Sensual, Dominicana" />
          </Label>
          <Label className="text-night-muted">
            Количество преподавателей
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
            Какие форматы Jack & Jill проводите/планируете (через запятую)
            <Input value={compFormatsCsv} onChange={(e) => setCompFormatsCsv(e.target.value)} className={inputClass} placeholder="Jack & Jill, Strictly" />
          </Label>
          <Label className="text-night-muted">
            Опыт проведения/судейства
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
          <h2 className="m-0 font-night text-lg font-bold text-night-text">Проверьте и отправьте</h2>
          <Card className="border-night-border bg-night-card text-sm text-night-muted">
            <p className="m-0 text-night-text">{brandName || "—"}</p>
            <p className="mt-1">{description || "—"}</p>
            <p className="mt-1">{cities.find((c) => c.id === cityId)?.nameRu ?? "—"}</p>
            <p className="mt-1">Типы доступа: {types.map((t) => TYPE_CARDS.find((c) => c.type === t)?.title).join(", ")}</p>
          </Card>
          <label className="flex items-start gap-2 text-sm text-night-text">
            <input type="checkbox" checked={confirmedAccurate} onChange={(e) => setConfirmedAccurate(e.target.checked)} className="mt-0.5" />
            Я подтверждаю, что предоставленная информация является достоверной.
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="secondary" disabled={isFirst} onClick={goBack} className="border-night-border bg-transparent text-night-text">
          ← Назад
        </Button>
        {isLast ? (
          <Button type="button" disabled={loading || !confirmedAccurate} onClick={submit} className="border-none bg-gradient-night-cta">
            Отправить заявку
          </Button>
        ) : (
          <Button type="button" onClick={goNext} className="border-none bg-gradient-night-cta">
            Далее →
          </Button>
        )}
      </div>
    </div>
  );
}
