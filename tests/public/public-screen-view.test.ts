import { describe, it, expect, vi, beforeEach } from "vitest";

const competitionFindUnique = vi.fn();
const heatFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    competition: { findUnique: (...a: unknown[]) => competitionFindUnique(...a) },
    heat: { findFirst: (...a: unknown[]) => heatFindFirst(...a) },
  },
}));

const { getPublicScreenView } = await import("@/server/public/public-screen-view");

beforeEach(() => {
  competitionFindUnique.mockReset().mockResolvedValue({ name: "Minsk Open", status: "LIVE" });
  heatFindFirst.mockReset().mockResolvedValue(null);
});

describe("getPublicScreenView()", () => {
  it("null для DRAFT-соревнования", async () => {
    competitionFindUnique.mockResolvedValue({ name: "X", status: "DRAFT" });
    expect(await getPublicScreenView("comp1")).toBeNull();
  });

  it("active=null, если ни один заезд сейчас не идёт (паркет свободен)", async () => {
    const view = await getPublicScreenView("comp1");
    expect(view!.active).toBeNull();
    expect(view!.competitionName).toBe("Minsk Open");
  });

  it("ищет заезд только в статусах RUNNING/PAUSED (эксклюзивность паркета, A4)", async () => {
    await getPublicScreenView("comp1");
    expect(heatFindFirst.mock.calls[0][0].where.status).toEqual({ in: ["RUNNING", "PAUSED"] });
  });

  it("собирает участников заезда по номерам и текущее состояние ротации", async () => {
    heatFindFirst.mockResolvedValue({
      id: "heat1",
      number: 2,
      status: "RUNNING",
      round: { type: null, stage: { name: "Финал" }, division: { category: { name: "Любители" } } },
      draws: [
        {
          participants: [
            { role: "LEADER", registration: { dancer: { displayName: "Иван" }, checkIn: { bibNumber: "3" } } },
            { role: "FOLLOWER", registration: { dancer: { displayName: "Мария" }, checkIn: { bibNumber: "7" } } },
          ],
        },
      ],
      rotation: {
        status: "RUNNING",
        mode: "TRACK_AUTO_SHIFT",
        intervalSec: 30,
        shiftMin: 1,
        shiftMax: 3,
        trackNumber: 2,
        trackName: "Song A",
        segmentStartedAt: new Date("2026-09-05T10:00:00Z"),
        pausedAt: null,
        awaitingShiftChoice: false,
        pendingShiftN: null,
      },
    });

    const view = await getPublicScreenView("comp1");
    expect(view!.active).toEqual({
      heatId: "heat1",
      heatNumber: 2,
      heatStatus: "RUNNING",
      divisionCategoryName: "Любители",
      roundLabel: "Финал",
      participants: [
        { bibNumber: "3", displayName: "Иван", role: "LEADER" },
        { bibNumber: "7", displayName: "Мария", role: "FOLLOWER" },
      ],
      rotation: {
        status: "RUNNING",
        mode: "TRACK_AUTO_SHIFT",
        intervalSec: 30,
        shiftMin: 1,
        shiftMax: 3,
        trackNumber: 2,
        trackName: "Song A",
        segmentStartedAt: "2026-09-05T10:00:00.000Z",
        pausedAt: null,
        awaitingShiftChoice: false,
        pendingShiftN: null,
      },
    });
  });
});
