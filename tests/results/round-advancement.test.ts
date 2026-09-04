import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const isFinalStageInTxMock = vi.fn();
vi.mock("@/server/judging/advancement", () => ({ isFinalStageInTx: (...a: unknown[]) => isFinalStageInTxMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const txRoundUpdate = vi.fn();
const txAuditCreate = vi.fn();

const fakeTx = { round: { update: txRoundUpdate }, auditLog: { create: txAuditCreate } };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { publishRoundAdvancement, unpublishRoundAdvancement } = await import("@/server/results/round-advancement");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const baseRound = {
  id: "r1",
  status: "COMPLETED" as const,
  type: null as string | null,
  order: 2,
  advancementPublishedAt: null as Date | null,
  division: { id: "div1", competitionId: "comp1" },
};

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  isFinalStageInTxMock.mockReset().mockResolvedValue(false);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue(baseRound);
  txRoundUpdate.mockReset();
  txAuditCreate.mockReset();
});

describe("publishRoundAdvancement() — публикация списка прошедших раунда", () => {
  it("отклоняет для незавершённого раунда", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, status: "SCORING" });
    await expect(publishRoundAdvancement("r1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdate).not.toHaveBeenCalled();
  });

  it("отклоняет для перетанцовки — она уже отражена в списке родителя", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, type: "TIE_BREAK" });
    await expect(publishRoundAdvancement("r1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет для финального раунда — места публикуются вместе со всем соревнованием", async () => {
    isFinalStageInTxMock.mockResolvedValue(true);
    await expect(publishRoundAdvancement("r1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdate).not.toHaveBeenCalled();
  });

  it("публикует и пишет audit", async () => {
    await publishRoundAdvancement("r1");
    expect(txRoundUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({ advancementPublishedById: "u1" }),
    });
    expect(txAuditCreate.mock.calls[0][0].data.action).toBe("round.advancement_publish");
  });

  it("идемпотентно — уже опубликованный раунд повторно ничего не делает", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, advancementPublishedAt: new Date() });
    await publishRoundAdvancement("r1");
    expect(txRoundUpdate).not.toHaveBeenCalled();
  });

  it("проверяет право result:publish в рамках соревнования", async () => {
    await publishRoundAdvancement("r1");
    expect(requirePermissionMock).toHaveBeenCalledWith("result:publish", "comp1");
  });
});

describe("unpublishRoundAdvancement() — требует причину", () => {
  it("отклоняет без причины", async () => {
    await expect(unpublishRoundAdvancement("r1", "")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdate).not.toHaveBeenCalled();
  });

  it("снимает публикацию и пишет audit с причиной", async () => {
    await unpublishRoundAdvancement("r1", "Ошиблись в списке");
    expect(txRoundUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { advancementPublishedAt: null, advancementPublishedById: null },
    });
    expect(txAuditCreate.mock.calls[0][0].data.reason).toBe("Ошиблись в списке");
  });
});
