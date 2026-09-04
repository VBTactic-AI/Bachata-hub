import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const maybeFinalizeAfterScoreInTxMock = vi.fn();
vi.mock("@/server/judging/advancement", () => ({ maybeFinalizeAfterScoreInTx: (...a: unknown[]) => maybeFinalizeAfterScoreInTxMock(...a) }));

const participantFindUniqueOrThrow = vi.fn();
const judgeAssignmentFindUnique = vi.fn();
const txJudgeScoreFindUnique = vi.fn();
const txJudgeScoreUpsert = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  judgeScore: { findUnique: txJudgeScoreFindUnique, upsert: txJudgeScoreUpsert },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drawParticipant: { findUniqueOrThrow: (...a: unknown[]) => participantFindUniqueOrThrow(...a) },
    judgeAssignment: { findUnique: (...a: unknown[]) => judgeAssignmentFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { submitJudgeScore } = await import("@/server/judging/scoring");

const actor: Actor = { userId: "judge1", email: "j@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const participant = {
  id: "dp1",
  scored: true,
  role: "LEADER" as const,
  draw: {
    heat: {
      status: "RUNNING",
      round: {
        status: "RUNNING",
        judgingMaxScore: 2,
        division: { id: "div1", competitionId: "comp1" },
      },
    },
  },
};

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  maybeFinalizeAfterScoreInTxMock.mockReset();
  participantFindUniqueOrThrow.mockReset().mockResolvedValue(participant);
  judgeAssignmentFindUnique.mockReset().mockResolvedValue({ id: "assign1" });
  txJudgeScoreFindUnique.mockReset();
  txJudgeScoreUpsert.mockReset();
  auditCreate.mockReset();
});

describe("submitJudgeScore() — идемпотентность офлайн-очереди (CLAUDE.md §17)", () => {
  it("первая отправка создаёт JudgeScore с переданным clientSubmissionId и audit score.submit", async () => {
    txJudgeScoreFindUnique.mockResolvedValue(null);

    await submitJudgeScore("dp1", 1, "sub-1");

    expect(txJudgeScoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ value: 1, clientSubmissionId: "sub-1" }),
        update: expect.objectContaining({ value: 1, clientSubmissionId: "sub-1" }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "score.submit" }) }));
  });

  it("повтор с тем же clientSubmissionId (ретрай офлайн-очереди) — no-op: без upsert и без audit", async () => {
    txJudgeScoreFindUnique.mockResolvedValue({ value: 1, clientSubmissionId: "sub-1" });

    await submitJudgeScore("dp1", 1, "sub-1");

    expect(txJudgeScoreUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(maybeFinalizeAfterScoreInTxMock).not.toHaveBeenCalled();
  });

  it("новое значение с другим clientSubmissionId — реальное исправление: upsert + audit score.correct", async () => {
    txJudgeScoreFindUnique.mockResolvedValue({ value: 1, clientSubmissionId: "sub-1" });

    await submitJudgeScore("dp1", 2, "sub-2");

    expect(txJudgeScoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ value: 2, clientSubmissionId: "sub-2" }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "score.correct", before: { value: 1 } }) }),
    );
  });
});
