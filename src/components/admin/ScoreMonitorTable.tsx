"use client";

import { useState } from "react";
import { useScoreEvents, fetchScoreMonitorSnapshot, type ScoreEvent } from "./judging/use-score-events";
import { LiveDot } from "@/components/LiveDot";
import type {
  FinalScoreMonitorTable as FinalTable,
  PrelimScoreMonitorTable as PrelimTable,
  ScoreMonitorJudgeColumn,
  ScoreMonitorTotal,
} from "@/server/judging/score-monitor";

// Live-таблица оценок для head judge/admin (промт пользователя, 2026-09-07):
// строки — номер участника без имени, столбцы — судьи (имя без email); статус
// судьи (сдал ли все оценки, как на его собственном экране) — прямо в шапке
// колонки (JudgeChip/JudgeStatusPill), не отдельной строкой снизу (перенесено
// по прямому запросу пользователя, 2026-09-09). Браузер подписывается
// на Supabase Realtime НАПРЯМУЮ (без сервера-посредника — тот обрывался и
// холодно стартовал заново каждые ~55-60с на Vercel serverless, 2026-09-07,
// найдено по логам "Waiting for server response" ~20-30с). Сервер выдаёт
// только короткоживущий токен на конкретный раунд (realtime-token/route.ts,
// после обычной requirePermission) — RLS-политика "realtime_read_by_round_token"
// (миграция 20260907020000) не даёт увидеть чужие раунды. Первичный снимок
// приходит с сервера как props (обычный SSR).

// Синий/розовый — те же роль-цвета, что и в остальном "Мониторе"
// (CompetitionMonitor.tsx, ROLE_TEXT_CLASS; DivisionResultsPanel.tsx) —
// литеральные классы, не интерполяция (Tailwind ищет полные имена классов
// в исходном коде). Рамка/тонировка панели — тот же приём, что у активной
// вкладки категории/этапа там же (border-admin-primary/40 bg-admin-primary/15),
// только оттенок ролевой, а не бренд-акцент.
type DancerRole = "LEADER" | "FOLLOWER";
const ROLE_TEXT_CLASS: Record<DancerRole, string> = {
  LEADER: "text-[#60a5fa]",
  FOLLOWER: "text-[#f472b6]",
};
const ROLE_DOT_CLASS: Record<DancerRole, string> = {
  LEADER: "bg-[#60a5fa]",
  FOLLOWER: "bg-[#f472b6]",
};
const ROLE_PANEL_CLASS: Record<DancerRole, string> = {
  LEADER: "border-[#60a5fa]/35 bg-[#60a5fa]/[0.06]",
  FOLLOWER: "border-[#f472b6]/35 bg-[#f472b6]/[0.06]",
};

function JudgeHeaderLabel({ judge }: { judge: ScoreMonitorJudgeColumn }) {
  return (
    <span title={judge.isEmailFallback ? "У судьи нет профиля с именем — показана часть email" : undefined}>
      {judge.displayName}
      {judge.isEmailFallback && <span className="text-admin-muted"> *</span>}
    </span>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Статус судьи прямо в шапке таблицы (по прямому запросу пользователя,
// 2026-09-09) — те же submitted/required/complete/confirmed, что раньше
// показывала только строка ИТОГО снизу (см. score-monitor.ts); строку
// ИТОГО убрали, чтобы не дублировать одно и то же в двух местах. Никакой
// новой бизнес-логики: "complete"/"confirmed" по-прежнему считает сервер,
// здесь только выбор пилюли под уже готовые флаги.
function JudgeStatusPill({ total }: { total: ScoreMonitorTotal | undefined }) {
  if (!total) return null;
  if (total.confirmed) {
    return (
      <span
        className="rounded-full bg-night-success/15 px-2 py-0.5 text-[10.5px] font-bold text-night-success"
        title='Судья нажал "Готово" — оценки зафиксированы'
      >
        ✓ Готово
      </span>
    );
  }
  if (total.complete) {
    return (
      <span className="rounded-full bg-night-warning/15 px-2 py-0.5 text-[10.5px] font-bold text-night-warning">
        Ждёт подтверждения · {total.submitted}/{total.required}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-admin-primaryHover/15 px-2 py-0.5 text-[10.5px] font-bold text-admin-primaryHover">
      Оценивает · {total.submitted}/{total.required}
    </span>
  );
}

function JudgeChip({
  judge,
  role,
  total,
}: {
  judge: ScoreMonitorJudgeColumn;
  role: DancerRole;
  total: ScoreMonitorTotal | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-admin-bg ${ROLE_DOT_CLASS[role]}`}
          aria-hidden="true"
        >
          {initials(judge.displayName)}
        </span>
        <span className="text-xs font-bold text-night-text">
          <JudgeHeaderLabel judge={judge} />
        </span>
      </div>
      <JudgeStatusPill total={total} />
    </div>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  if (!connected) {
    return <span className="text-xs font-semibold text-red-400">○ переподключение…</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-night-success">
      <LiveDot />
      live
    </span>
  );
}

export function PrelimScoreMonitor({
  roundId,
  maxValue,
  finalistsCount,
  initialLeader,
  initialFollower,
}: {
  roundId: string;
  maxValue: number;
  finalistsCount: number;
  initialLeader: PrelimTable;
  initialFollower: PrelimTable;
}) {
  const [leader, setLeader] = useState(initialLeader);
  const [follower, setFollower] = useState(initialFollower);

  // "Да/Нет"/"0/1/2" — required/submitted это "положительная оценка / сколько
  // должно пройти дальше" (та же величина, что судья видит на своём экране),
  // не "сколько участников вообще оценено" — см. score-monitor.ts. required
  // сам по себе не меняется от одной новой оценки (участники/finalistsCount
  // раунда фиксированы, пока он идёт), пересчитываем только submitted/complete
  // — иначе строка ИТОГО замирала бы до следующего полного пересинка
  // (жалоба пользователя на живом табло, 2026-09-07).
  const isConfirmationBased = (maxValue === 1 || maxValue === 2) && finalistsCount > 0;
  const applyEvent = (event: ScoreEvent) => {
    if (event.kind === "judge_round_confirmation") {
      const confirm = (table: PrelimTable): PrelimTable => ({
        ...table,
        totals: table.totals.map((t) => (t.judgeAssignmentId === event.judgeAssignmentId ? { ...t, confirmed: true } : t)),
      });
      setLeader(confirm);
      setFollower(confirm);
      return;
    }
    if (event.kind !== "judge_score") return;
    const apply = (table: PrelimTable): PrelimTable => {
      const rowIdx = table.rows.findIndex((r) => r.drawParticipantId === event.drawParticipantId);
      const judgeAssignmentId = event.judgeAssignmentId;
      if (rowIdx === -1 || !table.judges.some((j) => j.judgeAssignmentId === judgeAssignmentId)) return table;
      const rows = table.rows.map((r, i) =>
        i === rowIdx ? { ...r, scores: { ...r.scores, [judgeAssignmentId]: event.value } } : r
      );
      const totals = table.totals.map((t) => {
        if (t.judgeAssignmentId !== judgeAssignmentId || t.required === 0) return t;
        const submitted = isConfirmationBased
          ? rows.filter((r) => (r.scores[judgeAssignmentId] ?? 0) > 0).length
          : rows.filter((r) => r.scores[judgeAssignmentId] !== null).length;
        const complete = isConfirmationBased ? submitted === t.required : submitted >= t.required;
        return { ...t, submitted, complete };
      });
      return { ...table, rows, totals };
    };
    setLeader(apply);
    setFollower(apply);
  };
  const resync = async () => {
    const snapshot = await fetchScoreMonitorSnapshot(roundId);
    if (snapshot?.kind !== "prelim") return;
    setLeader(snapshot.leader);
    setFollower(snapshot.follower);
  };
  const connected = useScoreEvents(roundId, applyEvent, resync);

  return (
    <div className="stack gap-6">
      <LiveBadge connected={connected} />
      <PrelimRoleTable title="Партнёры (Leader)" role="LEADER" table={leader} maxValue={maxValue} />
      <PrelimRoleTable title="Партнёрши (Follower)" role="FOLLOWER" table={follower} maxValue={maxValue} />
    </div>
  );
}

// Экспортированы отдельно от PrelimScoreMonitor/FinalScoreMonitor (ниже) —
// переиспользуются в RoundScoreProtocol.tsx как статический (без Realtime-
// подписки) протокол оценок по завершённому этапу на вкладке "Результаты"
// (redesign 2026-09-09).
export function PrelimRoleTable({
  title,
  role,
  table,
  maxValue,
}: {
  title: string;
  role: DancerRole;
  table: PrelimTable;
  maxValue: number;
}) {
  return (
    <div className={`overflow-hidden rounded-app border ${ROLE_PANEL_CLASS[role]}`}>
      <div className="flex items-center gap-2 border-b border-admin-border px-4 py-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT_CLASS[role]}`} aria-hidden="true" />
        <p className={`m-0 text-xs font-bold uppercase tracking-wide ${ROLE_TEXT_CLASS[role]}`}>{title}</p>
        <span className="ml-auto text-xs text-admin-muted">шкала 0–{maxValue}</span>
      </div>
      {table.judges.length === 0 ? (
        <p className="m-0 px-4 py-3 text-sm text-admin-muted">Судьи на эту роль не назначены.</p>
      ) : table.notJudged ? (
        // Реальных участников этой роли не больше, чем мест — все проходят
        // дальше автоматически, судьи её в этом раунде не оценивают
        // (rolesNotNeedingJudging, draw-engine.ts). Пустая сетка прочерков
        // тут выглядела бы как "судьи забыли оценить" (жалоба пользователя,
        // 2026-09-10).
        <p className="m-0 px-4 py-3 text-sm text-admin-muted">{title} не оцениваются в этом раунде — проходят автоматически.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border-b border-admin-border px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-admin-muted">
                  №
                </th>
                {table.judges.map((j) => {
                  const total = table.totals.find((t) => t.judgeAssignmentId === j.judgeAssignmentId);
                  return (
                    // border-l — разделитель колонок между судьями (найдено
                    // пользователем, 2026-09-12: без него на широком экране
                    // не сразу понятно, какая оценка чья). border-admin-border
                    // на КАЖДОЙ колонке судьи, включая первую — граница со
                    // столбцом "№" тоже нужна, не только между самими судьями.
                    <th key={j.judgeAssignmentId} className="border-b border-l border-admin-border px-3 py-2.5 align-top">
                      <JudgeChip judge={j} role={role} total={total} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-sm text-admin-muted" colSpan={table.judges.length + 1}>
                    Участников пока нет.
                  </td>
                </tr>
              )}
              {table.rows.map((r) => (
                <tr key={r.drawParticipantId} className="hover:bg-admin-card/70">
                  <td className={`border-b border-admin-border px-3 py-2 font-extrabold tabular-nums ${ROLE_TEXT_CLASS[role]}`}>
                    №{r.bibNumber ?? "—"}
                  </td>
                  {table.judges.map((j) => {
                    const value = r.scores[j.judgeAssignmentId];
                    return (
                      <td
                        key={j.judgeAssignmentId}
                        className={`border-b border-l border-admin-border px-3 py-2 text-center ${
                          value === null ? "text-admin-disabled" : "font-semibold text-night-text"
                        }`}
                      >
                        {value ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FinalScoreMonitor({
  roundId,
  initialLeader,
  initialFollower,
}: {
  roundId: string;
  format: string;
  initialLeader: FinalTable;
  initialFollower: FinalTable;
}) {
  const [leader, setLeader] = useState(initialLeader);
  const [follower, setFollower] = useState(initialFollower);

  const applyEvent = (event: ScoreEvent) => {
    if (event.kind === "judge_round_confirmation") {
      const confirm = (table: FinalTable): FinalTable => ({
        ...table,
        totals: table.totals.map((t) => (t.judgeAssignmentId === event.judgeAssignmentId ? { ...t, confirmed: true } : t)),
      });
      setLeader(confirm);
      setFollower(confirm);
      return;
    }
    if (event.kind !== "final_judge_score" && event.kind !== "final_judge_score_deleted") return;
    const judgeAssignmentId = event.judgeAssignmentId;
    // "final_judge_score_deleted" (атомарная подмена места, RELATIVE_PLACEMENT)
    // пишет в ячейку null тем же путём, каким INSERT/UPDATE пишет туда
    // значение — освобождённый участник должен показать "—", а не застрять
    // со старым значением до следующего полного пересинка.
    const newValue = event.kind === "final_judge_score" ? event.value : null;
    const apply = (table: FinalTable): FinalTable => {
      const rowIdx = table.rows.findIndex((r) => r.drawParticipantId === event.drawParticipantId);
      if (rowIdx === -1 || !table.judges.some((j) => j.judgeAssignmentId === judgeAssignmentId)) return table;
      const rows = table.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const judgeScores = { ...(r.scores[judgeAssignmentId] ?? {}), [event.criterionId]: newValue };
        return { ...r, scores: { ...r.scores, [judgeAssignmentId]: judgeScores } };
      });
      // required фиксирован (участники × применимые критерии для этого
      // судьи не меняются от одной новой оценки) — пересчитываем только
      // submitted: ячейки, неприменимые этому судье, так и останутся null
      // (в них никогда не прилетает событие), поэтому подсчёт непустых
      // ячеек корректен без отдельного знания, какие критерии применимы.
      const totals = table.totals.map((t) => {
        if (t.judgeAssignmentId !== judgeAssignmentId) return t;
        const submitted = rows.reduce((sum, r) => sum + Object.values(r.scores[judgeAssignmentId] ?? {}).filter((v) => v !== null).length, 0);
        return { ...t, submitted, complete: submitted >= t.required };
      });
      return { ...table, rows, totals };
    };
    setLeader(apply);
    setFollower(apply);
  };
  const resync = async () => {
    const snapshot = await fetchScoreMonitorSnapshot(roundId);
    if (snapshot?.kind !== "final") return;
    setLeader(snapshot.leader);
    setFollower(snapshot.follower);
  };
  const connected = useScoreEvents(roundId, applyEvent, resync);

  return (
    <div className="stack gap-6">
      <LiveBadge connected={connected} />
      <FinalRoleTable title="Партнёры (Leader)" role="LEADER" table={leader} />
      <FinalRoleTable title="Партнёрши (Follower)" role="FOLLOWER" table={follower} />
    </div>
  );
}

export function FinalRoleTable({ title, role, table }: { title: string; role: DancerRole; table: FinalTable }) {
  // Каждый судья показывает СВОИ критерии, не все подряд (жалоба
  // пользователя, 2026-09-10): в JUDGES_DANCE судья-партнёрша в таблице
  // партнёров реально оценивает только "танцующие" критерии (напр. одно
  // "Взаимодействие" из четырёх) — остальные столбцы у неё были бы всегда
  // "—", это не её работа вообще, а не "ещё не оценено". Список её критериев
  // (judge.criteriaIds) уже посчитан сервером (allowedJudgeRole,
  // score-monitor.ts) — здесь только подставляем названия по id.
  const criteriaById = new Map(table.criteria.map((c) => [c.id, c]));
  const totalColumns = table.judges.reduce((sum, j) => sum + (j.criteriaIds.length || 1), 0);
  return (
    <div className={`overflow-hidden rounded-app border ${ROLE_PANEL_CLASS[role]}`}>
      <div className="flex items-center gap-2 border-b border-admin-border px-4 py-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT_CLASS[role]}`} aria-hidden="true" />
        <p className={`m-0 text-xs font-bold uppercase tracking-wide ${ROLE_TEXT_CLASS[role]}`}>{title}</p>
      </div>
      {table.judges.length === 0 ? (
        <p className="m-0 px-4 py-3 text-sm text-admin-muted">Судьи на эту роль не назначены.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th rowSpan={2} className="border-b border-admin-border px-3 py-2 align-bottom text-left text-[10.5px] font-bold uppercase tracking-wide text-admin-muted">
                  №
                </th>
                {table.judges.map((j) => {
                  const total = table.totals.find((t) => t.judgeAssignmentId === j.judgeAssignmentId);
                  return (
                    // border-l на группе судьи целиком (colSpan) — разделитель
                    // между судьями, а не между отдельными критериями одного
                    // судьи (найдено пользователем, 2026-09-12).
                    <th
                      key={j.judgeAssignmentId}
                      colSpan={j.criteriaIds.length || 1}
                      className="border-b border-l border-admin-border px-3 py-2.5 align-top"
                    >
                      <JudgeChip judge={j} role={role} total={total} />
                    </th>
                  );
                })}
              </tr>
              <tr>
                {table.judges.flatMap((j) =>
                  j.criteriaIds.map((cid, ci) => (
                    <th
                      key={`${j.judgeAssignmentId}:${cid}`}
                      className={`border-b border-admin-border bg-admin-bg/40 px-1 py-1 text-center text-[10px] font-semibold text-admin-muted ${
                        ci === 0 ? "border-l" : ""
                      }`}
                    >
                      {criteriaById.get(cid)?.name ?? "—"}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-sm text-admin-muted" colSpan={1 + totalColumns}>
                    Участников пока нет.
                  </td>
                </tr>
              )}
              {table.rows.map((r) => (
                <tr key={r.drawParticipantId} className="hover:bg-admin-card/70">
                  <td className={`border-b border-admin-border px-3 py-2 font-extrabold tabular-nums ${ROLE_TEXT_CLASS[role]}`}>
                    №{r.bibNumber ?? "—"}
                  </td>
                  {table.judges.flatMap((j) =>
                    j.criteriaIds.map((cid, ci) => {
                      const value = r.scores[j.judgeAssignmentId]?.[cid] ?? null;
                      return (
                        <td
                          key={`${j.judgeAssignmentId}:${cid}`}
                          className={`border-b border-admin-border px-1 py-2 text-center ${ci === 0 ? "border-l" : ""} ${
                            value === null ? "text-admin-disabled" : "font-semibold text-night-text"
                          }`}
                        >
                          {value ?? "—"}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
