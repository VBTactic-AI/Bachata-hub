"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  MANAGER: "Менеджер",
  EDITOR: "Редактор",
  CHECK_IN: "Check-in",
  FINANCE: "Финансы",
};

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type EventTeamMemberRow = { id: string; role: string; user: { id: string; email: string; displayName: string | null } };
type SearchResult = { userId: string; displayName: string; email: string };

// Events Engine, этап 5 — минимальная команда события (см. комментарий у
// EventTeamMember в schema.prisma: все роли сегодня дают одинаковый
// эффективный доступ, role — пока только для отображения "кто есть кто").
// Добавление — поиск существующего пользователя по имени (2026-09-18, по
// прямому запросу пользователя — заменяет прежний точный email, тот же
// UX-паттерн, что и DancerSearchBox/AddParticipantPanel в Competition
// Engine: организатор ищет, выбирает из результатов, кнопка недоступна,
// пока никто не выбран).
export function EventTeamManager({ eventSlug, initialMembers }: { eventSlug: string; initialMembers: EventTeamMemberRow[] }) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  // Фильтр по уже добавленным участникам (перенос UI-прототипа Festival
  // Engine, Stage R5, 2026-09-19, по прямому запросу пользователя — только
  // фильтр, без переключателя поиска по email) — локальный, без похода на
  // сервер: список участников события/фестиваля короткий (единицы-десятки),
  // не тысячи.
  const [memberFilter, setMemberFilter] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [role, setRole] = useState("MANAGER");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setError(null);
    setSearching(true);
    const res = await fetch(`/api/events/${eventSlug}/team/search?q=${encodeURIComponent(query)}`);
    setSearching(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось выполнить поиск.");
      return;
    }
    const data = await res.json();
    setResults(data.results);
  }

  async function addMember() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selected.userId, role }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось добавить участника.");
      return;
    }
    setMembers((prev) => [
      ...prev.filter((m) => m.user.id !== selected.userId),
      { id: data.member.id, role, user: { id: selected.userId, email: selected.email, displayName: selected.displayName } },
    ]);
    setSelected(null);
    setQuery("");
    setResults(null);
    router.refresh();
  }

  async function removeMember(userId: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/team/${userId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось убрать участника.");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.user.id !== userId));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* QA BUG-011: роль сегодня не даёт разных прав — все 4 варианта видят
          и меняют статус/оплату участников одинаково; название роли не
          обещает больше этого (например, "Редактор" НЕ даёт прав
          редактировать само событие). */}
      <p className="m-0 text-xs text-admin-muted">
        Роль пока влияет только на подпись в списке — все роли дают одинаковый доступ: просмотр участников и изменение их статуса/оплаты.
      </p>

      <div className="flex flex-col gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
        <Label className="text-admin-muted">
          Найти участника по имени
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
              placeholder="Тихон* — подстановка в начале/конце имени"
              className={FIELD_CLASS}
              style={{ maxWidth: 280 }}
            />
            <Button type="button" variant="adminOutline" disabled={searching || query.trim().length < 2} onClick={search}>
              Найти
            </Button>
          </div>
        </Label>

        {results && (
          <div className="flex flex-col gap-1.5">
            {results.length === 0 ? (
              <p className="m-0 text-sm text-admin-muted">Никого не нашлось.</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.userId}
                  type="button"
                  onClick={() => {
                    setSelected(r);
                    setResults(null);
                    setQuery(r.displayName);
                  }}
                  className="flex w-full items-center justify-between rounded-app-sm border border-admin-border bg-admin-card px-3 py-2 text-left hover:border-admin-primary"
                >
                  <span className="font-semibold text-night-text">{r.displayName}</span>
                  <span className="text-xs text-admin-muted">{r.email}</span>
                </button>
              ))
            )}
          </div>
        )}

        {selected && (
          <div className="rounded-app-sm border border-admin-border bg-admin-card2/60 px-3 py-2 text-sm text-night-text">
            Выбран: <strong>{selected.displayName}</strong> ({selected.email})
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Label className="text-admin-muted">
            Роль
            <Select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD_CLASS} style={{ maxWidth: 180 }}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Label>
          <Button type="button" variant="admin" disabled={loading || !selected} onClick={addMember}>
            Добавить
          </Button>
        </div>
      </div>
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-admin-muted">В команде пока только вы (владелец события).</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.length > 4 && (
            <Input
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              placeholder="Фильтр по имени/email…"
              className={FIELD_CLASS}
              style={{ maxWidth: 280 }}
            />
          )}
          {(() => {
            const q = memberFilter.trim().toLowerCase();
            const filtered = q
              ? members.filter((m) => (m.user.displayName ?? "").toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q))
              : members;
            if (filtered.length === 0) return <p className="m-0 text-sm text-admin-muted">Никого не найдено по фильтру.</p>;
            return (
              <div className="overflow-x-auto rounded-app border border-admin-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Имя</th>
                      <th className="px-3 py-2 font-semibold">Роль</th>
                      <th className="px-3 py-2 text-right font-semibold">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => (
                      <tr key={m.id} className="border-t border-admin-border">
                        <td className="px-3 py-2 text-night-text">
                          {m.user.displayName ?? m.user.email}
                          {m.user.displayName && <span className="ml-1.5 text-xs text-admin-muted">{m.user.email}</span>}
                        </td>
                        <td className="px-3 py-2 text-admin-muted">{ROLE_LABELS[m.role] ?? m.role}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => removeMember(m.user.id)}
                            className="text-xs text-red-400 hover:underline disabled:opacity-50"
                          >
                            Убрать
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
