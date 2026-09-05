"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type Stage = { id: string; name: string; defaultAdvanceCount: number; isActive: boolean };

// Горизонтальная временная шкала этапов (по референсу пользователя,
// 07.09.2026) — фиолетовый акцент (night-violet), отдельный от основной
// маджента-палитры сайта, специально для этого экрана. Клик по названию —
// то же инлайн-редактирование, что раньше было в EditRoundStageForm.
function StageStep({ stage, index, isLast }: { stage: Stage; index: number; isLast: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [count, setCount] = useState(String(stage.defaultAdvanceCount));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const changed = name !== stage.name || Number(count) !== stage.defaultAdvanceCount;

  async function save() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/round-stages/${stage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, defaultAdvanceCount: Number(count) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить изменения.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function toggleActive() {
    setLoading(true);
    await fetch(`/api/round-stages/${stage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !stage.isActive }),
    });
    setLoading(false);
    router.refresh();
  }

  const fieldClass =
    "!w-auto border-night-border bg-night-card2 py-1 text-sm text-night-text focus:border-night-violet focus:ring-night-violet/20";

  return (
    <div className="flex min-w-[140px] flex-1 flex-col items-center gap-2">
      <div className="flex w-full items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-night-violet text-sm font-bold text-white">
          {index + 1}
        </span>
        {!isLast && <span className="h-[2px] flex-1 bg-night-violet/50" aria-hidden="true" />}
      </div>
      {editing ? (
        <div className="flex flex-col items-center gap-1.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} style={{ maxWidth: 140 }} />
          <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className={fieldClass} style={{ maxWidth: 90 }} />
          <div className="flex gap-1.5">
            {changed && !!name.trim() && (
              <Button type="button" size="sm" disabled={loading} onClick={save} className="border-none bg-gradient-night-violet">
                Сохранить
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => setEditing(false)}
              className="border-night-border bg-transparent text-night-text hover:bg-night-card2"
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={toggleActive}
              className="border-night-border bg-transparent text-night-muted hover:bg-night-card2"
            >
              {stage.isActive ? "Скрыть" : "Вернуть"}
            </Button>
          </div>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="flex flex-col items-center gap-0.5 text-center">
          <span className="text-sm font-semibold text-night-text hover:text-night-violet">{stage.name}</span>
          <span className="text-xs text-night-muted">{stage.defaultAdvanceCount}</span>
          {!stage.isActive && <span className="text-[0.65rem] uppercase tracking-wide text-night-disabled">скрыт</span>}
        </button>
      )}
    </div>
  );
}

export function RoundStageTimeline({ stages }: { stages: Stage[] }) {
  if (stages.length === 0) return <p className="text-sm text-night-muted">Пока нет ни одного этапа.</p>;
  return (
    <div className="flex items-start gap-1 overflow-x-auto pb-2">
      {stages.map((s, i) => (
        <StageStep key={s.id} stage={s} index={i} isLast={i === stages.length - 1} />
      ))}
    </div>
  );
}
