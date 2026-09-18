"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, RequiredMark, Select, Textarea } from "@/components/ui/field";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { EventCardPreview } from "@/components/EventCardPreview";
import { t } from "@/lib/i18n/dictionary";

type City = { id: string; nameRu: string };

const LEVEL_OPTIONS: { value: "BEGINNER" | "ALL_LEVELS" | "ADVANCED"; label: string }[] = [
  { value: "BEGINNER", label: t.event.levels.BEGINNER },
  { value: "ALL_LEVELS", label: t.event.levels.ALL_LEVELS },
  { value: "ADVANCED", label: t.event.levels.ADVANCED },
];

// Создание соревнования (2026-09-18, по прямому запросу пользователя) —
// единственный путь завести НОВЫЙ конкурс (Jack & Jill): раньше формат
// CONTEST можно было выбрать и в общем Event Wizard, теперь публичная
// карточка события (Event) создаётся ВМЕСТЕ с Competition прямо здесь, одним
// действием на сервере (см. createCompetition() в
// server/competition/create-competition.ts) — организатору не нужно потом
// отдельно искать/связывать событие. Живой предпросмотр карточки — тот же
// EventCardPreview, что и в Event Wizard (EventPreviewSidebar.tsx), чтобы
// результат выглядел одинаково независимо от того, через какую форму его
// завели. Разделы категорий/раундов/судей/жеребьёвки/результатов — уже
// существующий отдельный Competition Engine (/admin/competitions/[id]), не
// дублируются здесь.
export function CreateCompetitionForm({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [venue, setVenue] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [level, setLevel] = useState<"BEGINNER" | "ALL_LEVELS" | "ADVANCED">("ALL_LEVELS");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/competitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        organizerName: organizerName || undefined,
        cityId: cityId || undefined,
        venue: venue || undefined,
        venueAddress: venueAddress || undefined,
        level,
        startAt: startAt || undefined,
        endAt: endAt || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === "invalid_input" ? "Заполните обязательные поля: название, город, площадка, дата и время начала." : data.error || "Что-то пошло не так.");
      return;
    }
    const data = await res.json();
    router.push(`/admin/competitions/${data.competition.id}`);
  }

  const fieldClass = "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
  const cityName = cities.find((c) => c.id === cityId)?.nameRu ?? "";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
      <FormRoot onSubmit={onSubmit}>
        <Label className="text-admin-muted">
          <span>
            Название
            <RequiredMark />
          </span>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Minsk Jack & Jill Open" className={fieldClass} />
        </Label>
        <Label className="text-admin-muted">
          Организатор
          <Input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} placeholder="Название школы/сообщества" className={fieldClass} />
        </Label>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            <span>
              Город
              <RequiredMark />
            </span>
            <Select required value={cityId} onChange={(e) => setCityId(e.target.value)} className={fieldClass}>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameRu}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="text-admin-muted">
            Уровень
            <Select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className={fieldClass}>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Label>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            <span>
              Площадка
              <RequiredMark />
            </span>
            <Input required value={venue} onChange={(e) => setVenue(e.target.value)} className={fieldClass} />
          </Label>
          <Label className="text-admin-muted">
            Адрес
            <Input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} className={fieldClass} />
          </Label>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            <span>
              Дата и время начала
              <RequiredMark />
            </span>
            <DateTimeField required value={startAt} onChange={setStartAt} theme="admin" className={fieldClass} />
          </Label>
          <Label className="text-admin-muted">
            Дата и время окончания (необязательно)
            <DateTimeField value={endAt} onChange={setEndAt} theme="admin" className={fieldClass} />
          </Label>
        </div>
        <Label className="text-admin-muted">
          Описание
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
        </Label>
        {error && <p className="m-0 text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={loading} className="border-none bg-gradient-admin-cta">
          {loading ? "Создаём…" : "Создать соревнование"}
        </Button>
        <p className="m-0 text-xs text-admin-muted">
          Категории, раунды, судьи, жеребьёвка и результаты настраиваются на следующей странице, сразу после создания.
        </p>
      </FormRoot>

      <div className="flex flex-col gap-3">
        <EventCardPreview
          data={{
            title: name,
            format: "CONTEST",
            level,
            startsAt: startAt,
            cityName,
            organizerLabel: organizerName,
            photoUrl: "",
            price: null,
          }}
        />
        <div className="flex gap-2.5 rounded-app-sm border border-admin-primary/25 bg-admin-primary/5 p-3.5 text-xs leading-relaxed text-[#a9c4f5]">
          <span aria-hidden="true">💡</span>
          <span>
            Эта карточка появится на публичной странице «События» сразу после создания — редактировать её (в том числе загрузить афишу) можно будет со
            страницы соревнования.
          </span>
        </div>
      </div>
    </div>
  );
}
