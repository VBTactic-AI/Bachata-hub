"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select, Textarea } from "@/components/ui/field";

type City = { id: string; nameRu: string };
type School = { id: string; name: string };

export function AddEventForm({
  cities,
  ownedSchools,
}: {
  cities: City[];
  ownedSchools: School[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [schoolId, setSchoolId] = useState(ownedSchools[0]?.id ?? "");
  const [organizerName, setOrganizerName] = useState("");
  const [format, setFormat] = useState<keyof typeof t.event.formats>("PARTY");
  const [level, setLevel] = useState<keyof typeof t.event.levels>("ALL_LEVELS");
  const [startsAt, setStartsAt] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [description, setDescription] = useState("");
  const [priceText, setPriceText] = useState("");
  const [externalLinkUrl, setExternalLinkUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        cityId,
        schoolId: ownedSchools.length ? schoolId : undefined,
        organizerName: ownedSchools.length ? undefined : organizerName,
        format,
        level,
        startsAt,
        venueName,
        venueAddress,
        description,
        priceText,
        externalLinkUrl,
        photoUrl,
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t.common.errorGeneric);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/events"), 1500);
  }

  if (done) {
    return <p className="text-sm text-night-muted">{t.event.addEventForm.submitted}</p>;
  }

  const fieldClass = "border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20";

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-[560px]">
      <Label className="text-night-muted">
        {t.event.addEventForm.titleField}
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
      </Label>

      <Label className="text-night-muted">
        {t.event.city}
        <Select required value={cityId} onChange={(e) => setCityId(e.target.value)} className={fieldClass}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameRu}
            </option>
          ))}
        </Select>
      </Label>

      {ownedSchools.length > 0 ? (
        <Label className="text-night-muted">
          {t.event.organizer}
          <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className={fieldClass}>
            {ownedSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Label>
      ) : (
        <Label className="text-night-muted">
          {t.event.organizer}
          <Input
            placeholder={t.event.addEventForm.organizerPlaceholder}
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            className={fieldClass}
          />
        </Label>
      )}

      <Label className="text-night-muted">
        {t.event.format}
        <Select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className={fieldClass}>
          {Object.entries(t.event.formats).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Label>

      <Label className="text-night-muted">
        {t.event.level}
        <Select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className={fieldClass}>
          {Object.entries(t.event.levels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Label>

      <Label className="text-night-muted">
        {t.event.date} / {t.event.time}
        <Input
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className={fieldClass}
        />
      </Label>

      <Label className="text-night-muted">
        {t.event.place}
        <Input required value={venueName} onChange={(e) => setVenueName(e.target.value)} className={fieldClass} />
      </Label>

      <Label className="text-night-muted">
        {t.event.addEventForm.addressLabel}
        <Input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} className={fieldClass} />
      </Label>

      <Label className="text-night-muted">
        {t.event.description}
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
      </Label>

      <Label className="text-night-muted">
        {t.event.price}
        <Input
          placeholder={t.event.addEventForm.pricePlaceholder}
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          className={fieldClass}
        />
      </Label>

      <Label className="text-night-muted">
        {t.event.registerExternal}
        <Input
          type="url"
          placeholder={t.event.addEventForm.linkPlaceholder}
          value={externalLinkUrl}
          onChange={(e) => setExternalLinkUrl(e.target.value)}
          className={fieldClass}
        />
      </Label>

      <Label className="text-night-muted">
        {t.event.addEventForm.photoUrlLabel}
        <Input
          type="url"
          placeholder={t.event.addEventForm.linkPlaceholder}
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          className={fieldClass}
        />
      </Label>

      <Label className="text-night-muted">
        {t.event.tags} ({t.event.tagsHint})
        <Input value={tags} onChange={(e) => setTags(e.target.value)} className={fieldClass} />
      </Label>

      <p className="text-sm text-night-muted">{t.event.addEventForm.submitNote}</p>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button type="submit" disabled={loading} className="border-none bg-gradient-night-cta">
        {t.common.submit}
      </Button>
    </FormRoot>
  );
}
