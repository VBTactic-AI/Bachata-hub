import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const divisionCategoryFindUnique = vi.fn();
const roundStageCatalogFindMany = vi.fn();
const txDivisionUpdate = vi.fn();
const txDivisionDelete = vi.fn();
const txDivisionCreate = vi.fn();
const txDivisionStagePlanCreateMany = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  division: { update: txDivisionUpdate, delete: txDivisionDelete, create: txDivisionCreate },
  divisionStagePlan: { createMany: txDivisionStagePlanCreateMany },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a) },
    divisionCategory: { findUnique: (...a: unknown[]) => divisionCategoryFindUnique(...a) },
    roundStageCatalog: { findMany: (...a: unknown[]) => roundStageCatalogFindMany(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { updateDivisionSettings, deleteDivision, addDivision } = await import("@/server/competition/add-division");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const currentSettings = {
  competitionId: "comp1",
  heatCapacity: 10,
  rotationMode: "TRACK_AUTO_SHIFT" as const,
  rotationIntervalSec: 30,
  rotationShiftMin: 1,
  rotationShiftMax: 3,
};

const validInput = {
  heatCapacity: 12,
  rotationMode: "SEGMENT_MANUAL_SHIFT" as const,
  rotationIntervalSec: 30,
  rotationShiftMin: 1,
  rotationShiftMax: 2,
};

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue(currentSettings);
  divisionCategoryFindUnique.mockReset().mockResolvedValue({ id: "cat1", name: "Продвинутые", isActive: true });
  roundStageCatalogFindMany.mockReset().mockResolvedValue([]);
  txDivisionUpdate.mockReset();
  txDivisionDelete.mockReset();
  txDivisionCreate.mockReset().mockResolvedValue({ id: "div1", categoryId: "cat1" });
  txDivisionStagePlanCreateMany.mockReset();
  auditCreate.mockReset();
});

describe("updateDivisionSettings() — вместимость/ротация уже созданного дивизиона", () => {
  it("проверяет право competition:update в рамках соревнования этого дивизиона", async () => {
    await updateDivisionSettings("div1", validInput);
    expect(requirePermissionMock).toHaveBeenCalledWith("competition:update", "comp1");
  });

  it("сохраняет новые значения и пишет audit с before/after", async () => {
    await updateDivisionSettings("div1", validInput);

    expect(txDivisionUpdate).toHaveBeenCalledWith({ where: { id: "div1" }, data: validInput });
    expect(auditCreate).toHaveBeenCalledOnce();
    const entry = auditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("division.update_settings");
    expect(entry.before).toEqual(currentSettings);
    expect(entry.after).toEqual(validInput);
  });

  it("отклоняет, если минимум числа партнёров для смены больше максимума", async () => {
    await expect(
      updateDivisionSettings("div1", { ...validInput, rotationShiftMin: 5, rotationShiftMax: 2 })
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txDivisionUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteDivision() — только если ни одной регистрации нет", () => {
  beforeEach(() => {
    divisionFindUniqueOrThrow.mockResolvedValue({
      competitionId: "comp1",
      category: { name: "Продвинутые" },
      _count: { registrations: 0 },
    });
  });

  it("удаляет дивизион без регистраций и пишет audit до удаления", async () => {
    await deleteDivision("div1");

    expect(txDivisionDelete).toHaveBeenCalledWith({ where: { id: "div1" } });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate.mock.calls[0][0].data.action).toBe("division.delete");
  });

  it("отклоняет удаление, если на дивизион уже есть регистрации", async () => {
    divisionFindUniqueOrThrow.mockResolvedValue({
      competitionId: "comp1",
      category: { name: "Продвинутые" },
      _count: { registrations: 3 },
    });

    await expect(deleteDivision("div1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txDivisionDelete).not.toHaveBeenCalled();
  });
});

// План "сколько пар участвует в каждом этапе" (docs/00_DECISIONS.md, A14) —
// задаётся один раз при создании дивизиона.
describe("addDivision() — план по этапам", () => {
  it("не трогает divisionStagePlan вовсе, если план пустой (обратная совместимость)", async () => {
    await addDivision("comp1", { categoryId: "cat1", rules: {} } as never);

    expect(txDivisionStagePlanCreateMany).not.toHaveBeenCalled();
  });

  it("создаёт строки плана вместе с дивизионом, одной транзакцией", async () => {
    roundStageCatalogFindMany.mockResolvedValue([{ id: "st-qf", isActive: true }, { id: "st-final", isActive: true }]);

    await addDivision("comp1", {
      categoryId: "cat1",
      rules: {},
      stagePlan: [
        { stageId: "st-qf", participantCount: 8 },
        { stageId: "st-final", participantCount: 2 },
      ],
    } as never);

    expect(txDivisionStagePlanCreateMany).toHaveBeenCalledWith({
      data: [
        { divisionId: "div1", stageId: "st-qf", participantCount: 8 },
        { divisionId: "div1", stageId: "st-final", participantCount: 2 },
      ],
    });
  });

  it("отклоняет, если в плане есть неактивный или несуществующий этап", async () => {
    roundStageCatalogFindMany.mockResolvedValue([{ id: "st-qf", isActive: true }]); // st-final не вернулся — неактивен/не существует

    await expect(
      addDivision("comp1", {
        categoryId: "cat1",
        rules: {},
        stagePlan: [
          { stageId: "st-qf", participantCount: 8 },
          { stageId: "st-final", participantCount: 2 },
        ],
      } as never)
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txDivisionCreate).not.toHaveBeenCalled();
  });

  it("отклоняет дубликат этапа в плане", async () => {
    roundStageCatalogFindMany.mockResolvedValue([{ id: "st-qf", isActive: true }]);

    await expect(
      addDivision("comp1", {
        categoryId: "cat1",
        rules: {},
        stagePlan: [
          { stageId: "st-qf", participantCount: 8 },
          { stageId: "st-qf", participantCount: 6 },
        ],
      } as never)
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
