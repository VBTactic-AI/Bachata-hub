import { describe, it, expect, vi, beforeEach } from "vitest";

const userFindMany = vi.fn();
const subscriptionFindMany = vi.fn();
const broadcastCreate = vi.fn();
const broadcastFindUniqueOrThrow = vi.fn();
const broadcastFindMany = vi.fn();
const notificationCreateMany = vi.fn();
const notificationFindMany = vi.fn();
const notificationDeliveryCreateMany = vi.fn();
const notificationDeliveryFindMany = vi.fn();
const cityFindMany = vi.fn();
const countryFindMany = vi.fn();
const schoolFindMany = vi.fn();
const eventFindMany = vi.fn();
const teacherFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    subscription: { findMany: (...a: unknown[]) => subscriptionFindMany(...a) },
    broadcast: {
      create: (...a: unknown[]) => broadcastCreate(...a),
      findUniqueOrThrow: (...a: unknown[]) => broadcastFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => broadcastFindMany(...a),
    },
    notification: {
      createMany: (...a: unknown[]) => notificationCreateMany(...a),
      findMany: (...a: unknown[]) => notificationFindMany(...a),
    },
    notificationDelivery: {
      createMany: (...a: unknown[]) => notificationDeliveryCreateMany(...a),
      findMany: (...a: unknown[]) => notificationDeliveryFindMany(...a),
    },
    city: { findMany: (...a: unknown[]) => cityFindMany(...a) },
    country: { findMany: (...a: unknown[]) => countryFindMany(...a) },
    school: { findMany: (...a: unknown[]) => schoolFindMany(...a) },
    event: { findMany: (...a: unknown[]) => eventFindMany(...a) },
    teacher: { findMany: (...a: unknown[]) => teacherFindMany(...a) },
  },
}));

const targetExistsMock = vi.fn();
vi.mock("@/server/notifications/subscriptions", () => ({
  TARGET_EXISTS: new Proxy(
    {},
    {
      get: () => (targetId: string) => targetExistsMock(targetId),
    }
  ),
}));

const resolveTargetLabelsMock = vi.fn();
vi.mock("@/server/notifications/control-center", () => ({
  resolveTargetLabels: (...a: unknown[]) => resolveTargetLabelsMock(...a),
}));

const getPreferenceMapMock = vi.fn();
vi.mock("@/server/notifications/preferences", () => ({
  getPreferenceMap: (...a: unknown[]) => getPreferenceMapMock(...a),
}));

const retryDeliveryNowMock = vi.fn();
vi.mock("@/server/notifications/process-job", () => ({
  retryDeliveryNow: (...a: unknown[]) => retryDeliveryNowMock(...a),
}));

const {
  previewBroadcastAudience,
  sendBroadcast,
  listBroadcastTargetOptions,
  listBroadcastHistory,
  BroadcastTargetInvalidError,
  BroadcastValidationError,
} = await import("@/server/notifications/broadcast");

beforeEach(() => {
  userFindMany.mockReset();
  subscriptionFindMany.mockReset();
  broadcastCreate.mockReset();
  broadcastFindUniqueOrThrow.mockReset();
  broadcastFindMany.mockReset();
  notificationCreateMany.mockReset().mockResolvedValue({ count: 0 });
  notificationFindMany.mockReset().mockResolvedValue([]);
  notificationDeliveryCreateMany.mockReset().mockResolvedValue({ count: 0 });
  notificationDeliveryFindMany.mockReset().mockResolvedValue([]);
  cityFindMany.mockReset().mockResolvedValue([]);
  countryFindMany.mockReset().mockResolvedValue([]);
  schoolFindMany.mockReset().mockResolvedValue([]);
  eventFindMany.mockReset().mockResolvedValue([]);
  teacherFindMany.mockReset().mockResolvedValue([]);
  targetExistsMock.mockReset().mockResolvedValue(true);
  resolveTargetLabelsMock.mockReset().mockResolvedValue(new Map());
  getPreferenceMapMock.mockReset().mockResolvedValue(new Map());
  retryDeliveryNowMock.mockReset().mockResolvedValue(undefined);
});

describe("previewBroadcastAudience()", () => {
  it("ALL_USERS — считает всех пользователей, метка фиксированная", async () => {
    userFindMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }]);

    const result = await previewBroadcastAudience({ kind: "ALL_USERS" });

    expect(result).toEqual({ recipientCount: 3, label: "Все пользователи" });
    expect(subscriptionFindMany).not.toHaveBeenCalled();
  });

  it("SUBSCRIBERS — несуществующая цель — BroadcastTargetInvalidError, подписки не запрашиваются", async () => {
    targetExistsMock.mockResolvedValue(false);

    await expect(previewBroadcastAudience({ kind: "SUBSCRIBERS", type: "SCHOOL", targetId: "ghost" })).rejects.toThrow(
      BroadcastTargetInvalidError
    );
    expect(subscriptionFindMany).not.toHaveBeenCalled();
  });

  it("SUBSCRIBERS — существующая цель — считает уникальных подписчиков, резолвит имя цели", async () => {
    targetExistsMock.mockResolvedValue(true);
    subscriptionFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    resolveTargetLabelsMock.mockResolvedValue(new Map([["city1", "Минск"]]));

    const result = await previewBroadcastAudience({ kind: "SUBSCRIBERS", type: "CITY", targetId: "city1" });

    expect(result).toEqual({ recipientCount: 2, label: "Минск" });
    expect(subscriptionFindMany).toHaveBeenCalledWith({
      where: { type: "CITY", targetId: "city1" },
      select: { userId: true },
      distinct: ["userId"],
    });
  });
});

describe("sendBroadcast() — валидация содержимого", () => {
  it("пустой заголовок — BroadcastValidationError, broadcast не создаётся", async () => {
    await expect(
      sendBroadcast({ sentById: "admin1", audience: { kind: "ALL_USERS" }, title: "  ", body: "текст", clientRequestId: "req1" })
    ).rejects.toThrow(BroadcastValidationError);
    expect(broadcastCreate).not.toHaveBeenCalled();
  });

  it("пустой текст — BroadcastValidationError", async () => {
    await expect(
      sendBroadcast({ sentById: "admin1", audience: { kind: "ALL_USERS" }, title: "Заголовок", body: "", clientRequestId: "req1" })
    ).rejects.toThrow(BroadcastValidationError);
    expect(broadcastCreate).not.toHaveBeenCalled();
  });
});

describe("sendBroadcast() — успешная отправка", () => {
  it("ALL_USERS: создаёт Broadcast, Notification/NotificationDelivery по личным channelsEnabled, вызывает retryDeliveryNow на каждую доставку", async () => {
    userFindMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    broadcastCreate.mockResolvedValue({ id: "bc1" });
    notificationFindMany.mockResolvedValue([
      { id: "n1", userId: "u1" },
      { id: "n2", userId: "u2" },
    ]);
    getPreferenceMapMock.mockResolvedValue(
      new Map([
        ["u1", { channelsEnabled: ["IN_APP", "EMAIL"] }],
        ["u2", { channelsEnabled: ["IN_APP"] }],
      ])
    );
    notificationDeliveryFindMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }, { id: "d3" }]);

    const result = await sendBroadcast({
      sentById: "admin1",
      audience: { kind: "ALL_USERS" },
      title: "Важное объявление",
      body: "Текст рассылки",
      clientRequestId: "req-1",
    });

    expect(broadcastCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Важное объявление",
        body: "Текст рассылки",
        targetType: null,
        targetId: null,
        targetLabel: "Все пользователи",
        recipientCount: 2,
        sentById: "admin1",
        clientRequestId: "req-1",
      }),
    });
    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: "u1", type: "BROADCAST", broadcastId: "bc1", idempotencyKey: "BROADCAST:bc1:u1" }),
        expect.objectContaining({ userId: "u2", type: "BROADCAST", broadcastId: "bc1", idempotencyKey: "BROADCAST:bc1:u2" }),
      ],
      skipDuplicates: true,
    });
    expect(notificationDeliveryCreateMany).toHaveBeenCalledWith({
      data: [
        { notificationId: "n1", channel: "IN_APP" },
        { notificationId: "n1", channel: "EMAIL" },
        { notificationId: "n2", channel: "IN_APP" },
      ],
      skipDuplicates: true,
    });
    expect(retryDeliveryNowMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ broadcastId: "bc1", recipientCount: 2, alreadySent: false });
  });

  it("получателей 0 — Broadcast создаётся (recipientCount 0), но Notification/Delivery не создаются", async () => {
    targetExistsMock.mockResolvedValue(true);
    subscriptionFindMany.mockResolvedValue([]);
    resolveTargetLabelsMock.mockResolvedValue(new Map());
    broadcastCreate.mockResolvedValue({ id: "bc2" });

    const result = await sendBroadcast({
      sentById: "admin1",
      audience: { kind: "SUBSCRIBERS", type: "CITY", targetId: "ghost-city" },
      title: "T",
      body: "B",
      clientRequestId: "req-2",
    });

    expect(result).toEqual({ broadcastId: "bc2", recipientCount: 0, alreadySent: false });
    expect(notificationCreateMany).not.toHaveBeenCalled();
    expect(retryDeliveryNowMock).not.toHaveBeenCalled();
  });

  it("повторная отправка с тем же clientRequestId (P2002) — возвращает уже существующую рассылку, вторая не отправляется", async () => {
    userFindMany.mockResolvedValue([{ id: "u1" }]);
    const conflict = Object.assign(new Error("unique constraint"), { code: "P2002" });
    broadcastCreate.mockRejectedValue(conflict);
    broadcastFindUniqueOrThrow.mockResolvedValue({ id: "bc1", recipientCount: 1 });

    const result = await sendBroadcast({
      sentById: "admin1",
      audience: { kind: "ALL_USERS" },
      title: "T",
      body: "B",
      clientRequestId: "req-1",
    });

    expect(result).toEqual({ broadcastId: "bc1", recipientCount: 1, alreadySent: true });
    expect(notificationCreateMany).not.toHaveBeenCalled();
    expect(retryDeliveryNowMock).not.toHaveBeenCalled();
  });
});

describe("listBroadcastTargetOptions()", () => {
  it("EVENT_TYPE — из реестра форматов, без запроса к БД", async () => {
    const options = await listBroadcastTargetOptions("EVENT_TYPE");
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((o) => o.targetId === "MASTERCLASS")).toBe(true);
    expect(cityFindMany).not.toHaveBeenCalled();
  });

  it("CITY — короткий список активных городов", async () => {
    cityFindMany.mockResolvedValue([{ id: "c1", nameRu: "Минск" }]);
    const options = await listBroadcastTargetOptions("CITY");
    expect(options).toEqual([{ targetId: "c1", label: "Минск" }]);
    expect(cityFindMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { nameRu: "asc" } });
  });

  it("SCHOOL — короче 2 символов не ищет вовсе", async () => {
    const options = await listBroadcastTargetOptions("SCHOOL", "а");
    expect(options).toEqual([]);
    expect(schoolFindMany).not.toHaveBeenCalled();
  });

  it("SCHOOL — от 2 символов ищет по имени", async () => {
    schoolFindMany.mockResolvedValue([{ id: "s1", name: "Salsa Minsk" }]);
    const options = await listBroadcastTargetOptions("SCHOOL", "Salsa");
    expect(options).toEqual([{ targetId: "s1", label: "Salsa Minsk" }]);
  });
});

describe("listBroadcastHistory()", () => {
  it("мапит строки в плоский вид с email отправителя", async () => {
    broadcastFindMany.mockResolvedValue([
      {
        id: "bc1",
        title: "T",
        body: "B",
        targetType: "CITY",
        targetLabel: "Минск",
        recipientCount: 5,
        createdAt: new Date("2026-09-13T00:00:00Z"),
        sentBy: { email: "admin@bachata.by" },
      },
    ]);

    const rows = await listBroadcastHistory();

    expect(rows).toEqual([
      {
        id: "bc1",
        title: "T",
        body: "B",
        targetType: "CITY",
        targetLabel: "Минск",
        recipientCount: 5,
        sentByEmail: "admin@bachata.by",
        createdAt: new Date("2026-09-13T00:00:00Z"),
      },
    ]);
  });
});
