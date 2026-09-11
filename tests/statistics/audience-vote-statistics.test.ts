import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const audienceVoteWinnerFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { audienceVoteWinner: { findMany: (...a: unknown[]) => audienceVoteWinnerFindMany(...a) } },
}));

const { getAudienceAwardsForDancer, getAudienceAwardLeaderboard } = await import("@/server/statistics/audience-vote-statistics");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(["statistics:view"]), permissionsByCompetition: new Map() };

const row = {
  role: "ANY" as const,
  voteCount: 7,
  confirmedAt: new Date("2026-09-10T18:00:00Z"),
  registration: { dancerId: "dancer1", dancer: { displayName: "Иван Иванов" } },
  audienceVote: {
    publishedAt: new Date("2026-09-10T19:00:00Z"),
    division: { category: { name: "Дебютанты" }, competition: { id: "comp1", name: "Test Cup" } },
  },
};

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  audienceVoteWinnerFindMany.mockReset().mockResolvedValue([]);
});

describe("getAudienceAwardsForDancer() — только опубликованные", () => {
  it("пусто, если наград нет", async () => {
    expect(await getAudienceAwardsForDancer("dancer1")).toEqual([]);
  });

  it("фильтрует по dancerId и только publishedAt != null (запрос к БД)", async () => {
    audienceVoteWinnerFindMany.mockResolvedValue([row]);
    const result = await getAudienceAwardsForDancer("dancer1");
    expect(audienceVoteWinnerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { registration: { dancerId: "dancer1" }, audienceVote: { publishedAt: { not: null } } } })
    );
    expect(result).toEqual([
      {
        dancerId: "dancer1",
        displayName: "Иван Иванов",
        competitionId: "comp1",
        competitionName: "Test Cup",
        categoryName: "Дебютанты",
        role: "ANY",
        voteCount: 7,
        achievedAt: "2026-09-10T19:00:00.000Z",
      },
    ]);
  });
});

describe("getAudienceAwardLeaderboard() — только SUPER_ADMIN", () => {
  it("требует глобальное право statistics:view без привязки к соревнованию", async () => {
    audienceVoteWinnerFindMany.mockResolvedValue([row]);
    await getAudienceAwardLeaderboard();
    expect(requirePermissionMock).toHaveBeenCalledWith("statistics:view");
  });

  it("пробрасывает отказ RBAC (не SUPER_ADMIN)", async () => {
    requirePermissionMock.mockRejectedValue(new Error("denied"));
    await expect(getAudienceAwardLeaderboard()).rejects.toThrow("denied");
  });
});
