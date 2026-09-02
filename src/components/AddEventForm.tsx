"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

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
    return <p>{t.event.addEventForm.submitted}</p>;
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 560 }}>
      <label>
        {t.event.addEventForm.titleField}
        <input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label>
        {t.event.city}
        <select required value={cityId} onChange={(e) => setCityId(e.target.value)}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameRu}
            </option>
          ))}
        </select>
      </label>

      {ownedSchools.length > 0 ? (
        <label>
          {t.event.organizer}
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            {ownedSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          {t.event.organizer}
          <input
            placeholder={t.event.addEventForm.organizerPlaceholder}
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
          />
        </label>
      )}

      <label>
        {t.event.format}
        <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
          {Object.entries(t.event.formats).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t.event.level}
        <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
          {Object.entries(t.event.levels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t.event.date} / {t.event.time}
        <input
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </label>

      <label>
        {t.event.place}
        <input required value={venueName} onChange={(e) => setVenueName(e.target.value)} />
      </label>

      <label>
        {t.event.addEventForm.addressLabel}
        <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
      </label>

      <label>
        {t.event.description}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <label>
        {t.event.price}
        <input
          placeholder={t.event.addEventForm.pricePlaceholder}
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
        />
      </label>

      <label>
        {t.event.registerExternal}
        <input
          type="url"
          placeholder={t.event.addEventForm.linkPlaceholder}
          value={externalLinkUrl}
          onChange={(e) => setExternalLinkUrl(e.target.value)}
        />
      </label>

      <label>
        {t.event.addEventForm.photoUrlLabel}
        <input
          type="url"
          placeholder={t.event.addEventForm.linkPlaceholder}
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
        />
      </label>

      <label>
        {t.event.tags} ({t.event.tagsHint})
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>

      <p className="hint-text">{t.event.addEventForm.submitNote}</p>
      {error && <p className="error-text">{error}</p>}

      <button className="btn" type="submit" disabled={loading}>
        {t.common.submit}
      </button>
    </form>
  );
}
