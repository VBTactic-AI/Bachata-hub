"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "@/components/admin/icons";
import { REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL } from "@/lib/competition-labels";

type Role = "LEADER" | "FOLLOWER";
export type PoolJudge = {
  judgeUserId: string;
  judgeEmail: string;
  displayName: string | null;
  gender: "MALE" | "FEMALE" | null;
  // Объединение ролей судьи по ВСЕМ категориям этого соревнования (не
  // отдельное хранимое поле, см. page.tsx) — пустой массив значит "ещё
  // нигде не судит", а не "судит обе роли". Используется только для фильтра
  // окна "Добавить судью" ниже (2026-09-09) — какую роль показать под какой
  // колонкой.
  roles: Role[];
};

function judgeName(j: PoolJudge | undefined, fallbackId: string): string {
  return j?.displayName || j?.judgeEmail || fallbackId;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

// Винительный падеж единственного числа — только для заголовка окна выбора
// ("Добавить партнёра"/"Добавить партнёршу", для ясности контекста внутри
// самого окна), в отличие от родительного множественного
// (REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL), которым подписаны колонки.
// Кнопки, которые это окно открывают, теперь называются одинаково — просто
// "Добавить судью" (по запросу пользователя, 2026-09-09) — какую роль
// показать, определяется тем, под какой колонкой кнопку нажали, без разницы
// в подписи самой кнопки.
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

  // Esc закрывает окно выбора — тот же приём, что и в AddDrawHelperForm.tsx
  // (стандартное ожидание для fixed-оверлея).
  useEffect(() => {
    if (!openAdd) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenAdd(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openAdd]);

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

  // Фильтр окна "Добавить судью" по запросу пользователя (2026-09-09): под
  // колонкой "Судят партнёров" показываем только тех, кто и в других
  // категориях этого соревнования уже оценивает партнёров, — судья обычно
  // ведёт одну и ту же роль на всех категориях одного конкурса. Тех, кто
  // нигде ещё не судит (`roles.length === 0`), показываем в обоих окнах —
  // ролью им пока просто неоткуда было определиться.
  function candidatesForRole(role: Role): PoolJudge[] {
    return availableFromPool.filter((j) => j.roles.length === 0 || j.roles.includes(role));
  }

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

            {candidatesForRole(group.role).length > 0 && (
              <button
                type="button"
                onClick={() => setOpenAdd(group.role)}
                className="w-full rounded-app-sm border border-dashed border-admin-border px-3 py-2 text-sm text-night-text transition-colors hover:border-admin-primary hover:text-admin-primary"
              >
                + Добавить судью
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Всплывающее окно выбора кандидата — тот же макет, что и у
          "Позвать помощника на паркет" (AddDrawHelperForm.tsx), по прямому
          запросу пользователя (2026-09-09): инлайн-облако чекбоксов внутри
          узкой колонки категории выглядело тесно. Отдельный submit не нужен —
          отметка сразу пишет в те же leaders/followers Set, что и постоянный
          список выше, и сохраняется тем же общим "Сохранить" снизу; "Готово"
          здесь только закрывает окно. */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setOpenAdd(null)} role="presentation">
          <div
            className="flex max-h-[80vh] w-full max-w-[420px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-judge-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="add-judge-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Добавить {ADD_ACCUSATIVE_SINGULAR[openAdd]}
              </h3>
              <p className="m-0 mt-1.5 text-[12.5px] text-admin-muted">
                Отметьте, кого добавить, — появятся в списке «Судят {REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL[openAdd].toLowerCase()}» сразу, сохранятся вместе с остальными изменениями.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto py-1.5">
              {(() => {
                const candidates = candidatesForRole(openAdd);
                if (candidates.length === 0) {
                  return (
                    <p className="m-0 px-5 py-4 text-sm text-admin-muted">
                      {availableFromPool.length === 0
                        ? "Все судьи реестра уже назначены в эту категорию."
                        : `Нет свободных судей, оценивающих ${REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL[openAdd].toLowerCase()}.`}
                    </p>
                  );
                }
                return candidates.map((j) => {
                  const checked = roleOf(j.judgeUserId) === openAdd;
                  return (
                    <label key={j.judgeUserId} className="flex cursor-pointer items-center gap-3 px-5 py-2 hover:bg-admin-card2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInRole(openAdd, j.judgeUserId)}
                        className="h-[18px] w-[18px] shrink-0 accent-admin-primary"
                      />
                      <span className="truncate text-sm font-semibold text-night-text">{judgeName(j, j.judgeUserId)}</span>
                    </label>
                  );
                });
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-admin-border px-5 py-4">
              <Button type="button" size="sm" variant="admin" onClick={() => setOpenAdd(null)}>
                Готово
              </Button>
            </div>
          </div>
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
