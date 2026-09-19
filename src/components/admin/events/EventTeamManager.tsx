"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { TrashIcon } from "@/components/admin/icons";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Роль сегодня не даёт разных прав — все варианты видят и меняют статус/
// оплату участников одинаково (QA BUG-011) — фиксированное значение,
// UI-выбор роли убран целиком (Stage F, 2026-09-20, по прямому запросу
// пользователя), чтобы не обещать разграничение доступа, которого нет.
const DEFAULT_ROLE = "MANAGER";

export type EventTeamMemberRow = { id: string; role: string; user: { id: string; email: string; displayName: string | null } };
type SearchResult = { userId: string; displayName: string; email: string };

// Events Engine, этап 5 — минимальная команда события. Добавление — поиск
// существующего пользователя по имени (2026-09-18, по прямому запросу
// пользователя — заменяет прежний точный email, тот же UX-паттерн, что и
// DancerSearchBox/AddParticipantPanel в Competition Engine: организатор
// ищет, выбирает из результатов, кнопка недоступна, пока никто не выбран).
//
// Строка участника — только имя + корзинка с подсветкой при наведении
// (перенос UI-прототипа Festival Engine, Stage F, 2026-09-20, по прямому
// запросу пользователя — email и роль в списке НЕ показываются, в отличие
// от самого прототипа, который их рисует: тут прямое решение пользователя
// сознательно упрощает экран).
export function EventTeamManager({ eventSlug, initialMembers }: { eventSlug: string; initialMembers: EventTeamMemberRow[] }) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  // Фильтр по уже добавленным участникам (Stage R5, 2026-09-19) — локальный,
  // без похода на сервер: список участников события/фестиваля короткий.
  const [memberFilter, setMemberFilter] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<EventTeamMemberRow | null>(null);

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
      body: JSON.stringify({ userId: selected.userId, role: DEFAULT_ROLE }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось добавить участника.");
      return;
    }
    setMembers((prev) => [
      ...prev.filter((m) => m.user.id !== selected.userId),
      { id: data.member.id, role: DEFAULT_ROLE, user: { id: selected.userId, email: selected.email, displayName: selected.displayName } },
    ]);
    setSelected(null);
    setQuery("");
    setResults(null);
    router.refresh();
  }

  async function removeMember(member: EventTeamMemberRow) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/team/${member.user.id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось убрать участника.");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.user.id !== member.user.id));
    setConfirmingRemove(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
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

        <Button type="button" variant="admin" disabled={loading || !selected} onClick={addMember} className="w-fit">
          Добавить
        </Button>
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
              placeholder="Фильтр по имени…"
              className={FIELD_CLASS}
              style={{ maxWidth: 280 }}
            />
          )}
          {(() => {
            const q = memberFilter.trim().toLowerCase();
            const filtered = q
              ? members.filter((m) => (m.user.displayName ?? m.user.email).toLowerCase().includes(q))
              : members;
            if (filtered.length === 0) return <p className="m-0 text-sm text-admin-muted">Никого не найдено по фильтру.</p>;
            return (
              <div className="rounded-app border border-admin-border">
                {filtered.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 border-b border-admin-border px-3.5 py-2.5 last:border-none">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin-card2 text-xs font-bold text-admin-muted">
                      {(m.user.displayName ?? m.user.email).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-night-text">{m.user.displayName ?? m.user.email}</span>
                    <button
                      type="button"
                      title="Убрать из команды"
                      aria-label="Убрать из команды"
                      disabled={loading}
                      onClick={() => setConfirmingRemove(m)}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {confirmingRemove && (
        <ConfirmModal
          title="Убрать из команды?"
          message={`«${confirmingRemove.user.displayName ?? confirmingRemove.user.email}» потеряет доступ к управлению этим событием.`}
          confirmLabel="Убрать"
          danger
          pending={loading}
          onConfirm={() => removeMember(confirmingRemove)}
          onClose={() => setConfirmingRemove(null)}
        />
      )}
    </div>
  );
}
