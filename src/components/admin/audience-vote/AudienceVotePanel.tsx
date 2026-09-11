"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Input, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";

type AudienceVoteMode = "GENERAL" | "BY_ROLE";
type AudienceVoteDisplayMode = "NUMBER_ONLY" | "NUMBER_AND_NAME";
type AudienceVoteStatus = "IDLE" | "RUNNING" | "CLOSED" | "PUBLISHED";
type AudienceVoteRole = "LEADER" | "FOLLOWER" | "ANY";

type Candidate = { registrationId: string; role: "LEADER" | "FOLLOWER"; bibNumber: string | null; displayName: string };

type AdminView = {
  id: string;
  divisionId: string;
  categoryName: string;
  mode: AudienceVoteMode;
  displayMode: AudienceVoteDisplayMode;
  infoText: string | null;
  status: AudienceVoteStatus;
  startedAt: string | null;
  closesAt: string | null;
  closedAt: string | null;
  publishedAt: string | null;
  candidates: Candidate[];
  tally: Record<string, number>;
  winners: { role: AudienceVoteRole; registrationId: string; voteCount: number }[];
};

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const POLL_MS = 4000;

const STATUS_LABEL: Record<AudienceVoteStatus, string> = {
  IDLE: "Не настроено / не запущено",
  RUNNING: "Идёт",
  CLOSED: "Закрыто — ждём решения",
  PUBLISHED: "Опубликовано",
};

function roleLabel(role: "LEADER" | "FOLLOWER") {
  return role === "LEADER" ? "Партнёр" : "Партнёрша";
}

// Приз зрительских симпатий — одна карточка на категорию (docs/00_DECISIONS.md,
// план "Приз зрительских симпатий", согласован с пользователем 2026-09-11).
// Настройки редактируются только пока IDLE; после старта — фиксируются
// (тот же принцип, что и CompetitionRules/FinalSettings). Живой tally виден
// организатору всегда, независимо от статуса.
export function AudienceVotePanel({ divisionId, categoryName }: { divisionId: string; categoryName: string }) {
  const [view, setView] = useState<AdminView | null | undefined>(undefined); // undefined — ещё грузится
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  // Черновик настроек (форма) — отдельно от того, что реально сохранено.
  const [mode, setMode] = useState<AudienceVoteMode>("GENERAL");
  const [displayMode, setDisplayMode] = useState<AudienceVoteDisplayMode>("NUMBER_AND_NAME");
  const [infoText, setInfoText] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [selectedWinners, setSelectedWinners] = useState<Record<string, Set<string>>>({}); // role -> registrationIds
  const [unpublishReason, setUnpublishReason] = useState("");
  const [showUnpublishForm, setShowUnpublishForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/divisions/${divisionId}/audience-vote`);
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        setError(data.error || "Не удалось загрузить голосование.");
        return;
      }
      setError(null);
      const v = data.view as AdminView | null;
      setView(v);
      if (v) {
        setMode(v.mode);
        setDisplayMode(v.displayMode);
        setInfoText(v.infoText ?? "");
      }
    } catch {
      if (mountedRef.current) setError("Не удалось связаться с сервером.");
    }
  }, [divisionId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Поллинг только пока идёт голосование — до старта и после закрытия числа
  // сами не меняются, лишний трафик не нужен.
  useEffect(() => {
    if (view?.status !== "RUNNING") return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [view?.status, load]);

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}/audience-vote${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось выполнить действие.");
      return false;
    }
    await load();
    return true;
  }

  async function onConfigure() {
    await call("", { mode, displayMode, infoText: infoText.trim() || null });
  }

  async function onStart() {
    const minutes = durationMinutes.trim() ? Number(durationMinutes) : undefined;
    await call("/start", { durationMinutes: minutes });
  }

  async function onStop() {
    await call("/stop");
  }

  function toggleWinner(role: string, registrationId: string) {
    setSelectedWinners((prev) => {
      const next = new Set(prev[role] ?? []);
      if (next.has(registrationId)) next.delete(registrationId);
      else next.add(registrationId);
      return { ...prev, [role]: next };
    });
  }

  async function onConfirmWinners(role: string) {
    const registrationIds = [...(selectedWinners[role] ?? [])];
    await call("/confirm-winners", { role, registrationIds });
  }

  async function onPublish() {
    await call("/publish");
  }

  async function onUnpublish() {
    if (!unpublishReason.trim()) {
      setError("Нужно указать причину отмены публикации.");
      return;
    }
    const ok = await call("/unpublish", { reason: unpublishReason });
    if (ok) {
      setShowUnpublishForm(false);
      setUnpublishReason("");
    }
  }

  if (view === undefined) {
    return <div className="rounded-app border border-admin-border bg-admin-card p-4 text-sm text-admin-muted">Загрузка…</div>;
  }

  const roleGroups: AudienceVoteRole[] = view && view.mode === "BY_ROLE" ? ["LEADER", "FOLLOWER"] : ["ANY"];
  const candidatesForRole = (role: AudienceVoteRole) =>
    !view ? [] : role === "ANY" ? view.candidates : view.candidates.filter((c) => c.role === role);

  return (
    <div className="flex flex-col gap-3 rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-night text-base font-bold text-night-text">{categoryName}</h3>
        <StatusBadge
          label={STATUS_LABEL[view?.status ?? "IDLE"]}
          variant={view?.status === "RUNNING" ? "success" : view?.status === "PUBLISHED" ? "success" : view?.status === "CLOSED" ? "warning" : "neutral"}
        />
      </div>

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {/* Настройки — редактируются только пока голосование не запущено (IDLE) */}
      {(!view || view.status === "IDLE") && (
        <div className="flex flex-col gap-2.5 rounded-app-sm border border-admin-border bg-admin-card2 p-3">
          <Label className="text-night-text">
            Формат голосования
            <Select value={mode} onChange={(e) => setMode(e.target.value as AudienceVoteMode)} className={FIELD_CLASS}>
              <option value="GENERAL">Общий приз — один голос за любого участника</option>
              <option value="BY_ROLE">Раздельно — за партнёра и за партнёршу</option>
            </Select>
          </Label>
          <Label className="text-night-text">
            Отображение участников
            <Select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as AudienceVoteDisplayMode)} className={FIELD_CLASS}>
              <option value="NUMBER_AND_NAME">Номер и ФИО</option>
              <option value="NUMBER_ONLY">Только номер</option>
            </Select>
          </Label>
          <Label className="text-night-text">
            Текст для страницы голосования (необязательно)
            <Textarea value={infoText} onChange={(e) => setInfoText(e.target.value)} className={FIELD_CLASS} placeholder="Правила голосования, обращение к залу…" />
          </Label>
          <div>
            <Button type="button" size="sm" variant="admin" disabled={busy} onClick={onConfigure}>
              {view ? "Сохранить настройки" : "Настроить голосование"}
            </Button>
          </div>

          {view && (
            <div className="mt-1 flex flex-wrap items-end gap-2 border-t border-admin-border pt-2.5">
              <Label className="max-w-[200px] text-night-text">
                Таймер (минут, необязательно)
                <Input
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="без таймера"
                />
              </Label>
              <Button type="button" size="sm" variant="admin" disabled={busy} onClick={onStart}>
                Начать голосование
              </Button>
            </div>
          )}
        </div>
      )}

      {view && view.status === "RUNNING" && (
        <div>
          <Button type="button" size="sm" variant="adminOutline" disabled={busy} onClick={onStop}>
            Остановить голосование
          </Button>
          {view.closesAt && <p className="m-0 mt-1 text-xs text-admin-muted">Автозакрытие: {new Date(view.closesAt).toLocaleTimeString("ru-RU")}</p>}
        </div>
      )}

      {/* Live-результаты — видны всегда, независимо от статуса */}
      {view && view.candidates.length > 0 && (
        <div className="overflow-x-auto rounded-app-sm border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">№</th>
                <th className="px-3 py-2 font-semibold">Участник</th>
                <th className="px-3 py-2 font-semibold">Роль</th>
                <th className="px-3 py-2 text-right font-semibold">Голосов</th>
              </tr>
            </thead>
            <tbody>
              {view.candidates
                .slice()
                .sort((a, b) => (view.tally[b.registrationId] ?? 0) - (view.tally[a.registrationId] ?? 0))
                .map((c) => (
                  <tr key={c.registrationId} className="border-t border-admin-border">
                    <td className="px-3 py-2 text-night-text">{c.bibNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-night-text">{c.displayName}</td>
                    <td className="px-3 py-2 text-admin-muted">{roleLabel(c.role)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-night-text">{view.tally[c.registrationId] ?? 0}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Подтверждение победителя — только когда закрыто */}
      {view && view.status === "CLOSED" && (
        <div className="flex flex-col gap-3">
          {roleGroups.map((role) => {
            const already = view.winners.filter((w) => w.role === role).map((w) => w.registrationId);
            const selected = selectedWinners[role] ?? new Set(already);
            const candidates = candidatesForRole(role);
            return (
              <div key={role} className="rounded-app-sm border border-night-warning/30 bg-night-warning/[0.09] p-3">
                <p className="m-0 mb-2 text-[12.5px] font-bold text-night-warning">
                  ⚠ Подтвердите победителя{role !== "ANY" ? ` (${roleLabel(role as "LEADER" | "FOLLOWER")})` : ""} — вручную, по числу голосов ничья не
                  решается сама.
                </p>
                <ul className="stack gap-1 m-0 mb-2 pl-0" style={{ listStyle: "none" }}>
                  {candidates
                    .slice()
                    .sort((a, b) => (view.tally[b.registrationId] ?? 0) - (view.tally[a.registrationId] ?? 0))
                    .map((c) => (
                      <li key={c.registrationId}>
                        <label className="flex items-center gap-2 text-sm text-night-text">
                          <input
                            type="checkbox"
                            checked={selected.has(c.registrationId)}
                            onChange={() => toggleWinner(role, c.registrationId)}
                            className="accent-admin-primary"
                          />
                          №{c.bibNumber ?? "—"} {c.displayName} — {view.tally[c.registrationId] ?? 0} голос(ов)
                        </label>
                      </li>
                    ))}
                </ul>
                <Button type="button" size="sm" variant="admin" disabled={busy} onClick={() => onConfirmWinners(role)}>
                  Зафиксировать победителя
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Публикация */}
      {view && (view.status === "CLOSED" || view.status === "PUBLISHED") && (
        <div className="flex flex-wrap items-center gap-2 border-t border-admin-border pt-2.5">
          {view.status === "CLOSED" && (
            <Button type="button" size="sm" variant="admin" disabled={busy} onClick={onPublish}>
              Опубликовать результаты
            </Button>
          )}
          {view.status === "PUBLISHED" &&
            (showUnpublishForm ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Input
                  value={unpublishReason}
                  onChange={(e) => setUnpublishReason(e.target.value)}
                  className={FIELD_CLASS + " max-w-[320px]"}
                  placeholder="Причина отмены публикации"
                />
                <Button type="button" size="sm" variant="admin" disabled={busy} onClick={onUnpublish}>
                  Подтвердить
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-admin-muted" onClick={() => setShowUnpublishForm(false)}>
                  отмена
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" variant="adminOutline" disabled={busy} onClick={() => setShowUnpublishForm(true)}>
                Отменить публикацию
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
