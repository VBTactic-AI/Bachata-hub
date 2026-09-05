"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea } from "@/components/ui/field";

export type PublicInfo = { rulesText: string; rulesUrl: string; mediaUrl: string };

// Публичная информация (Этап 12) — что видят зрители на /compete/[id], ни на
// что в движке не влияет. Тот же приём "режим редактирования", что и
// DivisionSettingsPanel.tsx.
export function PublicInfoPanel({ competitionId, info }: { competitionId: string; info: PublicInfo }) {
  const [current, setCurrent] = useState(info);
  const [editing, setEditing] = useState(false);
  const [rulesText, setRulesText] = useState(info.rulesText);
  const [rulesUrl, setRulesUrl] = useState(info.rulesUrl);
  const [mediaUrl, setMediaUrl] = useState(info.mediaUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setLoading(true);
    setError(null);
    const next: PublicInfo = { rulesText, rulesUrl, mediaUrl };
    const res = await fetch(`/api/competitions/${competitionId}/public-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить.");
      return;
    }
    setCurrent(next);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="hint-text m-0">
          Правила: {current.rulesText || current.rulesUrl ? "заданы" : "не заданы"} · Фотоальбом: {current.mediaUrl ? "заданы" : "не задан"}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          изменить публичную информацию
        </Button>
      </div>
    );
  }

  return (
    <div className="stack gap-2 mt-2 rounded-app-sm border border-line p-3">
      <p className="hint-text m-0">Видно всем на публичной странице соревнования — на работу движка не влияет.</p>
      <Label>
        Правила (текст)
        <Textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={4} placeholder="Можно оставить пустым" />
      </Label>
      <Label>
        Правила (ссылка на внешний источник)
        <Input value={rulesUrl} onChange={(e) => setRulesUrl(e.target.value)} placeholder="https://…" />
      </Label>
      <Label>
        Ссылка на фотоальбом/видео
        <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
      </Label>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={onSave}>
          Сохранить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => {
            setRulesText(current.rulesText);
            setRulesUrl(current.rulesUrl);
            setMediaUrl(current.mediaUrl);
            setError(null);
            setEditing(false);
          }}
        >
          отмена
        </Button>
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}
