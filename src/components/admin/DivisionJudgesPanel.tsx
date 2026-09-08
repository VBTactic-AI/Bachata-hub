"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { AddButton } from "@/components/admin/AddButton";
import { TrashIcon } from "@/components/admin/icons";
import { REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL } from "@/lib/competition-labels";

export type PoolJudge = { judgeUserId: string; judgeEmail: string; displayName: string | null; gender: "MALE" | "FEMALE" | null };
type Role = "LEADER" | "FOLLOWER";

function judgeName(j: PoolJudge | undefined, fallbackId: string): string {
  return j?.displayName || j?.judgeEmail || fallbackId;
}

// Та же подсказка пол→роль, что и сервер (suggestedRoleForGender,
// register-competitor.ts) — здесь только чтобы отрисовать чекбокс без
// лишнего роль-селекта, когда пол известен; окончательное решение и проверка
// всё равно на сервере (setDivisionJudges), см. комментарий там.
function roleFromGender(gender: "MALE" | "FEMALE" | null): Role | null {
  if (gender === "MALE") return "LEADER";
  if (gender === "FEMALE") return "FOLLOWER";
  return null;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Судейская сетка одной категории (redesign 2026-09-09) — компактная
// таблица + добавление ТОЛЬКО из уже существующего ростера судей
// соревнования ("Общий список судей", AddCompetitionJudgeForm.tsx — там же
// единственное место, где заводится новый человек). Выбор — множественный,
// галочками (по запросу пользователя): отмеченные сразу попадают в те же
// leaders/followers Set, что и уже сохранённые судьи, и наглядно появляются
// в таблице ниже как "ещё не сохранено" — фиксирует их одно и то же
// "Сохранить", что уже используется для удаления (тот же batch-diff,
// setDivisionJudges).
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

  // Ре-синхронизация с сервером после router.refresh() — без этого эффекта
  // только что сохранённые судьи молча пропадали бы из чекнутого набора.
  useEffect(() => setLeaders(new Set(leaderJudgeUserIds)), [leaderJudgeUserIds]);
  useEffect(() => setFollowers(new Set(followerJudgeUserIds)), [followerJudgeUserIds]);

  const poolById = new Map(pool.map((j) => [j.judgeUserId, j]));

  function roleOf(judgeUserId: string): Role | null {
    if (leaders.has(judgeUserId)) return "LEADER";
    if (followers.has(judgeUserId)) return "FOLLOWER";
    return null;
  }

  function addToSet(role: Role, judgeUserId: string) {
    const target = role === "LEADER" ? setLeaders : setFollowers;
    const other = role === "LEADER" ? setFollowers : setLeaders;
    other((prev) => {
      if (!prev.has(judgeUserId)) return prev;
      const next = new Set(prev);
      next.delete(judgeUserId);
      return next;
    });
    target((prev) => new Set(prev).add(judgeUserId));
  }

  function removeFromSets(judgeUserId: string) {
    setLeaders((prev) => {
      if (!prev.has(judgeUserId)) return prev;
      const next = new Set(prev);
      next.delete(judgeUserId);
      return next;
    });
    setFollowers((prev) => {
      if (!prev.has(judgeUserId)) return prev;
      const next = new Set(prev);
      next.delete(judgeUserId);
      return next;
    });
  }

  function togglePick(judgeUserId: string, derivedRole: Role | null) {
    if (roleOf(judgeUserId) !== null) {
      removeFromSets(judgeUserId);
      return;
    }
    addToSet(derivedRole ?? "LEADER", judgeUserId);
  }

  const byName = (a: string, b: string) => judgeName(poolById.get(a), a).localeCompare(judgeName(poolById.get(b), b), "ru");
  // Разбито на две группы — судят партнёров / судят партнёрш (по запросу
  // пользователя, 2026-09-09) — та же группировка по факту, что и деление по
  // полу в "Общем списке судей" (роль почти всегда совпадает с полом, но
  // именно роль — авторитетное поле для этой таблицы, в отличие от пола,
  // который может быть не указан).
  const leaderRows = [...leaders].sort(byName).map((judgeUserId) => ({ judgeUserId, role: "LEADER" as Role }));
  const followerRows = [...followers].sort(byName).map((judgeUserId) => ({ judgeUserId, role: "FOLLOWER" as Role }));
  const roleGroups = [
    { role: "LEADER" as Role, label: REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.LEADER, rows: leaderRows },
    { role: "FOLLOWER" as Role, label: REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.FOLLOWER, rows: followerRows },
  ];
  const rows = [...leaderRows, ...followerRows];

  const hasChanges = !setsEqual(leaders, new Set(leaderJudgeUserIds)) || !setsEqual(followers, new Set(followerJudgeUserIds));

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

  // Кого можно предложить отметить — весь ростер соревнования, кроме тех, кто
  // УЖЕ был назначен на эту категорию до открытия формы (стабильный список:
  // отметка/снятие галочки не убирает человека из этого списка на лету).
  const initialLeaders = new Set(leaderJudgeUserIds);
  const initialFollowers = new Set(followerJudgeUserIds);
  const availableFromPool = pool.filter((j) => !initialLeaders.has(j.judgeUserId) && !initialFollowers.has(j.judgeUserId));

  return (
    <div className="flex flex-col gap-3">
      {availableFromPool.length > 0 && (
        <AddButton label="Изменить состав" gradientClassName="bg-gradient-admin-cta" wide>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm text-admin-muted">Отметьте судей, которых нужно добавить в категорию, и нажмите «Сохранить» ниже.</p>
            <div className="flex flex-wrap gap-2">
              {availableFromPool.map((j) => {
                const derivedRole = roleFromGender(j.gender);
                const currentRole = roleOf(j.judgeUserId);
                const checked = currentRole !== null;
                return (
                  <div
                    key={j.judgeUserId}
                    className={`flex items-center gap-2 rounded-app-sm border px-2.5 py-1.5 ${
                      checked ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-night-text">
                      <input type="checkbox" checked={checked} onChange={() => togglePick(j.judgeUserId, derivedRole)} />
                      {judgeName(j, j.judgeUserId)}
                    </label>
                    {derivedRole ? (
                      <span className="text-xs text-admin-muted">{REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL[derivedRole]}</span>
                    ) : (
                      <Select
                        value={currentRole ?? "LEADER"}
                        onChange={(e) => addToSet(e.target.value as Role, j.judgeUserId)}
                        className={`${FIELD_CLASS} !w-auto py-1 text-xs`}
                      >
                        <option value="LEADER">Партнёров</option>
                        <option value="FOLLOWER">Партнёрш</option>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </AddButton>
      )}

      <p className="m-0 text-sm font-semibold text-night-text">
        Судьи категории <span className="font-normal text-admin-muted">({rows.length})</span>
      </p>

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
              {roleGroups.map((group) => {
                if (group.rows.length === 0) return null;
                return (
                  <Fragment key={group.role}>
                    <tr className="border-t border-admin-border bg-admin-card2/40">
                      <td colSpan={3} className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                        Судят {group.label.toLowerCase()} ({group.rows.length})
                      </td>
                    </tr>
                    {group.rows.map((r) => {
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
                                onClick={() => removeFromSets(r.judgeUserId)}
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
                  </Fragment>
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
