import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const getRoundEligiblePoolMock = vi.fn();
const pickHigherCategoryHelpersMock = vi.fn();
vi.mock("@/server/competition/draw-engine", () => ({
  getRoundEligiblePool: (...a: unknown[]) => getRoundEligiblePoolMock(...a),
  pickHigherCategoryHelpers: (...a: unknown[]) => pickHigherCategoryHelpersMock(...a),
}));

const roundFindFirstOrThrow = vi.fn();
const txJudgeAssignmentCount = vi.fn();
const txRegistrationFindMany = vi.fn();
const txHeatCreate = vi.fn();
const txDrawCreate = vi.fn();
const txDrawParticipantCreateMany = vi.fn();
const txFinalSessionUpdate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  registration: { findMany: txRegistrationFindMany },
  judgeAssignment: { count: txJudgeAssignmentCount },
  heat: { create: txHeatCreate },
  draw: { create: txDrawCreate },
  drawParticipant: { createMany: txDrawParticipantCreateMany },
  finalSession: { update: txFinalSessionUpdate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findFirstOrThrow: (...a: unknown[]) => roundFindFirstOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { generateJudgesDanceStage } = await import("@/server/judging/final-judges-dance");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const baseRound = {
  id: "final1",
  order: 5,
  heatCapacity: null as number | null,
  divisionId: "div1",
  status: "RUNNING",
  division: { id: "div1", competitionId: "comp1", heatCapacity: 8, category: { order: 3 } },
  finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: null as number | null },
  heats: [] as { id: string; number: number; status: string }[],
};

// Две регистрации-финалистки (roundEligiblePool для роли, которая ТАНЦУЕТ в
// этой стадии) — используются почти во всех тестах как "обычный" случай, где
// реальных судей хватает (helperNeeded=0), чтобы не грузить каждый тест
// каскадом помощников.
const dancerRegs = [
  { id: "reg1", checkIn: { bibNumber: "1" } },
  { id: "reg2", checkIn: { bibNumber: "2" } },
];

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  getRoundEligiblePoolMock.mockReset().mockResolvedValue(new Set(["reg1", "reg2"]));
  pickHigherCategoryHelpersMock.mockReset().mockResolvedValue([]);
  roundFindFirstOrThrow.mockReset().mockResolvedValue(baseRound);
  txJudgeAssignmentCount.mockReset().mockResolvedValue(2); // хватает на обоих финалистов без помощников
  txRegistrationFindMany.mockReset().mockResolvedValueOnce(dancerRegs); // 1-й вызов — сами финалисты
  txHeatCreate.mockReset().mockImplementation(({ data }: { data: { number: number } }) => Promise.resolve({ id: `heat${data.number}` }));
  txDrawCreate.mockReset().mockResolvedValue({ id: "draw1" });
  txDrawParticipantCreateMany.mockReset();
  txFinalSessionUpdate.mockReset();
  auditCreate.mockReset();
});

describe("generateJudgesDanceStage()", () => {
  it("отклоняет для раунда не JUDGES_DANCE", async () => {
    roundFindFirstOrThrow.mockResolvedValue({ ...baseRound, finalSession: { ...baseRound.finalSession, format: "NORMAL" } });
    await expect(generateJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если финал уже завершён", async () => {
    roundFindFirstOrThrow.mockResolvedValue({ ...baseRound, status: "COMPLETED" });
    await expect(generateJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("currentStage=null -> формирует заход стадии 1 (LEADER) PENDING'ом, не RUNNING", async () => {
    const result = await generateJudgesDanceStage("final1");

    expect(result.stage).toBe(1);
    expect(getRoundEligiblePoolMock).toHaveBeenCalledWith(fakeTx, { divisionId: "div1", roundOrder: 5, role: "LEADER" });
    expect(txHeatCreate).toHaveBeenCalledWith({ data: { roundId: "final1", number: 1, status: "PENDING" } });
    expect(txDrawParticipantCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ registrationId: "reg1", role: "LEADER", calledOrder: 1, scored: true }),
          expect.objectContaining({ registrationId: "reg2", role: "LEADER", calledOrder: 2, scored: true }),
        ],
      })
    );
    expect(txFinalSessionUpdate).toHaveBeenCalledWith({ where: { id: "session1" }, data: { currentStage: 1 } });
  });

  it("currentStage=null, но заходы уже есть — отклоняет повторное формирование", async () => {
    roundFindFirstOrThrow.mockResolvedValue({ ...baseRound, heats: [{ id: "heat1", number: 1, status: "PENDING" }] });
    await expect(generateJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatCreate).not.toHaveBeenCalled();
  });

  it("больше финалистов, чем вместимость захода — делит на несколько PENDING заходов подряд по номеру", async () => {
    roundFindFirstOrThrow.mockResolvedValue({ ...baseRound, division: { ...baseRound.division, heatCapacity: 1 } });
    getRoundEligiblePoolMock.mockResolvedValue(new Set(["reg1", "reg2"]));
    txJudgeAssignmentCount.mockResolvedValue(1);

    const result = await generateJudgesDanceStage("final1");

    expect(result.heatIds).toEqual(["heat1", "heat2"]);
    expect(txHeatCreate).toHaveBeenNthCalledWith(1, { data: { roundId: "final1", number: 1, status: "PENDING" } });
    expect(txHeatCreate).toHaveBeenNthCalledWith(2, { data: { roundId: "final1", number: 2, status: "PENDING" } });
  });

  it("currentStage=1, не все заходы стадии 1 завершены — отклоняет формирование стадии 2", async () => {
    roundFindFirstOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: 1 },
      heats: [{ id: "heat1", number: 1, status: "RUNNING" }],
    });
    await expect(generateJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatCreate).not.toHaveBeenCalled();
  });

  it("currentStage=1, все заходы стадии 1 FINISHED -> формирует стадию 2 (FOLLOWER), нумерация продолжается", async () => {
    roundFindFirstOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: 1 },
      heats: [{ id: "heat1", number: 1, status: "FINISHED" }],
    });

    const result = await generateJudgesDanceStage("final1");

    expect(result.stage).toBe(2);
    expect(getRoundEligiblePoolMock).toHaveBeenCalledWith(fakeTx, { divisionId: "div1", roundOrder: 5, role: "FOLLOWER" });
    expect(txHeatCreate).toHaveBeenCalledWith({ data: { roundId: "final1", number: 2, status: "PENDING" } });
    expect(txFinalSessionUpdate).toHaveBeenCalledWith({ where: { id: "session1" }, data: { currentStage: 2 } });
  });

  it("currentStage=2 -> отклоняет (обе стадии уже сформированы)", async () => {
    roundFindFirstOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: 2 },
      heats: [
        { id: "heat1", number: 1, status: "FINISHED" },
        { id: "heat2", number: 2, status: "FINISHED" },
      ],
    });
    await expect(generateJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatCreate).not.toHaveBeenCalled();
  });

  it("реальных судей не хватает — добирает помощников каскадом: категория выше -> своя не в финале -> финалисты этого финала", async () => {
    // 3 финалиста-ведущих, 1 реальный судья-Ведомая -> нужно 2 помощника.
    getRoundEligiblePoolMock.mockImplementation((_tx: unknown, { role }: { role: string }) =>
      Promise.resolve(role === "LEADER" ? new Set(["reg1", "reg2", "reg3"]) : new Set(["followerFinalist1"]))
    );
    txRegistrationFindMany
      .mockReset()
      .mockResolvedValueOnce([
        { id: "reg1", checkIn: { bibNumber: "1" } },
        { id: "reg2", checkIn: { bibNumber: "2" } },
        { id: "reg3", checkIn: { bibNumber: "3" } },
      ]) // финалисты-ведущие (стадия 1)
      .mockResolvedValueOnce([{ id: "sameCatHelper", checkIn: { bibNumber: "9" } }]) // уровень 2: своя категория, не в финале
      .mockResolvedValueOnce([{ id: "followerFinalist1", checkIn: { bibNumber: "5" } }]); // уровень 3: финалистки, ждущие стадии 2
    pickHigherCategoryHelpersMock.mockResolvedValue(["higherCatHelper"]); // уровень 1: категория выше
    txJudgeAssignmentCount.mockResolvedValue(1); // 1 реальный судья-Ведомая, нужно ещё 2

    await generateJudgesDanceStage("final1");

    const created = txDrawParticipantCreateMany.mock.calls[0][0].data as { registrationId: string; role: string; scored: boolean; helperSource?: string }[];
    const helpers = created.filter((p) => !p.scored);
    expect(helpers.map((h) => h.registrationId)).toEqual(["higherCatHelper", "sameCatHelper"]);
    expect(helpers[0]).toMatchObject({ role: "FOLLOWER", helperSource: "GUEST_HIGHER_CATEGORY" });
    expect(helpers[1]).toMatchObject({ role: "FOLLOWER", helperSource: "SAME_CATEGORY_NON_FINALIST" });
  });
});
