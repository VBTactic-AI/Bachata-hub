import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const judgeScoreFindMany = vi.fn();
const finalJudgeScoreFindMany = vi.fn();
const judgeRoundConfirmationFindMany = vi.fn();
const userFindMany = vi.fn();
const txJudgeAssignmentDelete = vi.fn();
const txJudgeAssignmentCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  judgeAssignment: { delete: txJudgeAssignmentDelete, create: txJudgeAssignmentCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a) },
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    judgeScore: { findMany: (...a: unknown[]) => judgeScoreFindMany(...a) },
    finalJudgeScore: { findMany: (...a: unknown[]) => finalJudgeScoreFindMany(...a) },
    judgeRoundConfirmation: { findMany: (...a: unknown[]) => judgeRoundConfirmationFindMany(...a) },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { setDivisionJudges } = await import("@/server/judging/judge-assignment");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ competitionId: "comp1" });
  judgeAssignmentFindMany.mockReset().mockResolvedValue([{ id: "asg-old", role: "LEADER", judgeUserId: "judge-old" }]);
  judgeScoreFindMany.mockReset().mockResolvedValue([]);
  finalJudgeScoreFindMany.mockReset().mockResolvedValue([]);
  judgeRoundConfirmationFindMany.mockReset().mockResolvedValue([]);
  userFindMany.mockReset().mockResolvedValue([{ email: "old@judge.by" }]);
  txJudgeAssignmentDelete.mockReset();
  txJudgeAssignmentCreate.mockReset().mockResolvedValue({ id: "asg-new" });
  auditCreate.mockReset();
});

// JUDGE-001: раньше removeDrawHelper-подобная попытка убрать судью, который
// уже что-то оценил, падала необработанной FK-ошибкой БД (JudgeScore/
// FinalJudgeScore/JudgeRoundConfirmation -> JudgeAssignment, ON DELETE
// RESTRICT) и превращалась в общий 500. Теперь проверяется заранее.
describe("setDivisionJudges() — JUDGE-001", () => {
  it("убирает судью без оценок как обычно", async () => {
    await setDivisionJudges("div1", [], []);

    expect(txJudgeAssignmentDelete).toHaveBeenCalledWith({ where: { id: "asg-old" } });
  });

  it("отклоняет удаление судьи, у которого уже есть JudgeScore — называет его email", async () => {
    judgeScoreFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", [], [])).rejects.toThrow(/old@judge\.by/);
    expect(txJudgeAssignmentDelete).not.toHaveBeenCalled();
  });

  it("отклоняет удаление судьи, у которого уже есть FinalJudgeScore", async () => {
    finalJudgeScoreFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", [], [])).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeAssignmentDelete).not.toHaveBeenCalled();
  });

  it("отклоняет удаление судьи, который уже нажал JudgeRoundConfirmation", async () => {
    judgeRoundConfirmationFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", [], [])).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeAssignmentDelete).not.toHaveBeenCalled();
  });

  it("блокирует весь дифф разом, если хоть одно удаление заблокировано (даже если заодно добавляют новых судей)", async () => {
    judgeScoreFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", ["judge-new"], [])).rejects.toBeInstanceOf(ValidationFailedError);
    // Ничего не применено частично — ни удаление, ни добавление.
    expect(txJudgeAssignmentCreate).not.toHaveBeenCalled();
  });
});
