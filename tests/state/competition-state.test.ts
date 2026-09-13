import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const competitionFindUniqueOrThrow = vi.fn();
const txCompetitionUpdateMany = vi.fn();
const txAuditCreate = vi.fn();
const txNotificationJobUpsert = vi.fn();

const fakeTx = {
  competition: { updateMany: (...a: unknown[]) => txCompetitionUpdateMany(...a) },
  auditLog: { create: (...a: unknown[]) => txAuditCreate(...a) },
  notificationJob: { upsert: (...a: unknown[]) => txNotificationJobUpsert(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    competition: { findUniqueOrThrow: (...a: unknown[]) => competitionFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { transitionCompetition } = await import("@/server/state/competition-state");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  competitionFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "comp1",
    name: "Belarus Bachata J&J",
    cityId: "city1",
    status: "DRAFT",
    statusVersion: 1,
  });
  txCompetitionUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txAuditCreate.mockReset();
  txNotificationJobUpsert.mockReset().mockResolvedValue({});
});

describe("transitionCompetition() — Notification & Subscription Engine (Phase 7)", () => {
  it("DRAFT -> REGISTRATION_OPEN: эмитит JNJ_REGISTRATION_OPENED в той же транзакции, что и сам переход", async () => {
    await transitionCompetition("comp1", "REGISTRATION_OPEN");

    expect(txNotificationJobUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: "JNJ_REGISTRATION_OPENED:comp1" },
        create: expect.objectContaining({
          eventType: "JNJ_REGISTRATION_OPENED",
          payload: { entityId: "comp1", competitionName: "Belarus Bachata J&J", cityId: "city1" },
        }),
      })
    );
  });

  it("другие переходы (напр. REGISTRATION_OPEN -> REGISTRATION_CLOSED) — emit НЕ вызывается", async () => {
    competitionFindUniqueOrThrow.mockResolvedValue({
      id: "comp1",
      name: "x",
      cityId: null,
      status: "REGISTRATION_OPEN",
      statusVersion: 1,
    });

    await transitionCompetition("comp1", "REGISTRATION_CLOSED");

    expect(txNotificationJobUpsert).not.toHaveBeenCalled();
  });

  it("гонка (updatedCount=0, кто-то опередил) — emit НЕ вызывается, транзакция откатывается ошибкой", async () => {
    txCompetitionUpdateMany.mockResolvedValue({ count: 0 });

    await expect(transitionCompetition("comp1", "REGISTRATION_OPEN")).rejects.toThrow();
    expect(txNotificationJobUpsert).not.toHaveBeenCalled();
  });
});
