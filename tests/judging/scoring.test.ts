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
const roundFindUniqueOrThrow = vi.fn();
const judgeRoundConfirmationFindUnique = vi.fn();
const judgeRoundConfirmationFindMany = vi.fn();
const txJudgeScoreFindUnique = vi.fn();
const txJudgeScoreUpsert = vi.fn();
const txJudgeScoreCount = vi.fn();
const txJudgeRoundConfirmationFindUnique = vi.fn();
const txJudgeRoundConfirmationCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  judgeScore: { findUnique: txJudgeScoreFindUnique, upsert: txJudgeScoreUpsert, count: txJudgeScoreCount },
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
    heat: { findMany: (...a: unknown[]) => heatFindMany(...a) },
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    // Проверка "судья уже нажал Готово" в submitJudgeScore, и список
    // подтверждений для getJudgeQueue — обе идут ВНЕ транзакции.
    judgeRoundConfirmation: {
      findUnique: (...a: unknown[]) => judgeRoundConfirmationFindUnique(...a),
      findMany: (...a: unknown[]) => judgeRoundConfirmationFindMany(...a),
    },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { submitJudgeScore, getJudgeQueue, confirmJudgeRoundDone } = await import("@/server/judging/scoring");
const { ValidationFailedError } = await import("@/server/errors");

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
  roundFindUniqueOrThrow.mockReset();
  judgeRoundConfirmationFindUnique.mockReset().mockResolvedValue(null);
  judgeRoundConfirmationFindMany.mockReset().mockResolvedValue([]);
  txJudgeScoreFindUnique.mockReset();
  txJudgeScoreUpsert.mockReset();
  txJudgeScoreCount.mockReset();
  txJudgeRoundConfirmationFindUnique.mockReset();
  txJudgeRoundConfirmationCreate.mockReset();
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
    // finalistsCount — сколько "Да" ожидается от судьи на весь раунд
    // (2026-09-04, счётчик "Отметили X из N" на странице судьи).
    expect(result.items.every((i) => i.finalistsCount === 6)).toBe(true);
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

// Кнопка "Готово" по раунду формата "Да/Нет" (по запросу пользователя,
// 2026-09-04): судья свободно кликает "Да"/"Нет" сколько угодно раз, но
// раунд не завершается по одним сырым кликам — только когда судья явно
// нажал "Готово" И у него ровно нужное число "Да".
describe("confirmJudgeRoundDone()", () => {
  const roundBase = {
    id: "round1",
    status: "SCORING",
    judgingMaxScore: 1,
    finalistsCount: 2,
    division: { id: "div1", competitionId: "comp1" },
  };

  it("фиксирует оценки, если Да ровно finalistsCount", async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    txJudgeRoundConfirmationFindUnique.mockResolvedValue(null);
    txJudgeScoreCount.mockResolvedValue(2); // ровно 2 "Да", finalistsCount=2
    txJudgeRoundConfirmationCreate.mockResolvedValue({ id: "conf1" });

    await confirmJudgeRoundDone("round1");

    expect(txJudgeRoundConfirmationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roundId: "round1", judgeAssignmentId: "assign1", yesCount: 2 }) })
    );
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "judge.confirm_round" }) }));
    expect(maybeFinalizeAfterScoreInTxMock).toHaveBeenCalledWith(fakeTx, "round1", actor);
  });

  it('отклоняет "Готово", если Да не равно finalistsCount, и ничего не фиксирует', async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "FOLLOWER" }]);
    txJudgeRoundConfirmationFindUnique.mockResolvedValue(null);
    txJudgeScoreCount.mockResolvedValue(3); // нужно 2, а тут 3

    await expect(confirmJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);

    expect(txJudgeRoundConfirmationCreate).not.toHaveBeenCalled();
  });

  it("повторное нажатие после уже принятого подтверждения — не ошибка, просто ничего не делает", async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    txJudgeRoundConfirmationFindUnique.mockResolvedValue({ id: "already-confirmed" });

    await confirmJudgeRoundDone("round1");

    expect(txJudgeScoreCount).not.toHaveBeenCalled();
    expect(txJudgeRoundConfirmationCreate).not.toHaveBeenCalled();
  });

  it('отклоняет "Готово" для раунда со шкалой 0/1/2 — кнопка только для формата "Да/Нет"', async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...roundBase, judgingMaxScore: 2 });

    await expect(confirmJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(judgeAssignmentFindMany).not.toHaveBeenCalled();
  });

  it("отклоняет, если раунд уже завершён", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...roundBase, status: "COMPLETED" });

    await expect(confirmJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
