import { describe, it, expect, vi, beforeEach } from "vitest";

const subscriptionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findMany: (...a: unknown[]) => subscriptionFindMany(...a) } },
}));

const { resolveAudienceUserIds } = await import("@/server/notifications/audience-resolver");

beforeEach(() => {
  subscriptionFindMany.mockReset();
});

describe("resolveAudienceUserIds() — EVENT_PUBLISHED/UPDATED/CANCELLED", () => {
  it("матчит по EVENT+CITY+EVENT_TYPE, и по SCHOOL если событие школьное", async () => {
    subscriptionFindMany.mockResolvedValue([{ userId: "u1" }]);

    await resolveAudienceUserIds("EVENT_PUBLISHED", {
      entityId: "event1",
      eventSlug: "s",
      title: "t",
      date: "d",
      cityId: "city1",
      format: "MASTERCLASS",
      schoolId: "school1",
    });

    expect(subscriptionFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { type: "EVENT", targetId: "event1" },
          { type: "CITY", targetId: "city1" },
          { type: "EVENT_TYPE", targetId: "MASTERCLASS" },
          { type: "SCHOOL", targetId: "school1" },
        ],
      },
      select: { userId: true },
      distinct: ["userId"],
    });
  });

  it("без schoolId — SCHOOL-матч не добавляется", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    await resolveAudienceUserIds("EVENT_CANCELLED", {
      entityId: "event1",
      eventSlug: "s",
      title: "t",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
    });

    const where = subscriptionFindMany.mock.calls[0][0].where;
    expect(where.OR).not.toContainEqual(expect.objectContaining({ type: "SCHOOL" }));
  });

  it("дедупликация — через prisma `distinct`, не постфильтром в коде", async () => {
    subscriptionFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);

    const result = await resolveAudienceUserIds("EVENT_PUBLISHED", {
      entityId: "event1",
      eventSlug: "s",
      title: "t",
      date: "d",
      cityId: "city1",
      format: "PARTY",
    });

    expect(result).toEqual(["u1", "u2"]);
    expect(subscriptionFindMany.mock.calls[0][0].distinct).toEqual(["userId"]);
  });

  it("NOTIF-001 — createdById добавляет ORGANIZER-матч (событие с организатором без школы)", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    await resolveAudienceUserIds("EVENT_UPDATED", {
      entityId: "event1",
      eventSlug: "s",
      title: "t",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      createdById: "user1",
    });

    const where = subscriptionFindMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ type: "ORGANIZER", targetId: "user1" });
  });

  it("без createdById — ORGANIZER-матч не добавляется", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    await resolveAudienceUserIds("EVENT_CANCELLED", {
      entityId: "event1",
      eventSlug: "s",
      title: "t",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
    });

    const where = subscriptionFindMany.mock.calls[0][0].where;
    expect(where.OR).not.toContainEqual(expect.objectContaining({ type: "ORGANIZER" }));
  });
});

describe("resolveAudienceUserIds() — EVENT_REMINDER", () => {
  it("матчит так же, как EVENT_PUBLISHED/UPDATED/CANCELLED (тот же eventMatches)", async () => {
    subscriptionFindMany.mockResolvedValue([{ userId: "u1" }]);

    await resolveAudienceUserIds("EVENT_REMINDER", {
      entityId: "event1",
      eventSlug: "s",
      title: "t",
      date: "d",
      cityId: "city1",
      format: "MASTERCLASS",
      schoolId: "school1",
      createdById: "user1",
      hoursBefore: 24,
    });

    expect(subscriptionFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { type: "EVENT", targetId: "event1" },
          { type: "CITY", targetId: "city1" },
          { type: "EVENT_TYPE", targetId: "MASTERCLASS" },
          { type: "SCHOOL", targetId: "school1" },
          { type: "ORGANIZER", targetId: "user1" },
        ],
      },
      select: { userId: true },
      distinct: ["userId"],
    });
  });
});

describe("resolveAudienceUserIds() — JNJ_REGISTRATION_OPENED/RESULTS_PUBLISHED", () => {
  it("матчит по CITY и по EVENT_TYPE=CONTEST (JNJ — это Event.format=CONTEST)", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    await resolveAudienceUserIds("JNJ_REGISTRATION_OPENED", { entityId: "comp1", competitionName: "x", cityId: "city1" });

    expect(subscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ type: "CITY", targetId: "city1" }, { type: "EVENT_TYPE", targetId: "CONTEST" }] },
      })
    );
  });

  it("без cityId — только EVENT_TYPE=CONTEST", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    await resolveAudienceUserIds("JNJ_RESULTS_PUBLISHED", { entityId: "comp1", competitionName: "x", cityId: null });

    expect(subscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ type: "EVENT_TYPE", targetId: "CONTEST" }] } })
    );
  });
});

describe("resolveAudienceUserIds() — DIRECT-события (SCHOOL_VERIFIED/JNJ_REGISTERED)", () => {
  it("для DIRECT-события матчера нет — пустой список, запрос к БД не выполняется", async () => {
    const result = await resolveAudienceUserIds("SCHOOL_VERIFIED", {
      entityId: "school1",
      schoolSlug: "s",
      schoolName: "n",
      directUserId: "u1",
    });

    expect(result).toEqual([]);
    expect(subscriptionFindMany).not.toHaveBeenCalled();
  });
});
