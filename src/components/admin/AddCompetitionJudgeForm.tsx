"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type JudgeResult = { judgeUserId: string; displayName: string; email: string };

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Единственное место, где заводится НОВЫЙ (для этого соревнования) судья —
// "Общий список судей" (вкладка "Судьи", по запросу пользователя, 2026-09-09,
// п.3/6/7). Поиск по имени (как JudgeSearchBox), но без email в интерфейсе
// вообще: выбор кандидата — по клику на карточку с именем, "Добавить"
// подтверждает. Ниже, на конкретных категориях, доступен только выбор из уже
// добавленных здесь людей (DivisionJudgesPanel) — email там тоже не нужен,
// так как обе формы работают через judgeUserId, не через ввод текста.
export function AddCompetitionJudgeForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JudgeResult[] | null>(null);
  const [selected, setSelected] = useState<JudgeResult | null>(null);
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
    setSelected(null);
  }

  async function onAdd() {
    if (!selected) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/competitions/${competitionId}/judges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeUserId: selected.judgeUserId }),
    });
    setAdding(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить судью.");
      return;
    }
    setQuery("");
    setResults(null);
    setSelected(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-night-text">
        Найти судью по имени
        <div className="flex flex-wrap gap-2">
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
            style={{ maxWidth: 260 }}
          />
          <Button type="button" size="sm" variant="adminOutline" disabled={searching || query.trim().length < 2} onClick={search}>
            Найти
          </Button>
        </div>
      </label>

      {results && (
        <div className="flex flex-col gap-1.5">
          {results.length === 0 ? (
            <p className="m-0 text-sm text-admin-muted">Никого не нашлось.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.judgeUserId}
                type="button"
                onClick={() => setSelected(r)}
                className={`w-full rounded-app-sm border px-3 py-2 text-left text-sm font-medium transition-colors ${
                  selected?.judgeUserId === r.judgeUserId
                    ? "border-admin-primary bg-admin-primary/15 text-night-text"
                    : "border-admin-border bg-admin-card text-night-text hover:border-admin-primary"
                }`}
              >
                {r.displayName}
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="admin" disabled={!selected || adding} onClick={onAdd}>
          + Добавить
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
