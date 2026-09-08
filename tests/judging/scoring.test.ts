import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

// submitJudgeScore стартует getActor() параллельно с загрузкой участника
// (чтобы RBAC-запрос не ждал ответа по участнику — оптимизация задержки,
// 2026-09-08). Настоящий getActor() читает cookies(), которых вне
// HTTP-запроса нет, поэтому мокаем ту же границу RBAC, что и
// requirePermission выше. Результат этого вызова код не использует —
// прогревается только cache().
vi.mock("@/server/rbac/actor", () => ({ getActor: () => Promise.resolve(null) }));

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
const txRoundResultFindUnique = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  judgeScore: { findUnique: txJudgeScoreFindUnique, findFirst: txJudgeScoreFindUnique, upsert: txJudgeScoreUpsert, count: txJudgeScoreCount },
  judgeRoundConfirmation: { findUnique: txJudgeRoundConfirmationFindUnique, findFirst: txJudgeRoundConfirmationFindUnique, create: txJudgeRoundConfirmationCreate },
  // SCORE-001: submitJudgeScore теперь проверяет, не посчитан ли уже
  // результат этого участника, ДО апдейта самой оценки.
  roundResult: { findUnique: txRoundResultFindUnique, findFirst: txRoundResultFindUnique },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drawParticipant: { findUniqueOrThrow: (...a: unknown[]) => participantFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => participantFindUniqueOrThrow(...a) },
    judgeAssignment: {
      findUnique: (...a: unknown[]) => judgeAssignmentFindUnique(...a), findFirst: (...a: unknown[]) => judgeAssignmentFindUnique(...a),
      findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a),
    },
    heat: { findMany: (...a: unknown[]) => heatFindMany(...a) },
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    // Проверка "судья уже нажал Готово" в submitJudgeScore, и список
    // подтверждений для getJudgeQueue — обе идут ВНЕ транзакции.
    judgeRoundConfirmation: {
      findUnique: (...a: unknown[]) => judgeRoundConfirmationFindUnique(...a), findFirst: (...a: unknown[]) => judgeRoundConfirmationFindUnique(...a),
      findMany: (...a: unknown[]) => judgeRoundConfirmationFindMany(...a),
    },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { submitJudgeScore, getJudgeQueue, confirmJudgeRoundDone, scoreQuotaForScale2 } = await import("@/server/judging/scoring");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "judge1", email: "j@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const participant = {
  id: "dp1",
  scored: true,
  role: "LEADER" as const,
  registrationId: "reg1",
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
  // confirmations — подтверждение "Готово" этого судьи по этому раунду
  // теперь приходит вложенным в тот же запрос назначения (раньше это был
  // отдельный round-trip judgeRoundConfirmation.findUnique). Пустой массив =
  // "Готово" ещё не нажимал.
  judgeAssignmentFindUnique.mockReset().mockResolvedValue({ id: "assign1", confirmations: [] });
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
  txRoundResultFindUnique.mockReset().mockResolvedValue(null);
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

  // SCORE-001: раунд остаётся в SCORING сколь угодно долго, пока не решена
  // перетанцовка ДРУГОЙ роли — round.status === "COMPLETED" эту ситуацию не
  // ловит. Если для этого участника RoundResult уже посчитан, попытка
  // изменить оценку должна отклоняться явно, а не молча ни на что не влиять.
  it("отклоняет отправку, если RoundResult для этого участника уже посчитан (round всё ещё SCORING из-за другой роли)", async () => {
    txRoundResultFindUnique.mockResolvedValue({ roundId: "round1", registrationId: "reg1", status: "ADVANCED" });

    await expect(submitJudgeScore("dp1", 1, "sub-1")).rejects.toBeInstanceOf(ValidationFailedError);

    expect(txJudgeScoreUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  // Guard существовал и раньше, но тестом покрыт не был; при оптимизации
  // задержек (2026-09-08) он стал читать подтверждение вложенным в запрос
  // назначения, а не отдельным round-trip'ом — поведение обязано остаться
  // тем же: судья, нажавший "Готово", оценки уже не меняет (A21).
  it("отклоняет отправку, если этот судья уже нажал «Готово» по раунду", async () => {
    judgeAssignmentFindUnique.mockResolvedValue({ id: "assign1", confirmations: [{ id: "conf1" }] });

    await expect(submitJudgeScore("dp1", 1, "sub-1")).rejects.toBeInstanceOf(ValidationFailedError);

    expect(txJudgeScoreUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
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

  it("отклоняет, если раунд уже завершён", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...roundBase, status: "COMPLETED" });

    await expect(confirmJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

// scoreQuotaForScale2() — чистая функция, квота для формата "0/1/2"
// (docs/00_DECISIONS.md, 2026-09-07): ceil(N/2) оценок "2", floor(N/2)
// оценок "1", где N = Round.finalistsCount для роли.
describe("scoreQuotaForScale2()", () => {
  it("чётное N — поровну", () => {
    expect(scoreQuotaForScale2(6)).toEqual({ twosNeeded: 3, onesNeeded: 3 });
  });

  it("нечётное N — лишняя единица уходит в «2»", () => {
    expect(scoreQuotaForScale2(3)).toEqual({ twosNeeded: 2, onesNeeded: 1 });
  });

  it("N=1 — одна оценка «2», ни одной «1»", () => {
    expect(scoreQuotaForScale2(1)).toEqual({ twosNeeded: 1, onesNeeded: 0 });
  });

  it("N=0 — квота пустая (в проде недостижимо: confirmJudgeRoundDone отклоняет finalistsCount=0)", () => {
    expect(scoreQuotaForScale2(0)).toEqual({ twosNeeded: 0, onesNeeded: 0 });
  });
});

// Формат "0/1/2" (Round.judgingMaxScore=2) — та же строгость, что и "Да/Нет":
// жёсткий блок на "Готово", пока распределение "2"/"1" не совпадёт точно с
// scoreQuotaForScale2 (docs/00_DECISIONS.md, 2026-09-07). До этой фичи любой
// judgingMaxScore !== 1 отклонялся сразу — теперь 2 полноценно поддержан.
describe('confirmJudgeRoundDone() — формат "0/1/2"', () => {
  const roundBase2 = {
    id: "round1",
    status: "SCORING",
    judgingMaxScore: 2,
    finalistsCount: 6, // twosNeeded=3, onesNeeded=3
    division: { id: "div1", competitionId: "comp1" },
  };

  function mockCounts(twos: number, ones: number) {
    txJudgeScoreCount.mockImplementation(({ where }: { where: { value: number } }) =>
      Promise.resolve(where.value === 2 ? twos : ones)
    );
  }

  it("фиксирует оценки при точной квоте (чётное N=6 → 3 «2» и 3 «1»)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase2);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    txJudgeRoundConfirmationFindUnique.mockResolvedValue(null);
    mockCounts(3, 3);
    txJudgeRoundConfirmationCreate.mockResolvedValue({ id: "conf1" });

    await confirmJudgeRoundDone("round1");

    expect(txJudgeRoundConfirmationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roundId: "round1", judgeAssignmentId: "assign1", yesCount: 3 }) })
    );
    expect(maybeFinalizeAfterScoreInTxMock).toHaveBeenCalledWith(fakeTx, "round1", actor);
  });

  it("нечётное N=3 (twosNeeded=2, onesNeeded=1) — фиксирует при 2 «2» и 1 «1»", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...roundBase2, finalistsCount: 3 });
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "FOLLOWER" }]);
    txJudgeRoundConfirmationFindUnique.mockResolvedValue(null);
    mockCounts(2, 1);
    txJudgeRoundConfirmationCreate.mockResolvedValue({ id: "conf1" });

    await confirmJudgeRoundDone("round1");

    expect(txJudgeRoundConfirmationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ yesCount: 2 }) })
    );
  });

  it('отклоняет "Готово", если числа "2"/"1" не совпадают с квотой, и ничего не фиксирует', async () => {
    roundFindUniqueOrThrow.mockResolvedValue(roundBase2);
    judgeAssignmentFindMany.mockResolvedValue([{ id: "assign1", role: "LEADER" }]);
    txJudgeRoundConfirmationFindUnique.mockResolvedValue(null);
    mockCounts(4, 2); // нужно 3 и 3

    await expect(confirmJudgeRoundDone("round1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeRoundConfirmationCreate).not.toHaveBeenCalled();
  });
});
