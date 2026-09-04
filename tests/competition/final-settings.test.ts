import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const finalSessionFindFirst = vi.fn();
const finalSettingsFindUnique = vi.fn();
const finalCriterionFindMany = vi.fn();

const txFinalSettingsFindUnique = vi.fn();
const txFinalSettingsUpsert = vi.fn();
const txFinalCriterionDeleteMany = vi.fn();
const txFinalCriterionUpdate = vi.fn();
const txFinalCriterionCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  finalSettings: { findUnique: txFinalSettingsFindUnique, upsert: txFinalSettingsUpsert },
  finalCriterion: { deleteMany: txFinalCriterionDeleteMany, update: txFinalCriterionUpdate, create: txFinalCriterionCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a) },
    finalSession: { findFirst: (...a: unknown[]) => finalSessionFindFirst(...a) },
    finalSettings: { findUnique: (...a: unknown[]) => finalSettingsFindUnique(...a) },
    finalCriterion: { findMany: (...a: unknown[]) => finalCriterionFindMany(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { getFinalSettings, setFinalSettings, setFinalCriteria } = await import("@/server/competition/final-settings");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ competitionId: "comp1" });
  finalSessionFindFirst.mockReset().mockResolvedValue(null); // не начат — не заблокировано
  finalSettingsFindUnique.mockReset().mockResolvedValue(null);
  finalCriterionFindMany.mockReset().mockResolvedValue([]);
  txFinalSettingsFindUnique.mockReset().mockResolvedValue(null);
  txFinalSettingsUpsert.mockReset().mockResolvedValue({ id: "fs1", format: "NORMAL", tracksCount: 1, partnerChangeEnabled: false, config: {} });
  txFinalCriterionDeleteMany.mockReset();
  txFinalCriterionUpdate.mockReset();
  txFinalCriterionCreate.mockReset();
  auditCreate.mockReset();
});

describe("getFinalSettings()", () => {
  it("возвращает значения по умолчанию, если настройки ещё не заводились", async () => {
    const result = await getFinalSettings("div1");
    expect(result.format).toBe("NORMAL");
    expect(result.locked).toBe(false);
    expect(result.criteria).toEqual([]);
  });

  it("locked=true, если для финала этого дивизиона уже создана FinalSession", async () => {
    finalSessionFindFirst.mockResolvedValue({ id: "fs1" });
    const result = await getFinalSettings("div1");
    expect(result.locked).toBe(true);
  });
});

describe("setFinalSettings()", () => {
  it("отклоняет изменение, если финал уже начат (FinalSession существует)", async () => {
    finalSessionFindFirst.mockResolvedValue({ id: "fs1" });
    await expect(setFinalSettings("div1", { format: "NORMAL", tracksCount: 1, partnerChangeEnabled: false, config: {} })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
  });

  it("сохраняет формат/настройки с аудитом, пока не заблокировано", async () => {
    await setFinalSettings("div1", { format: "JUDGES_DANCE", tracksCount: 3, partnerChangeEnabled: true, config: {} });
    expect(txFinalSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { divisionId: "div1" }, create: expect.objectContaining({ format: "JUDGES_DANCE", tracksCount: 3 }) })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});

const criterion = (id: string | undefined, priority: number) => ({ id, name: `Критерий ${priority}`, priority, minScore: 0, maxScore: 10, step: 1 });

describe("setFinalCriteria() — валидация приоритетов (промт пользователя, п.50)", () => {
  it("отклоняет неуникальные/непоследовательные приоритеты", async () => {
    await expect(setFinalCriteria("div1", { criteria: [criterion(undefined, 1), criterion(undefined, 1)] })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
    await expect(setFinalCriteria("div1", { criteria: [criterion(undefined, 1), criterion(undefined, 3)] })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
  });

  it("принимает приоритеты 1..N без пропусков", async () => {
    await expect(
      setFinalCriteria("div1", { criteria: [criterion(undefined, 1), criterion(undefined, 2), criterion(undefined, 3)] })
    ).resolves.toBeUndefined();
    expect(txFinalCriterionCreate).toHaveBeenCalledTimes(3);
  });

  it("отклоняет изменение, если финал уже начат", async () => {
    finalSessionFindFirst.mockResolvedValue({ id: "fs1" });
    await expect(setFinalCriteria("div1", { criteria: [criterion(undefined, 1)] })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет id критерия, которого нет в этом дивизионе", async () => {
    await expect(setFinalCriteria("div1", { criteria: [criterion("unknown-id", 1)] })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("реконсилиация: удаляет отсутствующие в списке, обновляет существующие через двухпроходный сброс приоритета", async () => {
    // Существующие: critA(priority=1), critB(priority=2), critC(priority=3).
    // Новый список: поменять местами A/B (A->2, B->1), удалить C, добавить D(3).
    const existing = [
      { id: "critA", name: "A", priority: 1, minScore: 0, maxScore: 10, step: 1, sortOrder: 0, isActive: true },
      { id: "critB", name: "B", priority: 2, minScore: 0, maxScore: 10, step: 1, sortOrder: 1, isActive: true },
      { id: "critC", name: "C", priority: 3, minScore: 0, maxScore: 10, step: 1, sortOrder: 2, isActive: true },
    ];
    finalCriterionFindMany.mockResolvedValue(existing);

    await setFinalCriteria("div1", {
      criteria: [
        { id: "critB", name: "B", priority: 1, minScore: 0, maxScore: 10, step: 1 },
        { id: "critA", name: "A", priority: 2, minScore: 0, maxScore: 10, step: 1 },
        criterion(undefined, 3),
      ],
    });

    expect(txFinalCriterionDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["critC"] } } });
    // Сброс в отрицательные значения перед финальным присвоением — не должно
    // столкнуться с @@unique([divisionId, priority]) при перестановке.
    const negativeUpdates = txFinalCriterionUpdate.mock.calls.filter((c) => c[0].data.priority < 0);
    expect(negativeUpdates.length).toBe(2);
    expect(txFinalCriterionCreate).toHaveBeenCalledTimes(1);
  });
});
