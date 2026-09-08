"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

type JudgeResult = { judgeUserId: string; displayName: string; email: string };

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Единственное место, где заводится НОВЫЙ (для этого соревнования) судья —
// "Общий список судей" (вкладка "Судьи"). Поиск по имени, без email в
// интерфейсе вообще. Вся форма — одна горизонтальная строка (по запросу
// пользователя, 2026-09-09): поле имени, "Найти", результат — выпадающий
// список (не столбик кнопок, как раньше), "Добавить".
export function AddCompetitionJudgeForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JudgeResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setError(null);
    setSearching(true);
    const res = await fetch(`/api/competitions/${competitionId}/judge-search?q=${encodeURIComponent(query)}`);
    setSearching(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось выполнить поиск.");
      return;
    }
    const data = await res.json();
    setResults(data.results);
    setSelectedId(data.results[0]?.judgeUserId ?? "");
    setSearched(true);
  }

  async function onAdd() {
    if (!selectedId) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/competitions/${competitionId}/judges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeUserId: selectedId }),
    });
    setAdding(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить судью.");
      return;
    }
    setQuery("");
    setResults([]);
    setSelectedId("");
    setSearched(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-night-text">
          Найти судью по имени
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            placeholder="Иван* — подстановка в начале/конце имени"
            className={FIELD_CLASS}
            style={{ maxWidth: 240 }}
          />
        </label>
        <Button type="button" size="sm" variant="adminOutline" disabled={searching || query.trim().length < 2} onClick={search}>
          Найти
        </Button>
        {searched &&
          (results.length === 0 ? (
            <span className="pb-1.5 text-sm text-admin-muted">Никого не нашлось.</span>
          ) : (
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={FIELD_CLASS} style={{ maxWidth: 220 }}>
              {results.map((r) => (
                <option key={r.judgeUserId} value={r.judgeUserId}>
                  {r.displayName}
                </option>
              ))}
            </Select>
          ))}
        <Button type="button" size="sm" variant="admin" disabled={!selectedId || adding} onClick={onAdd}>
          + Добавить
        </Button>
      </div>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
