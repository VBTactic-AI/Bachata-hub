import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
  can: () => true,
}));

const getActorMock = vi.fn();
vi.mock("@/server/rbac/actor", () => ({ getActor: (...a: unknown[]) => getActorMock(...a) }));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const divisionFindUnique = vi.fn();
const audienceVoteFindUnique = vi.fn();
const audienceVoteFindUniqueOrThrow = vi.fn();
const audienceVoteBallotUpsert = vi.fn();
const audienceVoteBallotFindMany = vi.fn();
const audienceVoteBallotGroupBy = vi.fn();
const audienceVoteWinnerCount = vi.fn();
const audienceVoteWinnerFindMany = vi.fn();
const registrationFindFirst = vi.fn();
const registrationFindMany = vi.fn();

const txAudienceVoteUpdate = vi.fn();
const txAudienceVoteCreate = vi.fn();
const txAudienceVoteUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const txAudienceVoteFindUniqueOrThrow = vi.fn();
const txAudienceVoteWinnerFindMany = vi.fn().mockResolvedValue([]);
const txAudienceVoteWinnerDeleteMany = vi.fn();
const txAudienceVoteWinnerCreateMany = vi.fn();
const txAuditCreate = vi.fn();

const fakeTx = {
  audienceVote: {
    update: txAudienceVoteUpdate,
    create: txAudienceVoteCreate,
    updateMany: txAudienceVoteUpdateMany,
    findUniqueOrThrow: txAudienceVoteFindUniqueOrThrow,
  },
  audienceVoteWinner: {
    findMany: txAudienceVoteWinnerFindMany,
    deleteMany: txAudienceVoteWinnerDeleteMany,
    createMany: txAudienceVoteWinnerCreateMany,
  },
  auditLog: { create: txAuditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: {
      findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a),
      findUnique: (...a: unknown[]) => divisionFindUnique(...a),
    },
    audienceVote: {
      findUnique: (...a: unknown[]) => audienceVoteFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => audienceVoteFindUniqueOrThrow(...a),
    },
    audienceVoteBallot: {
      upsert: (...a: unknown[]) => audienceVoteBallotUpsert(...a),
      findMany: (...a: unknown[]) => audienceVoteBallotFindMany(...a),
      groupBy: (...a: unknown[]) => audienceVoteBallotGroupBy(...a),
    },
    audienceVoteWinner: {
      count: (...a: unknown[]) => audienceVoteWinnerCount(...a),
      findMany: (...a: unknown[]) => audienceVoteWinnerFindMany(...a),
    },
    registration: {
      findFirst: (...a: unknown[]) => registrationFindFirst(...a),
      findMany: (...a: unknown[]) => registrationFindMany(...a),
    },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const {
  configureAudienceVote,
  startAudienceVote,
  stopAudienceVote,
  castAudienceVoteBallot,
  confirmAudienceVoteWinners,
  publishAudienceVoteResults,
  unpublishAudienceVoteResults,
  getAudienceVotePublicView,
} = await import("@/server/competition/audience-vote");
const { ValidationFailedError, AuthenticationRequiredError, InvalidStateTransitionError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const division = { id: "div1", competitionId: "comp1", category: { name: "Дебютанты" } };

const candidateLeader = { id: "reg-l", role: "LEADER" as const, checkIn: { bibNumber: "1" }, dancer: { displayName: "Иван" } };
const candidateFollower = { id: "reg-f", role: "FOLLOWER" as const, checkIn: { bibNumber: "2" }, dancer: { displayName: "Мария" } };

function baseVote(overrides: Record<string, unknown> = {}) {
  return {
    id: "av1",
    divisionId: "div1",
    mode: "GENERAL",
    displayMode: "NUMBER_AND_NAME",
    infoText: null,
    status: "IDLE",
    statusVersion: 0,
    startedAt: null,
    closesAt: null,
    closedAt: null,
    publishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  getActorMock.mockReset().mockResolvedValue(null);
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "voter1" });
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue(division);
  divisionFindUnique.mockReset().mockResolvedValue(division);
  audienceVoteFindUnique.mockReset().mockResolvedValue(null);
  audienceVoteFindUniqueOrThrow.mockReset();
  audienceVoteBallotUpsert.mockReset();
  audienceVoteBallotFindMany.mockReset().mockResolvedValue([]);
  audienceVoteBallotGroupBy.mockReset().mockResolvedValue([]);
  audienceVoteWinnerCount.mockReset().mockResolvedValue(0);
  audienceVoteWinnerFindMany.mockReset().mockResolvedValue([]);
  registrationFindFirst.mockReset().mockResolvedValue(candidateLeader);
  registrationFindMany.mockReset().mockResolvedValue([candidateLeader, candidateFollower]);
  txAudienceVoteUpdate.mockReset();
  txAudienceVoteCreate.mockReset().mockResolvedValue(baseVote());
  txAudienceVoteUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txAudienceVoteFindUniqueOrThrow.mockReset();
  txAudienceVoteWinnerFindMany.mockReset().mockResolvedValue([]);
  txAudienceVoteWinnerDeleteMany.mockReset();
  txAudienceVoteWinnerCreateMany.mockReset();
  txAuditCreate.mockReset();
});

describe("configureAudienceVote() — настройки только пока IDLE", () => {
  it("создаёт новую запись, если голосования для категории ещё нет", async () => {
    audienceVoteFindUnique.mockResolvedValue(null);
    await configureAudienceVote("div1", { mode: "GENERAL", displayMode: "NUMBER_AND_NAME", infoText: null });
    expect(txAudienceVoteCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ divisionId: "div1", mode: "GENERAL" }) }));
    expect(requirePermissionMock).toHaveBeenCalledWith("audience_vote:manage", "comp1");
  });

  it("обновляет существующую запись, пока IDLE", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote());
    await configureAudienceVote("div1", { mode: "BY_ROLE", displayMode: "NUMBER_ONLY", infoText: "Правила" });
    expect(txAudienceVoteUpdate).toHaveBeenCalled();
  });

  it("отклоняет изменение настроек после старта голосования", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "RUNNING" }));
    await expect(configureAudienceVote("div1", { mode: "GENERAL", displayMode: "NUMBER_AND_NAME", infoText: null })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
  });

  it("пробрасывает отказ RBAC", async () => {
    requirePermissionMock.mockRejectedValue(new Error("no permission"));
    await expect(configureAudienceVote("div1", { mode: "GENERAL", displayMode: "NUMBER_AND_NAME", infoText: null })).rejects.toThrow("no permission");
  });
});

describe("startAudienceVote() — таймер и переход IDLE -> RUNNING", () => {
  it("требует, чтобы настройки уже были заданы", async () => {
    audienceVoteFindUnique.mockResolvedValue(null);
    await expect(startAudienceVote("div1", {})).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("считает closesAt от durationMinutes и переводит в RUNNING", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote());
    const before = Date.now();
    await startAudienceVote("div1", { durationMinutes: 5 });
    const call = txAudienceVoteUpdateMany.mock.calls[0][0];
    expect(call.data.status).toBe("RUNNING");
    const closesAt = new Date(call.data.closesAt).getTime();
    expect(closesAt).toBeGreaterThanOrEqual(before + 5 * 60_000 - 1000);
    expect(closesAt).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 1000);
  });

  it("без durationMinutes запускает без таймера (closesAt = null)", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote());
    await startAudienceVote("div1", {});
    expect(txAudienceVoteUpdateMany.mock.calls[0][0].data.closesAt).toBeNull();
  });

  it("отклоняет запуск уже идущего голосования (недопустимый переход)", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "RUNNING" }));
    await expect(startAudienceVote("div1", {})).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });
});

describe("stopAudienceVote()", () => {
  it("переводит RUNNING -> CLOSED", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "RUNNING" }));
    await stopAudienceVote("div1");
    expect(txAudienceVoteUpdateMany.mock.calls[0][0].data.status).toBe("CLOSED");
  });

  it("отклоняет остановку не запущенного голосования", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "IDLE" }));
    await expect(stopAudienceVote("div1")).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });
});

describe("castAudienceVoteBallot() — голос зрителя", () => {
  it("требует авторизацию", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(castAudienceVoteBallot("div1", { role: "ANY", registrationId: "reg-l" })).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("отклоняет голос, если голосование не настроено", async () => {
    audienceVoteFindUnique.mockResolvedValue(null);
    await expect(castAudienceVoteBallot("div1", { role: "ANY", registrationId: "reg-l" })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет голос, если голосование не идёт", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "CLOSED" }));
    await expect(castAudienceVoteBallot("div1", { role: "ANY", registrationId: "reg-l" })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("GENERAL: роль ANY обязательна", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "RUNNING", mode: "GENERAL" }));
    await expect(castAudienceVoteBallot("div1", { role: "LEADER", registrationId: "reg-l" })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("BY_ROLE: роль ANY недопустима", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "RUNNING", mode: "BY_ROLE" }));
    await expect(castAudienceVoteBallot("div1", { role: "ANY", registrationId: "reg-l" })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("BY_ROLE: роль голоса обязана совпадать с ролью кандидата", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "RUNNING", mode: "BY_ROLE" }));
    registrationFindFirst.mockResolvedValue(candidateFollower); // роль FOLLOWER
    await expect(castAudienceVoteBallot("div1", { role: "LEADER", registrationId: "reg-f" })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет кандидата без check-in", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "RUNNING", mode: "GENERAL" }));
    registrationFindFirst.mockResolvedValue({ ...candidateLeader, checkIn: null });
    await expect(castAudienceVoteBallot("div1", { role: "ANY", registrationId: "reg-l" })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("успешный голос — апсерт по (audienceVoteId, voterUserId, role), не дублирует", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "RUNNING", mode: "GENERAL" }));
    await castAudienceVoteBallot("div1", { role: "ANY", registrationId: "reg-l" });
    expect(audienceVoteBallotUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { audienceVoteId_voterUserId_role: { audienceVoteId: "av1", voterUserId: "voter1", role: "ANY" } },
      })
    );
  });

  it("реактивный auto-close: истёкший таймер закрывает голосование и отклоняет новый голос", async () => {
    const expired = baseVote({ status: "RUNNING", mode: "GENERAL", closesAt: new Date(Date.now() - 1000) });
    audienceVoteFindUnique.mockResolvedValue(expired);
    txAudienceVoteFindUniqueOrThrow.mockResolvedValue({ ...expired, status: "CLOSED" });
    await expect(castAudienceVoteBallot("div1", { role: "ANY", registrationId: "reg-l" })).rejects.toBeInstanceOf(ValidationFailedError);
    // Реально закрыл голосование в БД, а не просто отклонил на клиенте.
    expect(txAudienceVoteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CLOSED" }) })
    );
    expect(txAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "audience_vote.auto_close", actorId: null }) })
    );
  });
});

describe("confirmAudienceVoteWinners() — только из CLOSED, без автовыбора", () => {
  it("отклоняет, если голосование ещё не закрыто", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "RUNNING" }));
    await expect(confirmAudienceVoteWinners("div1", { role: "ANY", registrationIds: ["reg-l"] })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет участника не из этой категории", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "CLOSED" }));
    await expect(confirmAudienceVoteWinners("div1", { role: "ANY", registrationIds: ["reg-unknown"] })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("заменяет предыдущее подтверждение для этой роли одной транзакцией", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "CLOSED" }));
    audienceVoteBallotGroupBy.mockResolvedValue([{ registrationId: "reg-l", _count: { _all: 3 } }]);
    await confirmAudienceVoteWinners("div1", { role: "ANY", registrationIds: ["reg-l"] });
    expect(txAudienceVoteWinnerDeleteMany).toHaveBeenCalledWith({ where: { audienceVoteId: "av1", role: "ANY" } });
    expect(txAudienceVoteWinnerCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ registrationId: "reg-l", voteCount: 3 })] })
    );
  });

  it("пустой список — снимает предыдущее подтверждение, ничего не создаёт", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "CLOSED" }));
    await confirmAudienceVoteWinners("div1", { role: "ANY", registrationIds: [] });
    expect(txAudienceVoteWinnerDeleteMany).toHaveBeenCalled();
    expect(txAudienceVoteWinnerCreateMany).not.toHaveBeenCalled();
  });
});

describe("publishAudienceVoteResults() / unpublishAudienceVoteResults()", () => {
  it("отклоняет публикацию без подтверждённого победителя", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "CLOSED" }));
    audienceVoteWinnerCount.mockResolvedValue(0);
    await expect(publishAudienceVoteResults("div1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("публикует, когда победитель подтверждён", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "CLOSED" }));
    audienceVoteWinnerCount.mockResolvedValue(1);
    await publishAudienceVoteResults("div1");
    expect(txAudienceVoteUpdateMany.mock.calls[0][0].data.status).toBe("PUBLISHED");
    expect(requirePermissionMock).toHaveBeenCalledWith("audience_vote:publish", "comp1");
  });

  it("unpublish требует причину", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "PUBLISHED" }));
    await expect(unpublishAudienceVoteResults("div1", "")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("unpublish с причиной возвращает в CLOSED", async () => {
    audienceVoteFindUniqueOrThrow.mockResolvedValue(baseVote({ status: "PUBLISHED" }));
    await unpublishAudienceVoteResults("div1", "Ошиблись с победителем");
    expect(txAudienceVoteUpdateMany.mock.calls[0][0].data.status).toBe("CLOSED");
    expect(txAudienceVoteUpdateMany.mock.calls[0][0].data.publishedAt).toBeNull();
  });
});

describe("getAudienceVotePublicView() — тираж голосов только после PUBLISHED", () => {
  it("не отдаёт тираж/победителей, пока не PUBLISHED", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "CLOSED" }));
    const view = await getAudienceVotePublicView("div1");
    expect(view?.results).toBeNull();
    expect(audienceVoteBallotGroupBy).not.toHaveBeenCalled();
  });

  it("отдаёт тираж и победителей после PUBLISHED", async () => {
    audienceVoteFindUnique.mockResolvedValue(baseVote({ status: "PUBLISHED" }));
    audienceVoteBallotGroupBy.mockResolvedValue([{ registrationId: "reg-l", _count: { _all: 5 } }]);
    audienceVoteWinnerFindMany.mockResolvedValue([{ role: "ANY", registrationId: "reg-l", voteCount: 5 }]);
    const view = await getAudienceVotePublicView("div1");
    expect(view?.results).toEqual({ tally: { "reg-l": 5 }, winners: [{ role: "ANY", registrationId: "reg-l", voteCount: 5 }] });
  });

  it("null, если голосование для категории не настроено", async () => {
    divisionFindUnique.mockResolvedValue(division);
    audienceVoteFindUnique.mockResolvedValue(null);
    expect(await getAudienceVotePublicView("div1")).toBeNull();
  });
});
