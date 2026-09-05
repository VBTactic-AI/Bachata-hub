import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const registrationGroupBy = vi.fn();
const registrationCount = vi.fn();
const checkInCount = vi.fn();
const divisionCount = vi.fn();
const roundCount = vi.fn();
const heatCount = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const competitionFindUniqueOrThrow = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      groupBy: (...a: unknown[]) => registrationGroupBy(...a),
      count: (...a: unknown[]) => registrationCount(...a),
    },
    checkIn: { count: (...a: unknown[]) => checkInCount(...a) },
    division: { count: (...a: unknown[]) => divisionCount(...a) },
    round: { count: (...a: unknown[]) => roundCount(...a) },
    heat: { count: (...a: unknown[]) => heatCount(...a) },
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    competition: { findUniqueOrThrow: (...a: unknown[]) => competitionFindUniqueOrThrow(...a) },
  },
}));

const { getCompetitionStatistics } = await import("@/server/statistics/competition-statistics");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  registrationGroupBy.mockReset().mockResolvedValue([
    { status: "REGISTERED", role: "LEADER", _count: { _all: 6 } },
    { status: "REGISTERED", role: "FOLLOWER", _count: { _all: 4 } },
    { status: "SCRATCHED", role: "LEADER", _count: { _all: 1 } },
    { status: "DISQUALIFIED", role: "FOLLOWER", _count: { _all: 1 } },
  ]);
  checkInCount.mockReset().mockResolvedValue(9);
  registrationCount.mockReset().mockResolvedValue(1); // кандидатов в "не пришли"
  divisionCount.mockReset().mockResolvedValue(2);
  roundCount.mockReset().mockImplementation(({ where }: { where: { type?: string } }) => (where.type === "TIE_BREAK" ? 1 : 5));
  heatCount.mockReset().mockResolvedValue(9);
  judgeAssignmentFindMany.mockReset().mockResolvedValue([{ judgeUserId: "j1" }, { judgeUserId: "j2" }]);
  competitionFindUniqueOrThrow.mockReset().mockResolvedValue({
    startAt: new Date("2026-09-05T10:00:00Z"),
    endAt: new Date("2026-09-05T13:30:00Z"),
    status: "LIVE", // фаза check-in закрыта — "не пришли" считаются реальными
  });
});

describe("getCompetitionStatistics()", () => {
  it("проверяет право statistics:view", async () => {
    await getCompetitionStatistics("comp1");
    expect(requirePermissionMock).toHaveBeenCalledWith("statistics:view", "comp1");
  });

  it("считает все счётчики по существующим таблицам", async () => {
    const stats = await getCompetitionStatistics("comp1");
    expect(stats).toEqual({
      registrationsCount: 10,
      leadersCount: 6,
      followersCount: 4,
      scratchedCount: 1,
      disqualifiedCount: 1,
      checkedInCount: 9,
      noShowCount: 1,
      judgesCount: 2,
      divisionsCount: 2,
      roundsCount: 5,
      tieBreakRoundsCount: 1,
      heatsCount: 9,
      durationMinutes: 210,
    });
  });

  it("длительность null, если даты соревнования не заданы", async () => {
    competitionFindUniqueOrThrow.mockResolvedValue({ startAt: null, endAt: null, status: "LIVE" });
    const stats = await getCompetitionStatistics("comp1");
    expect(stats.durationMinutes).toBeNull();
  });

  it("noShowCount — 0, пока фаза check-in ещё не закрыта (не путать с 'ещё не подошёл')", async () => {
    competitionFindUniqueOrThrow.mockResolvedValue({
      startAt: null,
      endAt: null,
      status: "CHECK_IN",
    });
    const stats = await getCompetitionStatistics("comp1");
    expect(stats.noShowCount).toBe(0);
  });
});
