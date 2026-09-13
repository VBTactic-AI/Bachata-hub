import { describe, it, expect, vi, beforeEach } from "vitest";

const notificationFindMany = vi.fn();
const notificationCount = vi.fn();
const notificationUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: (...a: unknown[]) => notificationFindMany(...a),
      count: (...a: unknown[]) => notificationCount(...a),
      updateMany: (...a: unknown[]) => notificationUpdateMany(...a),
    },
  },
}));

const { listNotifications, getUnreadCount, markAsRead, markAllAsRead, NotificationNotFoundError } = await import(
  "@/server/notifications/notification-center"
);

beforeEach(() => {
  notificationFindMany.mockReset();
  notificationCount.mockReset();
  notificationUpdateMany.mockReset();
});

describe("listNotifications()", () => {
  it("запрашивает limit+1 для определения hasMore, возвращает ровно limit строк", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}` }));
    notificationFindMany.mockResolvedValue(rows);

    const { notifications, nextCursor } = await listNotifications("u1", { limit: 3 });

    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, take: 4 })
    );
    expect(notifications).toHaveLength(3);
    expect(nextCursor).toBe("n2");
  });

  it("меньше строк, чем limit — nextCursor=null", async () => {
    notificationFindMany.mockResolvedValue([{ id: "n0" }]);

    const { notifications, nextCursor } = await listNotifications("u1", { limit: 20 });

    expect(notifications).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  it("unreadOnly=true — добавляет isRead:false в where", async () => {
    notificationFindMany.mockResolvedValue([]);

    await listNotifications("u1", { unreadOnly: true });

    expect(notificationFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", isRead: false } }));
  });

  it("cursor — передаётся как cursor+skip:1 (пагинация без сдвига по offset)", async () => {
    notificationFindMany.mockResolvedValue([]);

    await listNotifications("u1", { cursor: "n5" });

    expect(notificationFindMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: "n5" }, skip: 1 }));
  });

  it("limit > 100 — обрезается до 100", async () => {
    notificationFindMany.mockResolvedValue([]);

    await listNotifications("u1", { limit: 500 });

    expect(notificationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
  });
});

describe("getUnreadCount()", () => {
  it("считает только непрочитанные этого пользователя", async () => {
    notificationCount.mockResolvedValue(7);

    await expect(getUnreadCount("u1")).resolves.toBe(7);
    expect(notificationCount).toHaveBeenCalledWith({ where: { userId: "u1", isRead: false } });
  });
});

describe("markAsRead() — ownership прямо в запросе", () => {
  it("обновляет только свою запись", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 1 });

    await markAsRead("u1", "n1");

    expect(notificationUpdateMany).toHaveBeenCalledWith({
      where: { id: "n1", userId: "u1" },
      data: expect.objectContaining({ isRead: true }),
    });
  });

  it("чужое/несуществующее уведомление (count=0) — NotificationNotFoundError", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 0 });

    await expect(markAsRead("u1", "not-mine")).rejects.toThrow(NotificationNotFoundError);
  });
});

describe("markAllAsRead()", () => {
  it("обновляет все непрочитанные пользователя, возвращает число изменённых", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 5 });

    await expect(markAllAsRead("u1")).resolves.toBe(5);
    expect(notificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", isRead: false },
      data: expect.objectContaining({ isRead: true }),
    });
  });
});
