import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const competitionFindUniqueOrThrow = vi.fn();
const txCompetitionUpdate = vi.fn();
const txAuditCreate = vi.fn();
const fakeTx = { competition: { update: txCompetitionUpdate }, auditLog: { create: txAuditCreate } };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    competition: { findUniqueOrThrow: (...a: unknown[]) => competitionFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { updateCompetitionPublicInfo } = await import("@/server/competition/update-competition-public-info");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  competitionFindUniqueOrThrow.mockReset().mockResolvedValue({ rulesText: "old text", rulesUrl: "https://old.example", mediaUrl: null });
  txCompetitionUpdate.mockReset();
  txAuditCreate.mockReset();
});

describe("updateCompetitionPublicInfo()", () => {
  it("проверяет право competition:settings_update", async () => {
    await updateCompetitionPublicInfo("comp1", { rulesText: "x", rulesUrl: "", mediaUrl: "" });
    expect(requirePermissionMock).toHaveBeenCalledWith("competition:settings_update", "comp1");
  });

  it("сохраняет пустую строку как null (явная очистка)", async () => {
    await updateCompetitionPublicInfo("comp1", { rulesText: "", rulesUrl: "", mediaUrl: "" });
    expect(txCompetitionUpdate).toHaveBeenCalledWith({
      where: { id: "comp1" },
      data: { rulesText: null, rulesUrl: null, mediaUrl: null },
    });
  });

  it("сохраняет непустые значения как есть и пишет audit с before/after", async () => {
    await updateCompetitionPublicInfo("comp1", { rulesText: "Новые правила", rulesUrl: "", mediaUrl: "https://photos.example" });
    expect(txCompetitionUpdate).toHaveBeenCalledWith({
      where: { id: "comp1" },
      data: { rulesText: "Новые правила", rulesUrl: null, mediaUrl: "https://photos.example" },
    });
    const entry = txAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("competition.update_public_info");
    expect(entry.before).toEqual({ rulesText: "old text", rulesUrl: "https://old.example", mediaUrl: null });
  });
});
