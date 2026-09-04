import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const maybeFinalizeAfterScoreInTxMock = vi.fn();
const isFinalStageInTxMock = vi.fn();
// Частичный мок: isFinalStageInTx/maybeFinalizeAfterScoreInTx подменяем (не
// хотим тянуть их собственные обращения к БД в этот тестовый файл), а
// rolesNotNeedingJudging оставляем настоящей — это как раз то правило,
// которое здесь проверяется (не хотим случайно протестировать сам мок).
vi.mock("@/server/judging/advancement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/judging/advancement")>();
  return {
    ...actual,
    maybeFinalizeAfterScoreInTx: (...a: unknown[]) => maybeFinalizeAfterScoreInTxMock(...a),
    isFinalStageInTx: (...a: unknown[]) => isFinalStageInTxMock(...a),
  };
});

const participantFindUniqueOrThrow = vi.fn();
const judgeAssignmentFindUnique = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const heatFindMany = vi.fn();
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
    judgeAssignment: {
      findUnique: (...a: unknown[]) => judgeAssignmentFindUnique(...a),
      findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a),
    },
    heat: { findMany: (...a: unknown[]) => heatFindMany(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { submitJudgeScore, getJudgeQueue } = await import("@/server/judging/scoring");

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
  isFinalStageInTxMock.mockReset().mockResolvedValue(false);
  participantFindUniqueOrThrow.mockReset().mockResolvedValue(participant);
  judgeAssignmentFindUnique.mockReset().mockResolvedValue({ id: "assign1" });
  judgeAssignmentFindMany.mockReset();
  heatFindMany.mockReset();
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

// По запросу пользователя (2026-09-04), на конкретном примере "5 ведущих,
// 9 ведомых, проходят 6 пар": ведущих не отсеивать, судьи их не оценивают,
// а на экране судьи должно быть явно видно, почему пунктов для этой роли
// нет — не просто пустой список.
describe("getJudgeQueue() — роль без отсева не показывается судье", () => {
  function makeHeat() {
    const leaders = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      role: "LEADER" as const,
      registration: { dancer: { displayName: `Ведущий ${i}` }, checkIn: { bibNumber: String(i) } },
      judgeScores: [],
    }));
    const followers = Array.from({ length: 9 }, (_, i) => ({
      id: `f${i}`,
      role: "FOLLOWER" as const,
      registration: { dancer: { displayName: `Ведомая ${i}` }, checkIn: { bibNumber: String(100 + i) } },
      judgeScores: [],
    }));
    const heat = {
      id: "heat1",
      number: 1,
      round: {
        id: "round1",
        divisionId: "div1",
        judgingMaxScore: 2,
        finalistsCount: 6,
        order: 1,
        type: null,
        division: { category: { name: "Открытый" } },
      },
      draws: [{ participants: [...leaders, ...followers] }],
    };
    const roundAggregate = {
      roundId: "round1",
      draws: [{ participants: [...leaders, ...followers].map((p) => ({ role: p.role })) }],
    };
    return { heat, roundAggregate };
  }

  it("5 ведущих / 9 ведомых, проходят 6 пар, не финал — судья видит только ведомых + уведомление про ведущих", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "asg-l", divisionId: "div1", role: "LEADER" },
      { id: "asg-f", divisionId: "div1", role: "FOLLOWER" },
    ]);
    const { heat, roundAggregate } = makeHeat();
    heatFindMany.mockResolvedValueOnce([heat]).mockResolvedValueOnce([roundAggregate]);
    isFinalStageInTxMock.mockResolvedValue(false);

    const result = await getJudgeQueue("comp1");

    expect(result.items).toHaveLength(9);
    expect(result.items.every((i) => i.role === "FOLLOWER")).toBe(true);
    expect(result.skippedNotices).toEqual([{ roundId: "round1", divisionName: "Открытый", role: "LEADER" }]);
  });

  it("тот же расклад в финале — ведущих тоже оценивают, уведомления нет", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "asg-l", divisionId: "div1", role: "LEADER" },
      { id: "asg-f", divisionId: "div1", role: "FOLLOWER" },
    ]);
    const { heat, roundAggregate } = makeHeat();
    heatFindMany.mockResolvedValueOnce([heat]).mockResolvedValueOnce([roundAggregate]);
    isFinalStageInTxMock.mockResolvedValue(true);

    const result = await getJudgeQueue("comp1");

    expect(result.items).toHaveLength(14);
    expect(result.skippedNotices).toEqual([]);
  });

  it("не показывает уведомление, если сам судья на эту роль не назначен", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "asg-f", divisionId: "div1", role: "FOLLOWER" }]);
    const { heat, roundAggregate } = makeHeat();
    heatFindMany.mockResolvedValueOnce([heat]).mockResolvedValueOnce([roundAggregate]);
    isFinalStageInTxMock.mockResolvedValue(false);

    const result = await getJudgeQueue("comp1");

    expect(result.items).toHaveLength(9);
    expect(result.skippedNotices).toEqual([]);
  });
});
