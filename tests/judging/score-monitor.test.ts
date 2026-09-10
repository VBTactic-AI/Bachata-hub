import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const roundCount = vi.fn();
const heatFindMany = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const judgeRoundConfirmationFindMany = vi.fn();
const judgeHeatConfirmationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a), count: (...a: unknown[]) => roundCount(...a) },
    heat: { findMany: (...a: unknown[]) => heatFindMany(...a) },
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    judgeRoundConfirmation: { findMany: (...a: unknown[]) => judgeRoundConfirmationFindMany(...a) },
    judgeHeatConfirmation: { findMany: (...a: unknown[]) => judgeHeatConfirmationFindMany(...a) },
  },
}));

const { getPrelimScoreMonitor, getFinalScoreMonitor, getScoreMonitorSnapshot } = await import("@/server/judging/score-monitor");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function judgeAssignment(id: string, role: "LEADER" | "FOLLOWER", judge: { email: string; dancerDisplayName?: string }) {
  return { id, role, judge: { email: judge.email, dancer: judge.dancerDisplayName ? { displayName: judge.dancerDisplayName } : null } };
}

function participant(id: string, role: "LEADER" | "FOLLOWER", bibNumber: string, judgeScores: { judgeAssignmentId: string; value: number }[]) {
  return { id, role, registration: { checkIn: { bibNumber } }, judgeScores };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  roundFindUniqueOrThrow.mockReset();
  roundCount.mockReset().mockResolvedValue(1); // не финал по умолчанию (isFinalStageInTx)
  heatFindMany.mockReset().mockResolvedValue([]);
  judgeAssignmentFindMany.mockReset().mockResolvedValue([]);
  judgeRoundConfirmationFindMany.mockReset().mockResolvedValue([]);
  judgeHeatConfirmationFindMany.mockReset().mockResolvedValue([]);
});

describe("getPrelimScoreMonitor() — числовая шкала (не Да/Нет)", () => {
  it("собирает ячейки по (участник, судья) и правильный ИТОГО по каждому судье", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      // finalistsCount МЕНЬШЕ числа участников роли — иначе rolesNotNeedingJudging
      // (реальная, немокнутая логика) пометит роль как не требующую судейства
      // и ИТОГО всегда будет 0/0 (участников <= мест, все проходят сами).
      finalistsCount: 1,
      order: 1,
      type: null,
      judgingMaxScore: 10,
      division: { competitionId: "comp1" },
    });
    const j1 = judgeAssignment("j1", "LEADER", { email: "judge1@x.com", dancerDisplayName: "Иван Судьёв" });
    judgeAssignmentFindMany.mockResolvedValue([j1]);
    const pA = participant("pA", "LEADER", "101", [{ judgeAssignmentId: "j1", value: 7 }]);
    const pB = participant("pB", "LEADER", "102", []);
    heatFindMany.mockResolvedValue([{ draws: [{ participants: [pA, pB] }] }]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(requirePermissionMock).toHaveBeenCalledWith("score:view_all", "comp1");
    expect(monitor.leader.judges).toEqual([{ judgeAssignmentId: "j1", displayName: "Иван Судьёв", isEmailFallback: false }]);
    expect(monitor.leader.rows.map((r) => [r.bibNumber, r.scores.j1])).toEqual([
      ["101", 7],
      ["102", null],
    ]);
    expect(monitor.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 2, submitted: 1, complete: false }]);
  });

  it("судья без профиля танцора — displayName это часть email, isEmailFallback=true", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 10,
      order: 1,
      type: null,
      judgingMaxScore: 10,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "noprofile@x.com" })]);
    heatFindMany.mockResolvedValue([]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(monitor.leader.judges).toEqual([{ judgeAssignmentId: "j1", displayName: "noprofile", isEmailFallback: true }]);
  });
});

describe("getPrelimScoreMonitor() — формат «Да/Нет» (judgingMaxScore=1): ИТОГО — положительные оценки / finalistsCount, «Готово» отдельным флагом", () => {
  // По живой жалобе пользователя (2026-09-07, повторно): предыдущая версия
  // ИТОГО показывала "сколько участников вообще оценено" (напр. "7/7" даже
  // когда одна из оценок — "0") — на живом табло это читалось как "судья
  // всё сделал", хотя реальный вопрос "сколько он должен пропустить дальше"
  // и сколько положительных оценок реально стоит. Правильно: required —
  // Round.finalistsCount (сколько должно пройти), submitted — сколько
  // ПОЛОЖИТЕЛЬНЫХ (не "0") оценок судья уже поставил. confirmed — по-прежнему
  // отдельный флаг ("Готово" нажато), не путается с этим счётчиком.
  it("submitted/required — положительные оценки судьи / сколько должно пройти дальше (finalistsCount), не число оценённых участников", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      // 2 участника роли > 1 места — роль не пропускается (rolesNotNeedingJudging).
      finalistsCount: 1,
      order: 1,
      type: null,
      judgingMaxScore: 1,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "FOLLOWER", { email: "j1@x.com", dancerDisplayName: "Судья 1" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              participant("pA", "FOLLOWER", "1", [{ judgeAssignmentId: "j1", value: 1 }]),
              participant("pB", "FOLLOWER", "2", []),
            ],
          },
        ],
      },
    ]);
    judgeRoundConfirmationFindMany.mockResolvedValue([]); // "Готово" ещё не нажато

    const monitor = await getPrelimScoreMonitor("round1");

    // required=1 (finalistsCount, НЕ 2 участника), submitted=1 (ровно одна
    // положительная оценка — pB вообще без оценки не считается).
    expect(monitor.follower.totals).toEqual([
      { judgeAssignmentId: "j1", required: 1, submitted: 1, complete: true, confirmed: false },
    ]);
  });

  it("оценка «0» НЕ считается положительной — не входит в submitted, даже если участник оценён", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 1,
      order: 1,
      type: null,
      judgingMaxScore: 1,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "FOLLOWER", { email: "j1@x.com", dancerDisplayName: "Судья 1" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              participant("pA", "FOLLOWER", "1", [{ judgeAssignmentId: "j1", value: 1 }]),
              participant("pB", "FOLLOWER", "2", [{ judgeAssignmentId: "j1", value: 0 }]),
            ],
          },
        ],
      },
    ]);
    judgeRoundConfirmationFindMany.mockResolvedValue([{ judgeAssignmentId: "j1" }]);

    const monitor = await getPrelimScoreMonitor("round1");

    // Оба участника оценены (0 и 1), но submitted считает только положительную
    // (value=1) — required=1=submitted, а не 2 (число оценённых участников).
    expect(monitor.follower.totals).toEqual([
      { judgeAssignmentId: "j1", required: 1, submitted: 1, complete: true, confirmed: true },
    ]);
  });

  it("формат «0/1/2» (judgingMaxScore=2) — «1» и «2» вместе считаются положительными, «0» нет", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      // 4 участника роли, finalistsCount=3 — роль не пропускается.
      finalistsCount: 3,
      order: 1,
      type: null,
      judgingMaxScore: 2,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья 1" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              participant("pA", "LEADER", "1", [{ judgeAssignmentId: "j1", value: 2 }]),
              participant("pB", "LEADER", "2", [{ judgeAssignmentId: "j1", value: 1 }]),
              participant("pC", "LEADER", "3", [{ judgeAssignmentId: "j1", value: 0 }]),
              participant("pD", "LEADER", "4", []),
            ],
          },
        ],
      },
    ]);
    judgeRoundConfirmationFindMany.mockResolvedValue([]);

    const monitor = await getPrelimScoreMonitor("round1");

    // required=3 (finalistsCount), submitted=2 (только «2» и «1» — «0» и
    // отсутствующая оценка не считаются) — ещё не готово.
    expect(monitor.leader.totals).toEqual([
      { judgeAssignmentId: "j1", required: 3, submitted: 2, complete: false, confirmed: false },
    ]);
  });

  it("на числовой шкале (не Да/Нет и не 0/1/2) confirmed — undefined, кнопки «Готово» там нет вовсе", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 1,
      order: 1,
      type: null,
      judgingMaxScore: 10,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья 1" })]);
    heatFindMany.mockResolvedValue([
      { draws: [{ participants: [participant("pA", "LEADER", "1", []), participant("pB", "LEADER", "2", [])] }] },
    ]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(monitor.leader.totals[0].confirmed).toBeUndefined();
  });
});

describe("getPrelimScoreMonitor() — роль без отсева (rolesNotNeedingJudging)", () => {
  it("участников роли <= мест, не финал — ИТОГО 0/0 complete=true, даже если судья назначен", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 10,
      order: 1,
      type: null,
      judgingMaxScore: 5,
      division: { competitionId: "comp1" },
    });
    roundCount.mockResolvedValue(1); // не финал
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья" })]);
    // 3 лидера <= 10 мест — роль не оценивается.
    heatFindMany.mockResolvedValue([
      { draws: [{ participants: [participant("p1", "LEADER", "1", []), participant("p2", "LEADER", "2", []), participant("p3", "LEADER", "3", [])] }] },
    ]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(monitor.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 0, submitted: 0, complete: true }]);
  });
});

describe("getFinalScoreMonitor()", () => {
  it("возвращает null, если финал у раунда ещё не начат (finalSession отсутствует)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ divisionId: "div1", division: { competitionId: "comp1" }, finalSession: null });

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor).toBeNull();
    expect(requirePermissionMock).toHaveBeenCalledWith("score:view_all", "comp1");
  });

  it("считает ИТОГО по (участник × применимый критерий) на судью — не по количеству критериев вообще", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      division: { competitionId: "comp1" },
      finalSession: {
        format: "NORMAL",
        config: {},
        criteriaSnapshot: [
          { id: "c1", name: "Timing", priority: 1, minScore: 0, maxScore: 10, step: 1 },
          { id: "c2", name: "Technique", priority: 2, minScore: 0, maxScore: 10, step: 1 },
        ],
      },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья Ф" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              {
                id: "pA",
                role: "LEADER",
                registration: { checkIn: { bibNumber: "1" } },
                finalJudgeScores: [{ judgeAssignmentId: "j1", criterionId: "c1", value: 8 }],
              },
            ],
          },
        ],
      },
    ]);

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor).not.toBeNull();
    expect(monitor!.leader.rows[0].scores.j1).toEqual({ c1: 8, c2: null });
    // required=2 (2 критерия × 1 участник), submitted=1 (только c1 оценён) — не завершено.
    expect(monitor!.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 2, submitted: 1, complete: false, confirmed: false }]);
  });

  it("confirmed=true для финала, когда судья нажал «Готово» (та же JudgeRoundConfirmation, что и у обычных раундов)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      division: { competitionId: "comp1" },
      finalSession: {
        format: "NORMAL",
        config: {},
        criteriaSnapshot: [{ id: "c1", name: "Timing", priority: 1, minScore: 0, maxScore: 10, step: 1 }],
      },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья Ф" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              {
                id: "pA",
                role: "LEADER",
                registration: { checkIn: { bibNumber: "1" } },
                finalJudgeScores: [{ judgeAssignmentId: "j1", criterionId: "c1", value: 8 }],
              },
            ],
          },
        ],
      },
    ]);
    judgeRoundConfirmationFindMany.mockResolvedValue([{ judgeAssignmentId: "j1" }]);

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor!.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 1, submitted: 1, complete: true, confirmed: true }]);
  });

  it("JUDGES_DANCE: критерий «танцующего судьи» оценивает судья ПРОТИВОПОЛОЖНОЙ роли — он попадает в колонки этой роли, а не судья той же роли", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      division: { competitionId: "comp1" },
      finalSession: {
        format: "JUDGES_DANCE",
        config: { dancingJudgeCriteriaIds: ["partnership"] },
        criteriaSnapshot: [{ id: "partnership", name: "Партнёрство", priority: 1, minScore: 0, maxScore: 10, step: 1 }],
      },
    });
    // j1 (LEADER) — "судья со стороны" для LEADER-участников, но единственный
    // критерий целиком "танцующий" (для LEADER-участника его ставит судья
    // ПРОТИВОПОЛОЖНОЙ роли, FOLLOWER) — j1 самому нечего оценивать у
    // LEADER-участников, значит он вообще не должен быть колонкой в таблице
    // LEADER. j2 (FOLLOWER) — "танцующий" судья, именно он физически
    // партнёрит LEADER-участника pA и ставит ему partnership — обязан быть
    // колонкой/totals в таблице LEADER, хотя роль судьи (FOLLOWER) не
    // совпадает с ролью участника (LEADER). Раньше (CODE-003, найдено
    // пользователем на живом тесте формата "Танцы с судьями", 2026-09-10)
    // колонки набирались только по assignments.role === роль участника — j2
    // не попадал в таблицу LEADER вовсе: ни счётчик "сдал/нужно" в "Судьи
    // категории", ни сама оценка ("Взаимодействие"/"Партнёрство" от
    // судьи-партнёрши) нигде не отображались, хотя в БД записывались.
    judgeAssignmentFindMany.mockResolvedValue([
      judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья Л" }),
      judgeAssignment("j2", "FOLLOWER", { email: "j2@x.com", dancerDisplayName: "Судья П" }),
    ]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              {
                id: "pA",
                role: "LEADER",
                registration: { checkIn: { bibNumber: "1" } },
                finalJudgeScores: [{ judgeAssignmentId: "j2", criterionId: "partnership", value: 7 }],
              },
            ],
          },
        ],
      },
    ]);

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor!.leader.totals).toEqual([{ judgeAssignmentId: "j2", required: 1, submitted: 1, complete: true, confirmed: false }]);
    expect(monitor!.leader.judges.map((j) => j.judgeAssignmentId)).toEqual(["j2"]);
    expect(monitor!.leader.judges[0].criteriaIds).toEqual(["partnership"]);
    expect(monitor!.leader.rows[0].scores.j2).toEqual({ partnership: 7 });
  });

  // Регрессия (жалоба пользователя, 2026-09-10): "✓ Готово" в "Судьи
  // категории" (JudgesLivePanel) никогда не загоралась для JUDGES_DANCE —
  // confirmed читался из JudgeRoundConfirmation, а этот формат подтверждает
  // "Готово" ПО ЗАХОДУ (JudgeHeatConfirmation, confirmFinalJudgeHeatDone),
  // общая строка на весь раунд для него больше не пишется вовсе.
  it("JUDGES_DANCE: confirmed=true, когда судья нажал «Готово» по заходу СВОЕЙ стадии (JudgeHeatConfirmation, не JudgeRoundConfirmation)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      division: { competitionId: "comp1" },
      finalSession: {
        format: "JUDGES_DANCE",
        config: { dancingJudgeCriteriaIds: ["partnership"] },
        criteriaSnapshot: [{ id: "partnership", name: "Партнёрство", priority: 1, minScore: 0, maxScore: 10, step: 1 }],
      },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j2", "FOLLOWER", { email: "j2@x.com", dancerDisplayName: "Судья П" })]);
    heatFindMany.mockResolvedValue([
      {
        id: "heat1",
        draws: [
          {
            participants: [
              {
                id: "pA",
                role: "LEADER",
                registration: { checkIn: { bibNumber: "1" } },
                finalJudgeScores: [{ judgeAssignmentId: "j2", criterionId: "partnership", value: 7 }],
              },
            ],
          },
        ],
      },
    ]);
    // Ни одной строки JudgeRoundConfirmation — только JudgeHeatConfirmation
    // по конкретному заходу, ровно как теперь пишет confirmFinalJudgeHeatDone.
    judgeRoundConfirmationFindMany.mockResolvedValue([]);
    judgeHeatConfirmationFindMany.mockResolvedValue([{ heatId: "heat1", judgeAssignmentId: "j2" }]);

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor!.leader.totals).toEqual([{ judgeAssignmentId: "j2", required: 1, submitted: 1, complete: true, confirmed: true }]);
    expect(judgeRoundConfirmationFindMany).not.toHaveBeenCalled();
  });

  it("JUDGES_DANCE: у каждого судьи в judges.criteriaIds только ЕГО критерии, не все критерии финала", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      division: { competitionId: "comp1" },
      finalSession: {
        format: "JUDGES_DANCE",
        // "partnership" — танцующий (оценивает противоположная роль,
        // FOLLOWER для LEADER-участника), "technique" — обычный (оценивает
        // судья ТОЙ ЖЕ роли, LEADER).
        config: { dancingJudgeCriteriaIds: ["partnership"] },
        criteriaSnapshot: [
          { id: "technique", name: "Техника", priority: 1, minScore: 0, maxScore: 10, step: 1 },
          { id: "partnership", name: "Взаимодействие", priority: 2, minScore: 0, maxScore: 10, step: 1 },
        ],
      },
    });
    judgeAssignmentFindMany.mockResolvedValue([
      judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья Л" }),
      judgeAssignment("j2", "FOLLOWER", { email: "j2@x.com", dancerDisplayName: "Судья П" }),
    ]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              {
                id: "pA",
                role: "LEADER",
                registration: { checkIn: { bibNumber: "1" } },
                finalJudgeScores: [
                  { judgeAssignmentId: "j1", criterionId: "technique", value: 8 },
                  { judgeAssignmentId: "j2", criterionId: "partnership", value: 7 },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const monitor = await getFinalScoreMonitor("round1");

    // Жалоба пользователя (2026-09-10): судья-партнёрша (j2) в таблице
    // партнёров показывала ВСЕ критерии финала (включая "Техника", который
    // она не оценивает вовсе) — должен остаться только тот, что реально её.
    const j1 = monitor!.leader.judges.find((j) => j.judgeAssignmentId === "j1")!;
    const j2 = monitor!.leader.judges.find((j) => j.judgeAssignmentId === "j2")!;
    expect(j1.criteriaIds).toEqual(["technique"]);
    expect(j2.criteriaIds).toEqual(["partnership"]);
  });
});

describe("getScoreMonitorSnapshot() — полный ресинк для клиента после реконнекта SSE", () => {
  it("раунд без finalSession — kind: 'prelim'", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 1,
      order: 1,
      type: null,
      status: "RUNNING",
      judgingMaxScore: 5,
      division: { competitionId: "comp1" },
      finalSession: null,
    });
    heatFindMany.mockResolvedValue([]);

    const snapshot = await getScoreMonitorSnapshot("round1");

    expect(snapshot.kind).toBe("prelim");
    expect(snapshot.roundStatus).toBe("RUNNING");
  });

  it("раунд с finalSession — kind: 'final'", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      status: "SCORING",
      division: { competitionId: "comp1" },
      finalSession: { format: "NORMAL", config: {}, criteriaSnapshot: [] },
    });
    heatFindMany.mockResolvedValue([]);

    const snapshot = await getScoreMonitorSnapshot("round1");

    expect(snapshot.kind).toBe("final");
    expect(snapshot.roundStatus).toBe("SCORING");
  });

  // 2026-09-10, жалоба пользователя: "пусть когда все судьи нажмут готово,
  // обновится монитор" — JudgesLivePanel сравнивает roundStatus снимка с
  // серверным пропом и сам вызывает router.refresh(), когда они расходятся
  // (см. JudgesLivePanel.tsx). Раунд может смениться (RUNNING -> SCORING ->
  // COMPLETED, advancement.ts) между двумя пересинками — снимок обязан
  // отражать АКТУАЛЬНЫЙ статус, иначе этот механизм не сработает.
  it("roundStatus в снимке — актуальный статус раунда на момент запроса, не запомненный", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 1,
      order: 1,
      type: null,
      status: "COMPLETED",
      judgingMaxScore: 5,
      division: { competitionId: "comp1" },
      finalSession: null,
    });
    heatFindMany.mockResolvedValue([]);

    const snapshot = await getScoreMonitorSnapshot("round1");

    expect(snapshot.roundStatus).toBe("COMPLETED");
  });
});
