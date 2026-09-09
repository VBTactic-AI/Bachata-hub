"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "@/components/admin/icons";
import { REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL } from "@/lib/competition-labels";

export type PoolJudge = { judgeUserId: string; judgeEmail: string; displayName: string | null; gender: "MALE" | "FEMALE" | null };
type Role = "LEADER" | "FOLLOWER";

function judgeName(j: PoolJudge | undefined, fallbackId: string): string {
  return j?.displayName || j?.judgeEmail || fallbackId;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

// Винительный падеж единственного числа — только для подписи кнопки
// добавления в конкретную колонку ("Добавить партнёра"/"Добавить
// партнёршу"), в отличие от родительного множественного
// (REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL), которым подписаны сами колонки
// ("Судят партнёров"/"Судят партнёрш").
const ADD_ACCUSATIVE_SINGULAR: Record<Role, string> = { LEADER: "партнёра", FOLLOWER: "партнёршу" };

// Судейская панель одной категории (redesign 2026-09-09, по референсу
// пользователя) — две колонки "Судят партнёров" / "Судят партнёрш" рядом,
// вместо одной таблицы с группами строк. Добавление — ТОЛЬКО из уже
// существующего ростера судей соревнования ("Реестр судей",
// AddCompetitionJudgeForm.tsx — там же единственное место, где заводится
// новый человек), отдельным picker'ом под каждой колонкой: роль больше не
// нужно выбирать вручную или угадывать по полу — она однозначно определяется
// тем, под какой колонкой открыт picker. Отмеченные сразу попадают в те же
// leaders/followers Set, что и уже сохранённые судьи, и наглядно появляются
// в списке колонки как "ещё не сохранено" — фиксирует их то же "Сохранить",
// что уже используется для удаления (тот же batch-diff, setDivisionJudges).
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
  const [openAdd, setOpenAdd] = useState<Role | null>(null);
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

  // Переключение из picker'а конкретной колонки — роль уже известна (это и
  // есть колонка), поэтому либо снимаем (если сейчас в этой самой роли),
  // либо ставим в эту роль (перекладывая из другой роли, если человек уже
  // был там — та же логика, что и раньше в addToSet).
  function toggleInRole(role: Role, judgeUserId: string) {
    if (roleOf(judgeUserId) === role) {
      removeFromSets(judgeUserId);
      return;
    }
    addToSet(role, judgeUserId);
  }

  const byName = (a: string, b: string) => judgeName(poolById.get(a), a).localeCompare(judgeName(poolById.get(b), b), "ru");
  const leaderRows = [...leaders].sort(byName).map((judgeUserId) => ({ judgeUserId, role: "LEADER" as Role }));
  const followerRows = [...followers].sort(byName).map((judgeUserId) => ({ judgeUserId, role: "FOLLOWER" as Role }));
  const roleGroups = [
    { role: "LEADER" as Role, label: REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.LEADER, rows: leaderRows },
    { role: "FOLLOWER" as Role, label: REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.FOLLOWER, rows: followerRows },
  ];

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
  // Общий для обеих колонок: один и тот же кандидат может быть отмечен и в
  // picker'е "партнёров", и в picker'е "партнёрш" — отметка в одном снимает
  // его из другой роли, если он там был (toggleInRole).
  const initialLeaders = new Set(leaderJudgeUserIds);
  const initialFollowers = new Set(followerJudgeUserIds);
  const availableFromPool = pool.filter((j) => !initialLeaders.has(j.judgeUserId) && !initialFollowers.has(j.judgeUserId));

  // Индикатор дисбаланса ролей (по запросу пользователя, 2026-09-09) — без
  // него 0 судей на одну из ролей было видно, только если долистать таблицу
  // ниже и заметить пустую группу. Считается от live-состояния (leaders/
  // followers), а не от исходных пропсов — обновляется сразу при отметке
  // галочки, ещё до "Сохранить".
  const nLeaders = leaders.size;
  const nFollowers = followers.size;
  const imbalanced = nLeaders === 0 || nFollowers === 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-app-sm border px-3 py-2 text-sm ${
          imbalanced ? "border-night-warning/40 bg-night-warning/10" : "border-admin-border bg-admin-card2"
        }`}
      >
        <span className={`font-semibold ${imbalanced ? "text-night-warning" : "text-night-text"}`}>
          {nLeaders} {REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.LEADER.toLowerCase()} · {nFollowers}{" "}
          {REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.FOLLOWER.toLowerCase()}
        </span>
        {imbalanced && (
          <span className="text-night-warning">
            — нет ни одного судьи на {nLeaders === 0 ? REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.LEADER.toLowerCase() : REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.FOLLOWER.toLowerCase()}, категорию некому судить.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {roleGroups.map((group) => (
          <div key={group.role} className="flex flex-col gap-2.5 rounded-app border border-admin-border bg-admin-card p-3.5">
            <p className="m-0 text-xs font-bold uppercase tracking-wide text-admin-muted">
              Судят {group.label.toLowerCase()} ({group.rows.length})
            </p>

            <div className="flex flex-col gap-1.5">
              {group.rows.length === 0 ? (
                <p className="m-0 rounded-app-sm border border-dashed border-admin-border px-3 py-2 text-center text-sm text-admin-disabled">
                  Никто не назначен
                </p>
              ) : (
                group.rows.map((r) => {
                  const j = poolById.get(r.judgeUserId);
                  const name = judgeName(j, r.judgeUserId);
                  return (
                    <div key={r.judgeUserId} className="flex items-center justify-between gap-2 rounded-app-sm bg-admin-card2 px-3 py-2.5 text-sm">
                      <span className="font-medium text-night-text">{name}</span>
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
                  );
                })
              )}
            </div>

            {availableFromPool.length > 0 &&
              (openAdd === group.role ? (
                <div className="flex flex-col gap-2 rounded-app-sm border border-admin-border bg-admin-card2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-xs text-admin-muted">Отметьте, кого добавить, и нажмите «Сохранить» ниже.</p>
                    <button type="button" onClick={() => setOpenAdd(null)} aria-label="Закрыть" className="text-admin-muted hover:text-night-text">
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableFromPool.map((j) => {
                      const checked = roleOf(j.judgeUserId) === group.role;
                      return (
                        <label
                          key={j.judgeUserId}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-app-sm border px-2.5 py-1.5 text-sm text-night-text ${
                            checked ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card"
                          }`}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleInRole(group.role, j.judgeUserId)} />
                          {judgeName(j, j.judgeUserId)}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenAdd(group.role)}
                  className="w-full rounded-app-sm border border-dashed border-admin-border px-3 py-2 text-sm text-night-text transition-colors hover:border-admin-primary hover:text-admin-primary"
                >
                  + Добавить {ADD_ACCUSATIVE_SINGULAR[group.role]}
                </button>
              ))}
          </div>
        ))}
      </div>

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
