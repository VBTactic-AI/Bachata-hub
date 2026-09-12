"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { RegistrationRole } from "@prisma/client";
import { DeleteIconButton } from "@/components/admin/DeleteIconButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AssignJudgeCategoriesModal, type AssignableCategory } from "@/components/admin/AssignJudgeCategoriesModal";
import { REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL } from "@/lib/competition-labels";

export type RegistryJudge = {
  judgeUserId: string;
  displayName: string | null;
  judgeEmail: string;
  categories: { id: string; name: string; color: string }[];
  // Объединение ролей судьи по всем его назначениям (не отдельное хранимое
  // поле) — судья, назначенный LEADER в одной категории и FOLLOWER в другой,
  // попадёт в группу "Судят обе роли" ниже, а не потеряется молча.
  roles: RegistrationRole[];
  // Залогинен ли судья ПРЯМО СЕЙЧАС (живая, не отозванная сессия Supabase
  // Auth) — не "когда-либо входил" (раньше колонка "Статус" всегда
  // показывала "Активен" жёстко закодированным текстом; затем — по
  // User.lastLoginAt; по прямому уточнению пользователя, 2026-09-12,
  // заменено на текущее состояние сессии, см. getCurrentlyLoggedInSupabaseUserIds).
  isLoggedInNow: boolean;
};

type RoleGroupKey = "LEADER" | "FOLLOWER" | "BOTH" | "NONE";

const ROLE_GROUPS: { key: RoleGroupKey; label: string }[] = [
  { key: "LEADER", label: `Судят ${REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.LEADER.toLowerCase()}` },
  { key: "FOLLOWER", label: `Судят ${REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL.FOLLOWER.toLowerCase()}` },
  { key: "BOTH", label: "Судят обе роли" },
  { key: "NONE", label: "Не назначены" },
];

function roleGroupOf(j: RegistryJudge): RoleGroupKey {
  const hasLeader = j.roles.includes("LEADER");
  const hasFollower = j.roles.includes("FOLLOWER");
  if (hasLeader && hasFollower) return "BOTH";
  if (hasLeader) return "LEADER";
  if (hasFollower) return "FOLLOWER";
  return "NONE";
}

// Реестр судей соревнования (вкладка "Судьи", redesign 2026-09-09) — поиск по
// имени и фильтр "Не назначены" (раньше единственным сигналом того, что
// судью забыли назначить хоть куда-то, было неприметное "—" в столбце
// "Категории"), плюс группировка по роли вместо пола — тот же принцип и та
// же формулировка ("Судят партнёров"/"Судят партнёрш"), что уже
// используется в панели категории ниже (DivisionJudgesPanel), а не два
// разных способа группировки судей на одном экране.
export function JudgeRegistryPanel({
  competitionId,
  judges,
  allCategories,
  addAction,
}: {
  competitionId: string;
  judges: RegistryJudge[];
  allCategories: AssignableCategory[];
  addAction: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const unassignedCount = judges.filter((j) => j.categories.length === 0).length;
  const q = query.trim().toLowerCase();
  const filtered = judges.filter((j) => {
    if (onlyUnassigned && j.categories.length > 0) return false;
    if (q && !(j.displayName ?? j.judgeEmail).toLowerCase().includes(q)) return false;
    return true;
  });

  let n = 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти судью по имени…"
          className="min-w-[220px] flex-1 rounded-app-sm border border-admin-border bg-admin-card2 px-3 py-2 text-sm text-night-text placeholder:text-admin-disabled focus:border-admin-primary focus:outline-none"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setOnlyUnassigned(false)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              !onlyUnassigned ? "bg-admin-primary/15 text-night-text" : "border border-admin-border text-admin-muted hover:text-night-text"
            }`}
          >
            Все ({judges.length})
          </button>
          <button
            type="button"
            onClick={() => setOnlyUnassigned(true)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              onlyUnassigned ? "bg-admin-primary/15 text-night-text" : "border border-admin-border text-admin-muted hover:text-night-text"
            }`}
          >
            Не назначены ({unassignedCount})
          </button>
        </div>
        <div className="ml-auto">{addAction}</div>
      </div>

      {filtered.length === 0 ? (
        <p className="m-0 text-sm text-admin-muted">{judges.length === 0 ? "Судьи пока не добавлены." : "Никого не нашлось."}</p>
      ) : (
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2.5 font-semibold">№</th>
                <th className="px-3 py-2.5 font-semibold">Судья</th>
                <th className="px-3 py-2.5 font-semibold">Категории</th>
                <th className="px-3 py-2.5 font-semibold">Статус</th>
                <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_GROUPS.map((group) => {
                const list = filtered.filter((j) => roleGroupOf(j) === group.key);
                if (list.length === 0) return null;
                return (
                  <Fragment key={group.key}>
                    <tr className="border-t border-admin-border bg-admin-card2/40">
                      <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                        {group.label} ({list.length})
                      </td>
                    </tr>
                    {list.map((j) => {
                      n += 1;
                      const name = j.displayName ?? j.judgeEmail;
                      return (
                        <tr key={j.judgeUserId} className="border-t border-admin-border">
                          <td className="px-3 py-2.5 align-middle text-admin-muted">{n}</td>
                          <td className="px-3 py-2.5 align-middle font-medium text-night-text">{name}</td>
                          <td className="px-3 py-2.5 align-middle">
                            <AssignJudgeCategoriesModal
                              competitionId={competitionId}
                              judgeUserId={j.judgeUserId}
                              judgeName={name}
                              allCategories={allCategories}
                              assignedCategoryIds={j.categories.map((c) => c.id)}
                            />
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <StatusBadge
                              label={j.isLoggedInNow ? "Активен" : "Не в сети"}
                              variant={j.isLoggedInNow ? "success" : "neutral"}
                            />
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <div className="flex justify-end">
                              <DeleteIconButton
                                url={`/api/competitions/${competitionId}/judges/${j.judgeUserId}`}
                                confirmMessage={`Убрать судью «${name}» из соревнования? Снимет назначения по всем категориям.`}
                                label={`Убрать судью ${name}`}
                              />
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
    </div>
  );
}
