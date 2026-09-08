"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type JudgeResult = { judgeUserId: string; displayName: string; email: string };

// По образцу DancerSearchBox.tsx — та же проблема (искать по имени, не по
// email, который на живом check-in/судействе никто не помнит наизусть),
// только для формы "Добавить нового судью" (DivisionJudgesPanel.tsx),
// которая раньше принимала только точный email (найдено пользователем на
// реальных данных конкурса с 13 судьями, 2026-09-06).
export function JudgeSearchBox({ competitionId, onSelect }: { competitionId: string; onSelect: (judge: JudgeResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JudgeResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/competitions/${competitionId}/judge-search?q=${encodeURIComponent(query)}`);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось выполнить поиск.");
      return;
    }
    const data = await res.json();
    setResults(data.results);
  }

  return (
    <div className="rounded-app-sm border border-admin-border bg-admin-card2/60 p-3">
      <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-night-text">
        Найти судью по имени
        <div className="flex gap-2">
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
            className="border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          />
          <Button type="button" size="sm" variant="adminOutline" disabled={loading || query.trim().length < 2} onClick={search}>
            Найти
          </Button>
        </div>
      </label>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {results && (
        <div className="mt-2 flex flex-col gap-1.5">
          {results.length === 0 ? (
            <p className="text-sm text-admin-muted">Никого не нашлось — впишите email вручную ниже.</p>
          ) : (
            results.map((j) => (
              <button
                key={j.judgeUserId}
                type="button"
                onClick={() => {
                  onSelect(j);
                  setResults(null);
                  setQuery(j.displayName);
                }}
                className="flex w-full items-center rounded-app-sm border border-admin-border bg-admin-card px-3 py-2 text-left hover:border-admin-primary"
              >
                <span className="font-semibold text-night-text">{j.displayName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
