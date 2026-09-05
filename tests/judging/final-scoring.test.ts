import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const maybeFinalizeFinalAfterScoreInTxMock = vi.fn();
vi.mock("@/server/judging/final-advancement", () => ({
  maybeFinalizeFinalAfterScoreInTx: (...a: unknown[]) => maybeFinalizeFinalAfterScoreInTxMock(...a),
}));

const allowedJudgeRoleMock = vi.fn();
vi.mock("@/server/judging/final-scoring-matrix", () => ({ allowedJudgeRole: (...a: unknown[]) => allowedJudgeRoleMock(...a) }));

const participantFindUniqueOrThrow = vi.fn();
const judgeAssignmentFindUnique = vi.fn();
const txFinalJudgeScoreFindUnique = vi.fn();
const txFinalJudgeScoreUpsert = vi.fn();
const txFinalResultFindUnique = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  finalJudgeScore: { findUnique: txFinalJudgeScoreFindUnique, upsert: txFinalJudgeScoreUpsert },
  // SCORE-001: submitFinalJudgeScore теперь проверяет, не посчитан ли уже
  // FinalResult этого участника, ДО апдейта оценки — тот же случай, что и
  // обычные раунды (scoring.ts).
  finalResult: { findUnique: txFinalResultFindUnique },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drawParticipant: { findUniqueOrThrow: (...a: unknown[]) => participantFindUniqueOrThrow(...a) },
    judgeAssignment: { findUnique: (...a: unknown[]) => judgeAssignmentFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { submitFinalJudgeScore } = await import("@/server/judging/final-scoring");
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
  allowedJudgeRoleMock.mockReset().mockReturnValue("LEADER");
  participantFindUniqueOrThrow.mockReset().mockResolvedValue(participant);
  judgeAssignmentFindUnique.mockReset().mockResolvedValue({ id: "assign1" });
  txFinalJudgeScoreFindUnique.mockReset().mockResolvedValue(null);
  txFinalJudgeScoreUpsert.mockReset();
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
});
