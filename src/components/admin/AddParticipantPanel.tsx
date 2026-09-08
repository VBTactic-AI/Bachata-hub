"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/field";
import { DancerSearchBox } from "@/components/admin/DancerSearchBox";

type Division = { id: string; name: string };
type SelectedDancer = { dancerId: string; displayName: string; email: string; gender: "MALE" | "FEMALE" | null };

// Заменяет прежний AdminRegisterForm целиком (redesign, 2026-09-09, по
// прямому запросу пользователя — быстрая регистрация "по email вручную"
// убрана насовсем: участники, у которых ещё нет аккаунта на сайте,
// регистрируются сами через /compete). Единственный путь добавить кого-то
// вручную — найти уже существующего танцора по имени и выбрать категорию/
// роль; кнопка недоступна, пока никто не выбран из результатов поиска.
export function AddParticipantPanel({ competitionId, divisions }: { competitionId: string; divisions: Division[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedDancer | null>(null);
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [role, setRole] = useState<"LEADER" | "FOLLOWER">("LEADER");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!selected) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/competitions/${competitionId}/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId, role, email: selected.email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить участника.");
      return;
    }
    setSelected(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <DancerSearchBox
        competitionId={competitionId}
        onSelect={(d) => {
          setSelected(d);
          setError(null);
        }}
      />

      {selected && (
        <div className="rounded-app-sm border border-admin-border bg-admin-card2/60 px-3 py-2 text-sm text-night-text">
          Выбран: <strong>{selected.displayName}</strong>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Label className="text-admin-muted">
          Категория
          <Select
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            className="border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="text-admin-muted">
          Роль
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            <option value="LEADER">Партнёр (Leader)</option>
            <option value="FOLLOWER">Партнёрша (Follower)</option>
          </Select>
        </Label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="admin" disabled={loading || !selected || !divisionId} onClick={onSubmit}>
          Сохранить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => {
            setSelected(null);
            setError(null);
          }}
          className="border-admin-border bg-transparent text-night-text hover:bg-admin-card"
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}
