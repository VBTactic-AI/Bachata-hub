"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { t } from "@/lib/i18n/dictionary";

type DancerResult = {
  dancerId: string;
  displayName: string;
  gender: "MALE" | "FEMALE" | null;
  email: string;
};

export function DancerSearchBox({
  competitionId,
  onSelect,
}: {
  competitionId: string;
  onSelect: (dancer: DancerResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DancerResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/competitions/${competitionId}/dancer-search?q=${encodeURIComponent(query)}`);
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
    <div className="rounded-app-sm border border-line bg-primary-light/40 p-3">
      <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold">
        Найти существующего участника по имени
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
            placeholder="Тихон* — подстановка в начале/конце имени"
          />
          <Button type="button" size="sm" variant="secondary" disabled={loading || query.trim().length < 2} onClick={search}>
            Найти
          </Button>
        </div>
      </label>

      {error && <p className="error-text mt-2">{error}</p>}

      {results && (
        <div className="mt-2 stack gap-1.5">
          {results.length === 0 ? (
            <p className="hint-text">Никого не нашлось — впишите email вручную ниже, создастся новый аккаунт.</p>
          ) : (
            results.map((d) => (
              <button
                key={d.dancerId}
                type="button"
                onClick={() => {
                  onSelect(d);
                  setResults(null);
                  setQuery(d.displayName);
                }}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-app-sm border border-line bg-surface px-3 py-2 text-left hover:border-primary"
              >
                <span className="font-semibold text-ink">{d.displayName}</span>
                <span className="hint-text">
                  {d.gender ? t.dancer.gender[d.gender] : "пол не указан"} · {d.email}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
