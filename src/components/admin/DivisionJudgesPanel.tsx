"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { AddButton } from "@/components/admin/AddButton";
import { TrashIcon } from "@/components/admin/icons";
import { REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL } from "@/lib/competition-labels";

export type PoolJudge = { judgeUserId: string; judgeEmail: string; displayName: string | null };
type Role = "LEADER" | "FOLLOWER";

function judgeName(j: PoolJudge | undefined, fallbackId: string): string {
  return j?.displayName || j?.judgeEmail || fallbackId;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

const NEEDS_MANUAL_ROLE_MARKER = "Укажите роль вручную";

// Судейская сетка одной категории (redesign 2026-09-09, п.3/4/6/7 запроса
// пользователя) — компактная таблица + добавление ТОЛЬКО из уже
// существующего ростера судей соревнования (см. "Общий список судей" —
// AddCompetitionJudgeForm.tsx — там же единственное место, где заводится
// новый человек). Здесь нет ни email, ни поиска, ни ручного выбора роли по
// умолчанию — роль вычисляется сервером из пола судьи (assignJudge,
// judge-assignment.ts); ручной селект появляется только если сервер явно
// сказал, что автоматика не сработала (пол не указан в профиле).
export function DivisionJudgesPanel({
  divisionId,
  pool,
  leaderJudgeUserIds,
  followerJudgeUserIds,
}: {
  divisionId: string;
  pool: PoolJudge[];
  leaderJudgeUserIds: string[];
  followerJudgeUserIds: string[];
}) {
  const router = useRouter();
  const [leaders, setLeaders] = useState<Set<string>>(() => new Set(leaderJudgeUserIds));
  const [followers, setFollowers] = useState<Set<string>>(() => new Set(followerJudgeUserIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ре-синхронизация с сервером после router.refresh() — см. подробное
  // объяснение в истории этого файла (без этого эффекта только что
  // добавленный судья молча пропадал бы из чекнутого набора).
  useEffect(() => setLeaders(new Set(leaderJudgeUserIds)), [leaderJudgeUserIds]);
  useEffect(() => setFollowers(new Set(followerJudgeUserIds)), [followerJudgeUserIds]);

  const poolById = new Map(pool.map((j) => [j.judgeUserId, j]));
  const rows = [
    ...[...leaders].map((judgeUserId) => ({ judgeUserId, role: "LEADER" as Role })),
    ...[...followers].map((judgeUserId) => ({ judgeUserId, role: "FOLLOWER" as Role })),
  ].sort((a, b) => judgeName(poolById.get(a.judgeUserId), a.judgeUserId).localeCompare(judgeName(poolById.get(b.judgeUserId), b.judgeUserId), "ru"));

  const hasChanges = !setsEqual(leaders, new Set(leaderJudgeUserIds)) || !setsEqual(followers, new Set(followerJudgeUserIds));

  function removeRow(role: Role, judgeUserId: string) {
    const setSet = role === "LEADER" ? setLeaders : setFollowers;
    setSet((prev) => {
      const next = new Set(prev);
      next.delete(judgeUserId);
      return next;
    });
  }

  function resetChanges() {
    setLeaders(new Set(leaderJudgeUserIds));
    setFollowers(new Set(followerJudgeUserIds));
    setError(null);
  }

  async function onSave() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}/judges`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaderJudgeUserIds: [...leaders], followerJudgeUserIds: [...followers] }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить судей.");
      return;
    }
    router.refresh();
  }

  // Уже в общем ростере соревнования, но ещё не в этой категории.
  const availableFromPool = pool.filter((j) => !leaders.has(j.judgeUserId) && !followers.has(j.judgeUserId));
  const [pickJudgeId, setPickJudgeId] = useState("");
  const [manualRole, setManualRole] = useState<Role>("LEADER");
  const [needsManualRole, setNeedsManualRole] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Роль — из пола судьи, сервер решает сам (assignJudge). Ручной выбор
  // подключается только при ответе "не удалось определить роль автоматически"
  // (у судьи не указан пол) — тогда форма показывает Select и повторяет
  // попытку с явной ролью.
  async function addFromPool(e: React.FormEvent) {
    e.preventDefault();
    if (!pickJudgeId) return;
    setAddLoading(true);
    setAddError(null);
    const res = await fetch(`/api/divisions/${divisionId}/judges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeUserId: pickJudgeId, ...(needsManualRole ? { role: manualRole } : {}) }),
    });
    setAddLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message: string = data.error || "Не удалось добавить судью.";
      if (!needsManualRole && message.includes(NEEDS_MANUAL_ROLE_MARKER)) {
        setNeedsManualRole(true);
      }
      setAddError(message);
      return;
    }
    setPickJudgeId("");
    setNeedsManualRole(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm font-semibold text-night-text">
          Судьи категории <span className="font-normal text-admin-muted">({rows.length})</span>
        </p>
        {availableFromPool.length > 0 && (
          <AddButton label="Изменить состав" gradientClassName="bg-gradient-admin-cta">
            <form onSubmit={addFromPool} className="flex flex-col gap-2">
              <p className="m-0 text-sm text-admin-muted">Выберите судью из уже добавленных в «Общий список судей».</p>
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={pickJudgeId}
                  onChange={(e) => {
                    setPickJudgeId(e.target.value);
                    setNeedsManualRole(false);
                    setAddError(null);
                  }}
                  className={FIELD_CLASS}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">Выберите судью…</option>
                  {availableFromPool.map((j) => (
                    <option key={j.judgeUserId} value={j.judgeUserId}>
                      {judgeName(j, j.judgeUserId)}
                    </option>
                  ))}
                </Select>
                {needsManualRole && (
                  <Select value={manualRole} onChange={(e) => setManualRole(e.target.value as Role)} className={FIELD_CLASS} style={{ maxWidth: 150 }}>
                    <option value="LEADER">Партнёров</option>
                    <option value="FOLLOWER">Партнёрш</option>
                  </Select>
                )}
                <Button type="submit" size="sm" variant="adminOutline" disabled={!pickJudgeId || addLoading}>
                  Добавить
                </Button>
              </div>
              {addError && <p className="m-0 text-xs text-red-400">{addError}</p>}
            </form>
          </AddButton>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="m-0 text-sm text-admin-muted">Судьи пока не назначены.</p>
      ) : (
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-2.5 py-2 font-semibold">Судья</th>
                <th className="px-2.5 py-2 font-semibold">Судит</th>
                <th className="px-2.5 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const j = poolById.get(r.judgeUserId);
                const name = judgeName(j, r.judgeUserId);
                return (
                  <tr key={`${r.role}:${r.judgeUserId}`} className="border-t border-admin-border">
                    <td className="px-2.5 py-2 align-middle font-medium text-night-text">{name}</td>
                    <td className="px-2.5 py-2 align-middle text-admin-muted">{REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL[r.role]}</td>
                    <td className="px-2.5 py-2 align-middle">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeRow(r.role, r.judgeUserId)}
                          title="Убрать"
                          aria-label={`Убрать судью ${name}`}
                          className="text-admin-muted hover:text-red-400"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasChanges && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="admin" disabled={loading} onClick={onSave}>
            Сохранить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={resetChanges}
            className="border-admin-border bg-transparent text-night-text hover:bg-admin-card"
          >
            Отмена
          </Button>
          <span className="text-xs text-admin-muted">Изменения не сохранены</span>
        </div>
      )}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
