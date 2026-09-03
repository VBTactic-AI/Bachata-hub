import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const heatFindUniqueOrThrow = vi.fn();
const txHeatFindFirst = vi.fn();
const txHeatUpdateMany = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  heat: { findFirst: txHeatFindFirst, updateMany: txHeatUpdateMany },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUniqueOrThrow: (...a: unknown[]) => heatFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { transitionHeat } = await import("@/server/state/heat-state");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  heatFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "heat1",
    status: "PENDING",
    statusVersion: 1,
    round: { division: { competitionId: "comp1" } },
  });
  txHeatFindFirst.mockReset().mockResolvedValue(null);
  txHeatUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  auditCreate.mockReset();
});

// На паркете одновременно может танцевать только один заезд — заезды одного
// соревнования не должны идти параллельно (docs/00_DECISIONS.md, A4).
describe("transitionHeat() — эксклюзивность паркета", () => {
  it("запускает заезд, если в соревновании больше никто не танцует", async () => {
    txHeatFindFirst.mockResolvedValue(null);

    await transitionHeat("heat1", "RUNNING");

    expect(txHeatUpdateMany).toHaveBeenCalledOnce();
  });

  it("отклоняет запуск, если другой заезд соревнования уже RUNNING", async () => {
    txHeatFindFirst.mockResolvedValue({ id: "heat2", number: 2, round: { name: "Полуфинал" } });

    await expect(transitionHeat("heat1", "RUNNING")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatUpdateMany).not.toHaveBeenCalled();
  });

  it("проверяет и RUNNING, и PAUSED, и исключает сам заезд из проверки", async () => {
    await transitionHeat("heat1", "RUNNING");

    expect(txHeatFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "heat1" },
          status: { in: ["RUNNING", "PAUSED"] },
          round: { division: { competitionId: "comp1" } },
        }),
      })
    );
  });

  it("не проверяет занятость паркета для переходов, отличных от RUNNING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      status: "RUNNING",
      statusVersion: 1,
      round: { division: { competitionId: "comp1" } },
    });

    await transitionHeat("heat1", "FINISHED");

    expect(txHeatFindFirst).not.toHaveBeenCalled();
    expect(txHeatUpdateMany).toHaveBeenCalledOnce();
  });
});
