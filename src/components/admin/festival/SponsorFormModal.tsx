"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type SponsorFormValue = {
  id: string;
  name: string;
  tier: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  amount: number | null;
  currency: string | null;
};

// Создание/редактирование спонсора — тот же приём модалки, что и
// ProgramItemFormModal.tsx. amount попадает в «Доход» бюджета (Stage 2
// сервисного слоя, festival-budget-service.ts) — nullable, спонсор может
// быть бартерным/информационным без денежного взноса.
export function SponsorFormModal({
  festivalId,
  mode,
  initial,
  onClose,
}: {
  festivalId: string;
  mode: "create" | "edit";
  initial?: SponsorFormValue;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [tier, setTier] = useState(initial?.tier ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl ?? "");
  const [hasAmount, setHasAmount] = useState(initial?.amount != null);
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "BYN");
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
      const payload = {
        name,
        tier,
        logoUrl: logoUrl.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        amount: hasAmount && amount ? Number(amount) : null,
        currency: hasAmount ? currency || null : null,
      };
      const url = mode === "create" ? `/api/festivals/${festivalId}/sponsors` : `/api/festivals/${festivalId}/sponsors/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось сохранить спонсора.");
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
        aria-labelledby="sponsor-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="sponsor-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {mode === "create" ? "Новый спонсор" : "Редактировать спонсора"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {error && <p className="m-0 text-sm text-red-400">{error}</p>}

              <Label className="text-admin-muted">
                Название
                <Input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} placeholder="Latin Vibe Studio" required />
              </Label>

              <Label className="text-admin-muted">
                Уровень
                <Input value={tier} onChange={(e) => setTier(e.target.value)} className={FIELD_CLASS} placeholder="Генеральный спонсор" required />
              </Label>

              <Label className="text-admin-muted">
                Логотип (ссылка)
                <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={FIELD_CLASS} placeholder="https://…" />
              </Label>

              <Label className="text-admin-muted">
                Сайт
                <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={FIELD_CLASS} placeholder="https://…" />
              </Label>

              <label className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={hasAmount} onChange={(e) => setHasAmount(e.target.checked)} />
                Денежный взнос (попадает в доход бюджета)
              </label>
              {hasAmount && (
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={FIELD_CLASS} />
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS} placeholder="BYN" />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
            <Button type="button" variant="adminOutline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" variant="admin" disabled={saving || !name.trim() || !tier.trim()}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
