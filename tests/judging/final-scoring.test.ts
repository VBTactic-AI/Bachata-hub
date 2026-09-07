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
const roundFindUniqueOrThrow = vi.fn();
const heatFindMany = vi.fn();
const txFinalJudgeScoreFindUnique = vi.fn();
const txFinalJudgeScoreFindFirst = vi.fn();
const txFinalJudgeScoreUpsert = vi.fn();
const txFinalJudgeScoreDelete = vi.fn();
const txHeatFindMany = vi.fn();
const txFinalResultFindUnique = vi.fn();
const txJudgeRoundConfirmationFindUnique = vi.fn();
const txJudgeRoundConfirmationCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
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
  finalResult: { findUnique: txFinalResultFindUnique },
  judgeRoundConfirmation: { findUnique: txJudgeRoundConfirmationFindUnique, create: txJudgeRoundConfirmationCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drawParticipant: { findUniqueOrThrow: (...a: unknown[]) => participantFindUniqueOrThrow(...a) },
    judgeAssignment: {
      findUnique: (...a: unknown[]) => judgeAssignmentFindUnique(...a),
      findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a),
    },
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    heat: { findMany: (...a: unknown[]) => heatFindMany(...a) },
    // "Готово" по финалу (confirmFinalJudgeRoundDone, 2026-09-07) — та же
    // проверка "судья уже подтвердил", что и в обычных раундах (scoring.ts).
    judgeRoundConfirmation: { findUnique: (...a: unknown[]) => judgeRoundConfirmationFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { submitFinalJudgeScore, confirmFinalJudgeRoundDone } = await import("@/server/judging/final-scoring");
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
  roundFindUniqueOrThrow.mockReset();
  heatFindMany.mockReset();
  txJudgeRoundConfirmationFindUnique.mockReset();
  txJudgeRoundConfirmationCreate.mockReset();
  txFinalJudgeScoreFindUnique.mockReset().mockResolvedValue(null);
  txFinalJudgeScoreFindFirst.mockReset().mockResolvedValue(null);
  txFinalJudgeScoreUpsert.mockReset();
  txFinalJudgeScoreDelete.mockReset();
  txHeatFindMany.mockReset().mockResolvedValue([]);
  txFinalResultFindUnique.mockReset().mockResolvedValue(null);
  auditCreate.mockReset();
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
