"use client";

import { useEffect, useState } from "react";
import { fetchScoreMonitorSnapshot } from "./judging/use-score-events";
import { PrelimRoleTable, FinalRoleTable } from "./ScoreMonitorTable";
import type { ScoreMonitorSnapshot } from "@/server/judging/score-monitor";

type Role = "LEADER" | "FOLLOWER";
const ROLE_LABELS: Record<Role, string> = { LEADER: "Партнёры", FOLLOWER: "Партнёрши" };
const ROLE_BORDER_CLASS: Record<Role, string> = { LEADER: "border-[#60a5fa]", FOLLOWER: "border-[#f472b6]" };
const ROLE_TEXT_CLASS: Record<Role, string> = { LEADER: "text-[#60a5fa]", FOLLOWER: "text-[#f472b6]" };

// Статический (без Realtime) протокол оценок судей по завершённому/текущему
// этапу — вкладка "Результаты" (redesign 2026-09-09, по прямому запросу
// пользователя: "показываем примерно такую же таблицу, которую мы видим в
// мониторе оценок"). Данные — тот же снимок, что и у live-монитора
// (score-monitor.ts, GET /api/admin/rounds/[roundId]/score-monitor), но без
// подписки на Supabase Realtime: здесь оценки уже не меняются "прямо сейчас"
// в типичном случае (просмотр после/во время этапа из общего протокола), а
// открывать WS-канал на каждую вкладку "Оценки судей" всех этапов всех
// категорий не нужно. Партнёры/Партнёрши — переключаемые вкладки (тот же
// приём, что и в FinalResultsTable), по прямому пожеланию пользователя
// ("возможно стоит разбить на вкладки, для красивого отображения").
export function RoundScoreProtocol({ roundId }: { roundId: string }) {
  const [snapshot, setSnapshot] = useState<ScoreMonitorSnapshot | null | "loading">("loading");
  const [role, setRole] = useState<Role>("LEADER");

  useEffect(() => {
    let cancelled = false;
    setSnapshot("loading");
    void fetchScoreMonitorSnapshot(roundId).then((s) => {
      if (!cancelled) setSnapshot(s);
    });
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  if (snapshot === "loading") return <p className="m-0 text-sm text-admin-muted">Загрузка…</p>;
  if (!snapshot || snapshot.kind === "none") {
    return <p className="m-0 text-sm text-admin-muted">Оценок по этому этапу пока нет.</p>;
  }

  const roles = (["LEADER", "FOLLOWER"] as const).filter(
    (r) => (r === "LEADER" ? snapshot.leader : snapshot.follower).judges.length > 0
  );
  const active = roles.includes(role) ? role : (roles[0] ?? "LEADER");

  return (
    <div className="flex flex-col gap-3">
      {roles.length > 1 && (
        <div className="flex gap-1.5 rounded-app border border-admin-border bg-admin-bg/40 p-1.5" role="tablist" aria-label="Роль">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === active}
              onClick={() => setRole(r)}
              className={`flex-1 whitespace-nowrap rounded-app-sm border px-3.5 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                r === active
                  ? `${ROLE_BORDER_CLASS[r]} bg-admin-card2 ${ROLE_TEXT_CLASS[r]}`
                  : "border-transparent text-admin-muted hover:bg-admin-card2 hover:text-night-text"
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}

      {snapshot.kind === "prelim" ? (
        <PrelimRoleTable
          title={ROLE_LABELS[active]}
          role={active}
          table={active === "LEADER" ? snapshot.leader : snapshot.follower}
          maxValue={snapshot.maxValue}
        />
      ) : (
        <FinalRoleTable title={ROLE_LABELS[active]} role={active} table={active === "LEADER" ? snapshot.leader : snapshot.follower} />
      )}
    </div>
  );
}
