"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type BranchFormValue = {
  id: string;
  address: string;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CityOption = { id: string; nameRu: string };

// По образцу SchoolFaqFormModal/FaqFormModal — тот же модальный CRUD, поля
// latitude/longitude необязательны (2026-09-17, перенос публичной страницы
// школы, SchoolBranch.latitude/longitude): школа может оставить филиал без
// координат, тогда карта на публичной странице просто не показывается.
export function BranchFormModal({
  schoolSlug,
  mode,
  initial,
  cities,
  onClose,
}: {
  schoolSlug: string;
  mode: "create" | "edit";
  initial?: BranchFormValue;
  cities: CityOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(initial?.address ?? "");
  const [cityId, setCityId] = useState(initial?.cityId ?? "");
  const [latitude, setLatitude] = useState(initial?.latitude != null ? String(initial.latitude) : "");
  const [longitude, setLongitude] = useState(initial?.longitude != null ? String(initial.longitude) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const lat = latitude.trim() === "" ? null : Number(latitude);
      const lng = longitude.trim() === "" ? null : Number(longitude);
      if ((lat === null) !== (lng === null)) {
        setError("Укажите и широту, и долготу, либо оставьте оба поля пустыми.");
        return;
      }
      if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
        setError("Координаты должны быть числами.");
        return;
      }

      const url = mode === "create" ? `/api/schools/${schoolSlug}/branches` : `/api/schools/${schoolSlug}/branches/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, cityId: cityId || null, latitude: lat, longitude: lng }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось сохранить филиал.");
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="branch-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {mode === "create" ? "Новый филиал" : "Редактировать филиал"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {error && <p className="m-0 text-sm text-red-400">{error}</p>}

              <Label className="text-admin-muted">
                Адрес
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className={FIELD_CLASS} required />
              </Label>

              <Label className="text-admin-muted">
                Город (если отличается от города школы)
                <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className={FIELD_CLASS}>
                  <option value="">— как у школы —</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameRu}
                    </option>
                  ))}
                </Select>
              </Label>

              <div className="grid grid-cols-2 gap-3">
                <Label className="text-admin-muted">
                  Широта
                  <Input
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className={FIELD_CLASS}
                    placeholder="53.9006"
                    inputMode="decimal"
                  />
                </Label>
                <Label className="text-admin-muted">
                  Долгота
                  <Input
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className={FIELD_CLASS}
                    placeholder="27.5590"
                    inputMode="decimal"
                  />
                </Label>
              </div>
              <p className="m-0 text-xs text-admin-disabled">
                Координаты необязательны — без них на публичной странице показывается только адрес, без карты. Найти координаты можно на
                openstreetmap.org: правый клик по точке → «Показать адрес».
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
            <Button type="button" variant="adminOutline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" variant="admin" disabled={saving || !address.trim()}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
