import { describe, it, expect, vi, beforeEach } from "vitest";

const eventFindUnique = vi.fn();
const schoolFindUnique = vi.fn();
const cityFindUnique = vi.fn();
const countryFindUnique = vi.fn();
const teacherFindUnique = vi.fn();
const userFindUnique = vi.fn();
const subscriptionUpsert = vi.fn();
const subscriptionDeleteMany = vi.fn();
const subscriptionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    city: { findUnique: (...a: unknown[]) => cityFindUnique(...a) },
    country: { findUnique: (...a: unknown[]) => countryFindUnique(...a) },
    teacher: { findUnique: (...a: unknown[]) => teacherFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    subscription: {
      upsert: (...a: unknown[]) => subscriptionUpsert(...a),
      deleteMany: (...a: unknown[]) => subscriptionDeleteMany(...a),
      findMany: (...a: unknown[]) => subscriptionFindMany(...a),
    },
  },
}));

const {
  subscribe,
  unsubscribe,
  listSubscriptions,
  getSubscribedTargetIds,
  getSubscriptionIdMap,
  SubscriptionTargetInvalidError,
  SubscriptionNotFoundError,
} = await import("@/server/notifications/subscriptions");

beforeEach(() => {
  eventFindUnique.mockReset();
  schoolFindUnique.mockReset();
  cityFindUnique.mockReset();
  countryFindUnique.mockReset();
  teacherFindUnique.mockReset();
  userFindUnique.mockReset();
  subscriptionUpsert.mockReset();
  subscriptionDeleteMany.mockReset();
  subscriptionFindMany.mockReset();
});

describe("subscribe() — валидация цели по типу (Registry, не if/else)", () => {
  it("SCHOOL: существующая школа — подписка создаётся", async () => {
    schoolFindUnique.mockResolvedValue({ id: "school1" });
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await subscribe("user1", "SCHOOL", "school1");

    expect(schoolFindUnique).toHaveBeenCalledWith({ where: { id: "school1" }, select: { id: true } });
    expect(subscriptionUpsert).toHaveBeenCalledWith({
      where: { userId_type_targetId: { userId: "user1", type: "SCHOOL", targetId: "school1" } },
      create: { userId: "user1", type: "SCHOOL", targetId: "school1", source: "USER" },
      update: {},
    });
  });

  it("SCHOOL: несуществующая школа — SubscriptionTargetInvalidError('target_not_found'), upsert не вызывается", async () => {
    schoolFindUnique.mockResolvedValue(null);

    await expect(subscribe("user1", "SCHOOL", "ghost")).rejects.toThrow(SubscriptionTargetInvalidError);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("CITY: проверяет через prisma.city, не через school", async () => {
    cityFindUnique.mockResolvedValue({ id: "city1" });
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await subscribe("user1", "CITY", "city1");

    expect(cityFindUnique).toHaveBeenCalledWith({ where: { id: "city1" }, select: { id: true } });
    expect(schoolFindUnique).not.toHaveBeenCalled();
  });

  it("COUNTRY: проверяет через prisma.country", async () => {
    countryFindUnique.mockResolvedValue({ id: "country1" });
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await subscribe("user1", "COUNTRY", "country1");

    expect(countryFindUnique).toHaveBeenCalledWith({ where: { id: "country1" }, select: { id: true } });
  });

  it("EVENT: проверяет через prisma.event", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1" });
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await subscribe("user1", "EVENT", "event1");

    expect(eventFindUnique).toHaveBeenCalledWith({ where: { id: "event1" }, select: { id: true } });
  });

  it("INSTRUCTOR: проверяет через prisma.teacher", async () => {
    teacherFindUnique.mockResolvedValue({ id: "teacher1" });
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await subscribe("user1", "INSTRUCTOR", "teacher1");

    expect(teacherFindUnique).toHaveBeenCalledWith({ where: { id: "teacher1" }, select: { id: true } });
  });

  it("EVENT_TYPE: валидный код EventFormat — без единого запроса к БД", async () => {
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await subscribe("user1", "EVENT_TYPE", "MASTERCLASS");

    expect(eventFindUnique).not.toHaveBeenCalled();
    expect(schoolFindUnique).not.toHaveBeenCalled();
    expect(subscriptionUpsert).toHaveBeenCalled();
  });

  it("EVENT_TYPE: невалидный код — SubscriptionTargetInvalidError, upsert не вызывается", async () => {
    await expect(subscribe("user1", "EVENT_TYPE", "NOT_A_FORMAT")).rejects.toThrow(SubscriptionTargetInvalidError);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("ORGANIZER: пользователь с ролью, дающей canCreateEvents (ORGANIZER) — подписка создаётся", async () => {
    userFindUnique.mockResolvedValue({ id: "user1", role: "ORGANIZER", isVerifiedEventOrganizer: false });
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await subscribe("user2", "ORGANIZER", "user1");

    expect(userFindUnique).toHaveBeenCalledWith({ where: { id: "user1" } });
    expect(subscriptionUpsert).toHaveBeenCalledWith({
      where: { userId_type_targetId: { userId: "user2", type: "ORGANIZER", targetId: "user1" } },
      create: { userId: "user2", type: "ORGANIZER", targetId: "user1", source: "USER" },
      update: {},
    });
  });

  it("ORGANIZER: обычный пользователь без прав на создание событий — SubscriptionTargetInvalidError, upsert не вызывается", async () => {
    userFindUnique.mockResolvedValue({ id: "user1", role: "DANCER", isVerifiedEventOrganizer: false });

    await expect(subscribe("user2", "ORGANIZER", "user1")).rejects.toThrow(SubscriptionTargetInvalidError);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("ORGANIZER: несуществующий пользователь — SubscriptionTargetInvalidError", async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(subscribe("user2", "ORGANIZER", "ghost")).rejects.toThrow(SubscriptionTargetInvalidError);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("пустой targetId — SubscriptionTargetInvalidError('invalid_target') без запроса к БД", async () => {
    await expect(subscribe("user1", "SCHOOL", "")).rejects.toThrow(SubscriptionTargetInvalidError);
    expect(schoolFindUnique).not.toHaveBeenCalled();
  });

  it("повторная подписка на то же самое — идемпотентно (upsert, не create), не ошибка", async () => {
    schoolFindUnique.mockResolvedValue({ id: "school1" });
    subscriptionUpsert.mockResolvedValue({ id: "sub1" });

    await expect(subscribe("user1", "SCHOOL", "school1")).resolves.toBeDefined();
    expect(subscriptionUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });
});

describe("unsubscribe() — ownership проверяется прямо в запросе на удаление", () => {
  it("удаляет только свою подписку — userId участвует в where", async () => {
    subscriptionDeleteMany.mockResolvedValue({ count: 1 });

    await unsubscribe("user1", "sub1");

    expect(subscriptionDeleteMany).toHaveBeenCalledWith({ where: { id: "sub1", userId: "user1" } });
  });

  it("чужая или несуществующая подписка (count=0) — SubscriptionNotFoundError", async () => {
    subscriptionDeleteMany.mockResolvedValue({ count: 0 });

    await expect(unsubscribe("user1", "not-mine")).rejects.toThrow(SubscriptionNotFoundError);
  });
});

describe("listSubscriptions()", () => {
  it("без type — фильтр по type не передаётся в where", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    await listSubscriptions("user1");

    expect(subscriptionFindMany).toHaveBeenCalledWith({
      where: { userId: "user1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("с type — фильтрует по конкретному типу", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    await listSubscriptions("user1", "CITY");

    expect(subscriptionFindMany).toHaveBeenCalledWith({
      where: { userId: "user1", type: "CITY" },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getSubscribedTargetIds() — батч для follow-кнопок в списках", () => {
  it("пустой список targetIds — пустой Set без запроса к БД", async () => {
    const result = await getSubscribedTargetIds("user1", "SCHOOL", []);

    expect(result).toEqual(new Set());
    expect(subscriptionFindMany).not.toHaveBeenCalled();
  });

  it("возвращает Set из найденных targetId, а не весь объект подписки", async () => {
    subscriptionFindMany.mockResolvedValue([{ targetId: "school1" }, { targetId: "school3" }]);

    const result = await getSubscribedTargetIds("user1", "SCHOOL", ["school1", "school2", "school3"]);

    expect(result).toEqual(new Set(["school1", "school3"]));
    expect(subscriptionFindMany).toHaveBeenCalledWith({
      where: { userId: "user1", type: "SCHOOL", targetId: { in: ["school1", "school2", "school3"] } },
      select: { targetId: true },
    });
  });
});

describe("getSubscriptionIdMap() — батч id подписки (не только факт наличия) для FollowButton в списках", () => {
  it("пустой список targetIds — пустая Map без запроса к БД", async () => {
    const result = await getSubscriptionIdMap("user1", "EVENT", []);

    expect(result).toEqual(new Map());
    expect(subscriptionFindMany).not.toHaveBeenCalled();
  });

  it("возвращает Map targetId -> id строки подписки, а не только факт наличия", async () => {
    subscriptionFindMany.mockResolvedValue([
      { id: "sub1", targetId: "event1" },
      { id: "sub3", targetId: "event3" },
    ]);

    const result = await getSubscriptionIdMap("user1", "EVENT", ["event1", "event2", "event3"]);

    expect(result).toEqual(
      new Map([
        ["event1", "sub1"],
        ["event3", "sub3"],
      ])
    );
    expect(subscriptionFindMany).toHaveBeenCalledWith({
      where: { userId: "user1", type: "EVENT", targetId: { in: ["event1", "event2", "event3"] } },
      select: { id: true, targetId: true },
    });
  });
});
