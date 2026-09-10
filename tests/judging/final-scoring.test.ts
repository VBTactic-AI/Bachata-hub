import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const maybeFinalizeFinalAfterScoreInTxMock = vi.fn();
vi.mock("@/server/judging/final-advancement", () => ({
  maybeFinalizeFinalAfterScoreInTx: (...a: unknown[]) => maybeFinalizeFinalAfterScoreInTxMock(...a),
}));

// Настоящая реализация (не мок) — countRequiredForJudgeRole (используется
// confirmFinalJudgeRoundDone) внутри себя зовёт allowedJudgeRole напрямую по
// ссылке в том же модуле, а не через реэкспорт, так что подменять одно без
// другого означало бы разойтись в тестах с тем, что реально считает сервер.
// Обе функции чистые (без обращения к БД) — подменять их незачем.

const participantFindUniqueOrThrow = vi.fn();
const judgeAssignmentFindUnique = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const judgeRoundConfirmationFindUnique = vi.fn();
const judgeRoundConfirmationFindMany = vi.fn();
const judgeHeatConfirmationFindUnique = vi.fn();
const judgeHeatConfirmationFindMany = vi.fn();
const roundFindUniqueOrThrow = vi.fn();
const roundFindMany = vi.fn();
const heatFindMany = vi.fn();
const heatFindFirstOrThrow = vi.fn();
const txFinalJudgeScoreFindUnique = vi.fn();
const txFinalJudgeScoreFindFirst = vi.fn();
const txFinalJudgeScoreUpsert = vi.fn();
const txFinalJudgeScoreDelete = vi.fn();
const txHeatFindMany = vi.fn();
const txFinalResultFindUnique = vi.fn();
const txJudgeRoundConfirmationFindUnique = vi.fn();
const txJudgeRoundConfirmationCreate = vi.fn();
const txJudgeHeatConfirmationFindUnique = vi.fn();
const txJudgeHeatConfirmationCreate = vi.fn();
const auditCreate = vi.fn();
// pg_advisory_xact_lock перед проверкой конфликта места (final-scoring.ts,
// защита от гонки двух одновременных запросов) — в тестах транзакция не
// настоящая, так что просто подтверждаем вызов, ничего не блокируя.
const txExecuteRaw = vi.fn().mockResolvedValue(0);

const fakeTx = {
  $executeRaw: txExecuteRaw,
  finalJudgeScore: {
    findUnique: txFinalJudgeScoreFindUnique,
    findFirst: txFinalJudgeScoreFindFirst,
    upsert: txFinalJudgeScoreUpsert,
    delete: txFinalJudgeScoreDelete,
  },
  // RELATIVE_PLACEMENT (скейтинг) — submitFinalJudgeScore ищет участников той
  // же роли через tx.heat.findMany (снимок текущего draw раунда), не через
  // top-level prisma.heat — отдельный мок именно для транзакционного клиента.
  heat: { findMany: txHeatFindMany },
  // SCORE-001: submitFinalJudgeScore теперь проверяет, не посчитан ли уже
  // FinalResult этого участника, ДО апдейта оценки — тот же случай, что и
  // обычные раунды (scoring.ts).
  finalResult: { findUnique: txFinalResultFindUnique, findFirst: txFinalResultFindUnique },
  judgeRoundConfirmation: { findUnique: txJudgeRoundConfirmationFindUnique, findFirst: txJudgeRoundConfirmationFindUnique, create: txJudgeRoundConfirmationCreate },
  judgeHeatConfirmation: { findUnique: txJudgeHeatConfirmationFindUnique, findFirst: txJudgeHeatConfirmationFindUnique, create: txJudgeHeatConfirmationCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drawParticipant: { findUniqueOrThrow: (...a: unknown[]) => participantFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => participantFindUniqueOrThrow(...a) },
    judgeAssignment: {
      findUnique: (...a: unknown[]) => judgeAssignmentFindUnique(...a), findFirst: (...a: unknown[]) => judgeAssignmentFindUnique(...a),
      findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a),
    },
    round: {
      findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => roundFindMany(...a),
    },
    heat: {
      findMany: (...a: unknown[]) => heatFindMany(...a),
      findFirstOrThrow: (...a: unknown[]) => heatFindFirstOrThrow(...a),
    },
    // "Готово" по финалу (confirmFinalJudgeRoundDone, 2026-09-07) — та же
    // проверка "судья уже подтвердил", что и в обычных раундах (scoring.ts).
    judgeRoundConfirmation: {
      findUnique: (...a: unknown[]) => judgeRoundConfirmationFindUnique(...a), findFirst: (...a: unknown[]) => judgeRoundConfirmationFindUnique(...a),
      findMany: (...a: unknown[]) => judgeRoundConfirmationFindMany(...a),
    },
    // "Готово" ПО ЗАХОДУ, только JUDGES_DANCE (2026-09-10, confirmFinalJudgeHeatDone).
    judgeHeatConfirmation: {
      findUnique: (...a: unknown[]) => judgeHeatConfirmationFindUnique(...a), findFirst: (...a: unknown[]) => judgeHeatConfirmationFindUnique(...a),
      findMany: (...a: unknown[]) => judgeHeatConfirmationFindMany(...a),
    },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { submitFinalJudgeScore, confirmFinalJudgeRoundDone, confirmFinalJudgeHeatDone, listMyActiveFinalRounds, getFinalJudgeQueue } = await import(
  "@/server/judging/final-scoring"
);
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "judge1", email: "j@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const criteria = [{ id: "crit1", name: "Техника", priority: 1, minScore: 0, maxScore: 10, step: 1 }];

const participant = {
  id: "dp1",
  scored: true,
  role: "LEADER" as const,
  registrationId: "reg1",
  draw: {
    heat: {
      status: "RUNNING",
      round: {
        status: "SCORING",
        division: { id: "div1", competitionId: "comp1" },
        finalSession: { format: "NORMAL", config: {}, criteriaSnapshot: criteria },
      },
    },
  },
};

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  maybeFinalizeFinalAfterScoreInTxMock.mockReset();
  participantFindUniqueOrThrow.mockReset().mockResolvedValue(participant);
  judgeAssignmentFindUnique.mockReset().mockResolvedValue({ id: "assign1" });
  judgeAssignmentFindMany.mockReset();
  judgeRoundConfirmationFindUnique.mockReset().mockResolvedValue(null);
  judgeRoundConfirmationFindMany.mockReset().mockResolvedValue([]);
  judgeHeatConfirmationFindUnique.mockReset().mockResolvedValue(null);
  judgeHeatConfirmationFindMany.mockReset().mockResolvedValue([]);
  roundFindUniqueOrThrow.mockReset();
  roundFindMany.mockReset();
  heatFindMany.mockReset();
  heatFindFirstOrThrow.mockReset();
  txJudgeRoundConfirmationFindUnique.mockReset();
  txJudgeRoundConfirmationCreate.mockReset();
  txJudgeHeatConfirmationFindUnique.mockReset();
  txJudgeHeatConfirmationCreate.mockReset();
  txFinalJudgeScoreFindUnique.mockReset().mockResolvedValue(null);
  txFinalJudgeScoreFindFirst.mockReset().mockResolvedValue(null);
  txFinalJudgeScoreUpsert.mockReset();
  txFinalJudgeScoreDelete.mockReset();
  txHeatFindMany.mockReset().mockResolvedValue([]);
  txFinalResultFindUnique.mockReset().mockResolvedValue(null);
  auditCreate.mockReset();
  txExecuteRaw.mockClear();
});

describe("submitFinalJudgeScore() — SCORE-001", () => {
  it("сохраняет оценку как обычно, если FinalResult для участника ещё не посчитан", async () => {
    await submitFinalJudgeScore("dp1", "crit1", 7, "sub-1");

    expect(txFinalJudgeScoreUpsert).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "final_score.submit" }) }));
  });

  it("отклоняет отправку, если FinalResult для этого участника уже посчитан (раунд ждёт перетанцовку другой роли)", async () => {
    txFinalResultFindUnique.mockResolvedValue({ roundId: "final1", registrationId: "reg1", place: 1 });

    await expect(submitFinalJudgeScore("dp1", "crit1", 7, "sub-1")).rejects.toBeInstanceOf(ValidationFailedError);

    expect(txFinalJudgeScoreUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('отклоняет отправку, если судья уже нажал "Готово" по этому финалу (confirmFinalJudgeRoundDone)', async () => {
    judgeRoundConfirmationFindUnique.mockResolvedValue({ id: "conf1" });

    await expect(submitFinalJudgeScore("dp1", "crit1", 7, "sub-1")).rejects.toBeInstanceOf(ValidationFailedError);

    expect(txFinalJudgeScoreUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

// RELATIVE_PLACEMENT (скейтинг) — атомарная подмена места (промт
// пользователя, 2026-09-07): вместо отклонения отправки при конфликте места
// сервер сам, в одной транзакции, освобождает прежнего обладателя и
// назначает новое значение запрашивающему. CLAUDE.md §28/§29 — освобождение
// обязано попасть в audit, иначе результат "тихо" меняется у ТРЕТЬЕГО
// участника, о котором сервер никого не уведомил явно.
describe("submitFinalJudgeScore() — RELATIVE_PLACEMENT, атомарная подмена места", () => {
  const skatingCriteria = [{ id: "place", name: "Место", priority: 1, minScore: 1, maxScore: 8, step: 1 }];
  const skatingParticipant = {
    id: "dp1",
    scored: true,
    role: "LEADER" as const,
    registrationId: "reg1",
    draw: {
      heat: {
        status: "RUNNING",
        round: {
          id: "round1",
          status: "SCORING",
          division: { id: "div1", competitionId: "comp1" },
          finalSession: { format: "RELATIVE_PLACEMENT", config: {}, criteriaSnapshot: skatingCriteria },
        },
      },
    },
  };

  function withSameRoleParticipants(...ids: string[]) {
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: ids.map((id) => ({ id })) }] }]);
  }

  it("если место уже занято другим участником той же роли — освобождает его (delete + audit) и назначает новое значение", async () => {
    participantFindUniqueOrThrow.mockResolvedValue(skatingParticipant);
    withSameRoleParticipants("dp1", "dp2"); // dp2 — прежний обладатель места 2
    txFinalJudgeScoreFindFirst.mockResolvedValue({ id: "score-dp2", drawParticipantId: "dp2", value: 2 });

    await submitFinalJudgeScore("dp1", "place", 2, "sub-1");

    expect(txExecuteRaw).toHaveBeenCalled(); // advisory xact-lock сериализует конкурентные запросы (CLAUDE.md §34)
    expect(txFinalJudgeScoreDelete).toHaveBeenCalledWith({ where: { id: "score-dp2" } });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "final_score.displace",
          entityId: "dp2",
          before: { criterionId: "place", value: 2 },
          after: null,
        }),
      })
    );
    expect(txFinalJudgeScoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ drawParticipantId: "dp1", criterionId: "place", value: 2 }),
      })
    );
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "final_score.submit", entityId: "dp1" }) }));
  });

  it("если конфликта нет — просто назначает место, чужие записи не трогает", async () => {
    participantFindUniqueOrThrow.mockResolvedValue(skatingParticipant);
    withSameRoleParticipants("dp1", "dp2");
    txFinalJudgeScoreFindFirst.mockResolvedValue(null); // место 3 никем не занято

    await submitFinalJudgeScore("dp1", "place", 3, "sub-1");

    expect(txFinalJudgeScoreDelete).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "final_score.displace" }) }));
    expect(txFinalJudgeScoreUpsert).toHaveBeenCalled();
  });

  it("полный обмен местами между двумя участниками — результат двух последовательных атомарных подмен, без транзитного дубликата", async () => {
    // Было: dp1=1, dp2=2. Судья хочет dp1=2, dp2=1 — ровно сценарий из промта
    // пользователя ("101-2, 102-1, хотя было 101-1, 102-2").
    participantFindUniqueOrThrow.mockResolvedValue(skatingParticipant);
    withSameRoleParticipants("dp1", "dp2");

    // Шаг 1: dp1 забирает место 2 — оно занято dp2.
    txFinalJudgeScoreFindFirst.mockResolvedValueOnce({ id: "score-dp2", drawParticipantId: "dp2", value: 2 });
    await submitFinalJudgeScore("dp1", "place", 2, "sub-1");
    expect(txFinalJudgeScoreDelete).toHaveBeenCalledWith({ where: { id: "score-dp2" } });

    // Шаг 2: dp2 (теперь без места) забирает место 1 — оно уже свободно
    // (dp1 его покинул на шаге 1), конфликта нет.
    txFinalJudgeScoreFindFirst.mockResolvedValueOnce(null);
    await submitFinalJudgeScore("dp2", "place", 1, "sub-2");

    expect(txFinalJudgeScoreDelete).toHaveBeenCalledTimes(1); // только dp2 на шаге 1, больше освобождений не было
    expect(txFinalJudgeScoreUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ drawParticipantId: "dp1", value: 2 }) }));
    expect(txFinalJudgeScoreUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ drawParticipantId: "dp2", value: 1 }) }));
  });
});

// confirmFinalJudgeRoundDone() — "Готово" по финалу (2026-09-07, по образцу
// обычных раундов, confirmJudgeRoundDone/A21): судья свободно ставит/меняет
// оценки, но финал не завершается сам по первой же полностью заполненной
// клетке — только когда судья явно подтвердил, что закончил.
describe("confirmFinalJudgeRoundDone()", () => {
  const roundBase = {
    id: "round1",
    status: "SCORING",
    division: { id: "div1", competitionId: "comp1" },
    finalSession: { format: "NORMAL", config: {}, criteriaSnapshot: criteria },
  };

  function makeHeats(scoredJudgeIds: string[]) {
    return [
      {
        draws: [
          {
            participants: [
              { role: "LEADER", finalJudgeScores: scoredJudgeIds.map((judgeAssignmentId) => ({ judgeAssignmentId, criterionId: "crit1" })) },
            ],
          },
        ],
      },
    ];
  }

  it("фиксирует подтверждение, если у судьи проставлены все обязательные оценки", async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    heatFindMany.mockResolvedValue(makeHeats(["assign1"]));
    txJudgeRoundConfirmationFindUnique.mockResolvedValue(null);
    txJudgeRoundConfirmationCreate.mockResolvedValue({ id: "conf1" });

    await confirmFinalJudgeRoundDone("round1");

    expect(txJudgeRoundConfirmationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roundId: "round1", judgeAssignmentId: "assign1", yesCount: 1 }) })
    );
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "final_judge.confirm_round" }) }));
    expect(maybeFinalizeFinalAfterScoreInTxMock).toHaveBeenCalledWith(fakeTx, "round1", actor);
  });

  it('отклоняет "Готово", если оценены не все обязательные клетки, и ничего не фиксирует', async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    heatFindMany.mockResolvedValue(makeHeats([])); // ни одной оценки этого судьи
    txJudgeRoundConfirmationFindUnique.mockResolvedValue(null);

    await expect(confirmFinalJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);

    expect(txJudgeRoundConfirmationCreate).not.toHaveBeenCalled();
  });

  it("повторное нажатие после уже принятого подтверждения — не ошибка, просто ничего не делает", async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    heatFindMany.mockResolvedValue(makeHeats(["assign1"]));
    txJudgeRoundConfirmationFindUnique.mockResolvedValue({ id: "already-confirmed" });

    await confirmFinalJudgeRoundDone("round1");

    expect(txJudgeRoundConfirmationCreate).not.toHaveBeenCalled();
  });

  it("отклоняет, если у этого раунда ещё не начат финал", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...roundBase, finalSession: null });

    await expect(confirmFinalJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если финал уже завершён", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...roundBase, status: "COMPLETED" });

    await expect(confirmFinalJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

// confirmFinalJudgeHeatDone() — "Готово" ПО ЗАХОДУ, только JUDGES_DANCE
// (2026-09-10, по жалобе пользователя: "судья оценил партнёров, дальше
// должен оценить вторую табличку — не может, потому что уже нажато Готово").
// В отличие от confirmFinalJudgeRoundDone (весь раунд разом), "обязательные
// клетки" считаются ТОЛЬКО по участникам ЭТОГО захода.
describe("confirmFinalJudgeHeatDone()", () => {
  const judgesDanceCriteria = [{ id: "crit1", name: "Техника", priority: 1, minScore: 0, maxScore: 10, step: 1 }];
  const heatBase = {
    id: "heat1",
    status: "RUNNING",
    round: {
      id: "round1",
      status: "SCORING",
      division: { id: "div1", competitionId: "comp1" },
      finalSession: { format: "JUDGES_DANCE" as const, config: {}, criteriaSnapshot: judgesDanceCriteria },
    },
  };

  function withParticipants(scoredJudgeIds: string[]) {
    heatFindFirstOrThrow.mockResolvedValue({
      ...heatBase,
      draws: [{ participants: [{ role: "LEADER", finalJudgeScores: scoredJudgeIds.map((judgeAssignmentId) => ({ judgeAssignmentId, criterionId: "crit1" })) }] }],
    });
  }

  it("фиксирует подтверждение ПО ЭТОМУ заходу, если у судьи проставлены все обязательные оценки", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    withParticipants(["assign1"]);
    txJudgeHeatConfirmationFindUnique.mockResolvedValue(null);
    txJudgeHeatConfirmationCreate.mockResolvedValue({ id: "conf1" });

    await confirmFinalJudgeHeatDone("heat1");

    expect(txJudgeHeatConfirmationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ heatId: "heat1", judgeAssignmentId: "assign1", yesCount: 1 }) })
    );
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "final_judge.confirm_heat" }) }));
  });

  it('отклоняет "Готово" по заходу, если оценены не все обязательные клетки этого захода', async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    withParticipants([]); // ни одной оценки этого судьи в этом заходе
    txJudgeHeatConfirmationFindUnique.mockResolvedValue(null);

    await expect(confirmFinalJudgeHeatDone("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeHeatConfirmationCreate).not.toHaveBeenCalled();
  });

  it("отклоняет для форматов финала, где заходы формируются все сразу (не JUDGES_DANCE)", async () => {
    heatFindFirstOrThrow.mockResolvedValue({
      ...heatBase,
      round: { ...heatBase.round, finalSession: { format: "NORMAL", config: {}, criteriaSnapshot: criteria } },
      draws: [{ participants: [] }],
    });

    await expect(confirmFinalJudgeHeatDone("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если заход ещё не начался (PENDING)", async () => {
    heatFindFirstOrThrow.mockResolvedValue({ ...heatBase, status: "PENDING", draws: [{ participants: [] }] });

    await expect(confirmFinalJudgeHeatDone("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("повторное нажатие после уже принятого подтверждения — не ошибка, просто ничего не делает", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    withParticipants(["assign1"]);
    txJudgeHeatConfirmationFindUnique.mockResolvedValue({ id: "already-confirmed" });

    await confirmFinalJudgeHeatDone("heat1");

    expect(txJudgeHeatConfirmationCreate).not.toHaveBeenCalled();
  });

  it("не трогает JudgeRoundConfirmation вовсе — подтверждение по заходу не должно создавать/проверять раундовую запись", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    withParticipants(["assign1"]);
    txJudgeHeatConfirmationFindUnique.mockResolvedValue(null);
    txJudgeHeatConfirmationCreate.mockResolvedValue({ id: "conf1" });

    await confirmFinalJudgeHeatDone("heat1");

    expect(txJudgeRoundConfirmationFindUnique).not.toHaveBeenCalled();
    expect(txJudgeRoundConfirmationCreate).not.toHaveBeenCalled();
  });
});

// Регрессия (2026-09-10, жалоба пользователя): в JUDGES_DANCE заходы стадий
// формируются НЕ все сразу (final-judges-dance.ts) — судья, назначенный на
// обе роли, подтверждал "Готово" после стадии 1 (тогда это было всё, что
// видно), а когда позже появлялась стадия 2, submitFinalJudgeScore проверял
// JudgeRoundConfirmation "на весь раунд" и блокировал НОВЫЕ обязательные
// клетки, которых на момент подтверждения ещё не существовало.
// submitFinalJudgeScore теперь проверяет JudgeHeatConfirmation (по заходу)
// для JUDGES_DANCE — старая раундовая запись больше не мешает.
describe("submitFinalJudgeScore() — JUDGES_DANCE проверяет подтверждение ПО ЗАХОДУ, не по раунду", () => {
  const judgesDanceParticipant = {
    id: "dp1",
    scored: true,
    role: "LEADER" as const,
    registrationId: "reg1",
    draw: {
      heat: {
        id: "heat1",
        status: "RUNNING",
        round: {
          id: "round1",
          status: "SCORING",
          division: { id: "div1", competitionId: "comp1" },
          finalSession: { format: "JUDGES_DANCE", config: {}, criteriaSnapshot: criteria },
        },
      },
    },
  };

  it('отклоняет, если судья уже нажал "Готово" именно по ЭТОМУ заходу (JudgeHeatConfirmation)', async () => {
    participantFindUniqueOrThrow.mockResolvedValue(judgesDanceParticipant);
    judgeHeatConfirmationFindUnique.mockResolvedValue({ id: "heat-conf1" });

    await expect(submitFinalJudgeScore("dp1", "crit1", 7, "sub-1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txFinalJudgeScoreUpsert).not.toHaveBeenCalled();
  });

  it("НЕ блокирует отправку из-за устаревшего JudgeRoundConfirmation на весь раунд (сам баг) — только JudgeHeatConfirmation этого захода имеет значение", async () => {
    participantFindUniqueOrThrow.mockResolvedValue(judgesDanceParticipant);
    judgeHeatConfirmationFindUnique.mockResolvedValue(null); // по ЭТОМУ заходу не подтверждал
    judgeRoundConfirmationFindUnique.mockResolvedValue({ id: "stale-round-conf" }); // но раньше подтвердил стадию 1 на весь раунд

    await submitFinalJudgeScore("dp1", "crit1", 7, "sub-1");

    expect(txFinalJudgeScoreUpsert).toHaveBeenCalled();
  });
});

// listMyActiveFinalRounds() — баннер "Финал открыт" на странице судьи
// (/judging/[competitionId]). Пока висит нерешённая перетанцовка за место
// (FULL_RANK/RANK_ALL, TIEBREAK-001/A22) — на экране самого финала уже
// нечего оценивать (SCORE-001), решение вносит HEAD_JUDGE отдельной формой,
// не судья — приглашать его открыть финал заново только сбивает с толку
// (2026-09-07, по запросу пользователя).
describe("listMyActiveFinalRounds() — скрывает финал, пока не решена перетанцовка", () => {
  it("показывает финал, если нерешённых перетанцовок нет", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ divisionId: "div1", role: "LEADER" }]);
    roundFindMany.mockResolvedValue([{ id: "final1", division: { category: { name: "Дебютанты" } }, tieBreakRounds: [] }]);

    const rounds = await listMyActiveFinalRounds("comp1");

    expect(rounds).toEqual([{ roundId: "final1", divisionName: "Дебютанты" }]);
  });

  it("скрывает финал, пока есть хоть одна незавершённая перетанцовка", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ divisionId: "div1", role: "LEADER" }]);
    roundFindMany.mockResolvedValue([
      { id: "final1", division: { category: { name: "Дебютанты" } }, tieBreakRounds: [{ id: "tb1" }] },
    ]);

    const rounds = await listMyActiveFinalRounds("comp1");

    expect(rounds).toEqual([]);
  });

  it("пустой список, если судья вообще не назначен ни на один дивизион", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);

    const rounds = await listMyActiveFinalRounds("comp1");

    expect(rounds).toEqual([]);
    expect(roundFindMany).not.toHaveBeenCalled();
  });
});

// JUDGES_DANCE (final-judges-dance.ts, 2026-09-10): заходы стадии
// формируются ВСЕ СРАЗУ (generateJudgesDanceStage), но PENDING — судья не
// должен видеть и оценивать финалистов заходов, которые ещё не вызваны на
// паркет (до этой правки round.heats отдавал ВСЕ заходы раунда без разбора
// статуса, что раньше было безопасно только потому, что заходы JUDGES_DANCE
// создавались строго по одному, именно перед стартом).
describe("getFinalJudgeQueue() — не показывает участников заходов, которые ещё не запущены", () => {
  const finalist = (id: string, bib: string) => ({
    id,
    role: "LEADER" as const,
    scored: true,
    registrationId: `reg-${id}`,
    registration: { dancer: { displayName: `Танцор ${id}` }, checkIn: { bibNumber: bib } },
    finalJudgeScores: [],
  });

  beforeEach(() => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", divisionId: "div1", judgeUserId: "judge1", role: "FOLLOWER" }]);
  });

  it("пропускает заход в статусе PENDING целиком", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      division: { id: "div1", competitionId: "comp1", category: { name: "Дебютанты" } },
      finalSession: { format: "JUDGES_DANCE", config: { dancingJudgeCriteriaIds: ["crit1"] }, currentStage: 1, criteriaSnapshot: criteria },
      heats: [
        { status: "PENDING", draws: [{ participants: [finalist("dp1", "1")] }] },
        { status: "RUNNING", draws: [{ participants: [finalist("dp2", "2")] }] },
      ],
    });

    const queue = await getFinalJudgeQueue("comp1", "final1");

    expect(queue?.items.map((it) => it.drawParticipantId)).toEqual(["dp2"]);
  });

  it("показывает участников FINISHED заходов (продолжают быть видны/редактируемы после завершения)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      division: { id: "div1", competitionId: "comp1", category: { name: "Дебютанты" } },
      finalSession: { format: "JUDGES_DANCE", config: { dancingJudgeCriteriaIds: ["crit1"] }, currentStage: 2, criteriaSnapshot: criteria },
      heats: [
        { status: "FINISHED", draws: [{ participants: [finalist("dp1", "1")] }] },
        { status: "RUNNING", draws: [{ participants: [finalist("dp2", "2")] }] },
      ],
    });

    const queue = await getFinalJudgeQueue("comp1", "final1");

    expect(queue?.items.map((it) => it.drawParticipantId).sort()).toEqual(["dp1", "dp2"]);
  });
});

// heats: FinalJudgeQueueHeat[] (2026-09-10, по жалобе пользователя) — только
// JUDGES_DANCE: каждый заход своим списком и СВОИМ "confirmed"
// (JudgeHeatConfirmation), не общим на весь раунд. Экран судьи
// (FinalJudgingScreen) переключается на вкладки по этому полю.
describe("getFinalJudgeQueue() — heats: группировка по заходам, только JUDGES_DANCE", () => {
  const finalist = (id: string, role: "LEADER" | "FOLLOWER", bib: string) => ({
    id,
    role,
    scored: true,
    registrationId: `reg-${id}`,
    registration: { dancer: { displayName: `Танцор ${id}` }, checkIn: { bibNumber: bib } },
    finalJudgeScores: [],
  });

  it("группирует items по заходу и считает confirmed НЕЗАВИСИМО для каждого", async () => {
    // Судья роли FOLLOWER: crit1 ("танцующий") виден ему у LEADER-участников
    // (стадия 1, allowedJudgeRole — противоположная роль), crit2 (обычный)
    // виден ему у FOLLOWER-участников (стадия 2, своя роль) — та же
    // асимметрия, что и в реальном JUDGES_DANCE (final-scoring-matrix.ts).
    const twoCriteria = [
      { id: "crit1", name: "Партнёрство", priority: 1, minScore: 0, maxScore: 10, step: 1 },
      { id: "crit2", name: "Музыкальность", priority: 2, minScore: 0, maxScore: 10, step: 1 },
    ];
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", divisionId: "div1", judgeUserId: "judge1", role: "FOLLOWER" }]);
    roundFindUniqueOrThrow.mockResolvedValue({
      division: { id: "div1", competitionId: "comp1", category: { name: "Любители" } },
      finalSession: { format: "JUDGES_DANCE", config: { dancingJudgeCriteriaIds: ["crit1"] }, currentStage: 2, criteriaSnapshot: twoCriteria },
      heats: [
        { id: "heat1", number: 1, status: "FINISHED", draws: [{ participants: [finalist("dp1", "LEADER", "1")] }] },
        { id: "heat2", number: 2, status: "RUNNING", draws: [{ participants: [finalist("dp2", "FOLLOWER", "2")] }] },
      ],
    });
    // Заход 1 подтверждён этим судьёй, заход 2 — ещё нет.
    judgeHeatConfirmationFindMany.mockResolvedValue([{ heatId: "heat1", judgeAssignmentId: "assign1" }]);

    const queue = await getFinalJudgeQueue("comp1", "final1");

    expect(queue?.heats).toHaveLength(2);
    expect(queue?.heats?.[0]).toMatchObject({ heatId: "heat1", heatNumber: 1, roleLabel: "Партнёры", confirmed: true });
    expect(queue?.heats?.[0]?.items.map((it) => it.drawParticipantId)).toEqual(["dp1"]);
    expect(queue?.heats?.[1]).toMatchObject({ heatId: "heat2", heatNumber: 2, roleLabel: "Партнёрши", confirmed: false });
    expect(queue?.heats?.[1]?.items.map((it) => it.drawParticipantId)).toEqual(["dp2"]);
  });

  it("не строит heats вовсе для форматов, где заходы формируются все сразу (не JUDGES_DANCE)", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", divisionId: "div1", judgeUserId: "judge1", role: "LEADER" }]);
    roundFindUniqueOrThrow.mockResolvedValue({
      division: { id: "div1", competitionId: "comp1", category: { name: "Любители" } },
      finalSession: { format: "NORMAL", config: {}, criteriaSnapshot: criteria },
      heats: [{ id: "heat1", number: 1, status: "RUNNING", draws: [{ participants: [finalist("dp1", "LEADER", "1")] }] }],
    });

    const queue = await getFinalJudgeQueue("comp1", "final1");

    expect(queue?.heats).toBeUndefined();
  });
});
