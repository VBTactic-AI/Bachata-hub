import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

// Заезд завершается вместе со своей ротацией партнёров одной транзакцией
// (Этап 6) — сама логика ротации протестирована отдельно
// (tests/competition/rotation-engine.test.ts), здесь только проверяем, что
// хук действительно вызывается.
const finishRotationInTxMock = vi.fn();
vi.mock("@/server/rotation/rotation-engine", () => ({ finishRotationInTx: (...a: unknown[]) => finishRotationInTxMock(...a) }));

// Этап 7/8: если это был последний незавершённый заход раунда, раунд сам
// идёт дальше (round-state.ts) — протестировано отдельно
// (tests/state/round-state.test.ts), здесь только проверяем вызов хука.
const autoAdvanceRoundMock = vi.fn();
vi.mock("@/server/state/round-state", () => ({
  autoAdvanceRoundIfAllHeatsFinishedInTx: (...a: unknown[]) => autoAdvanceRoundMock(...a),
}));

const heatFindUniqueOrThrow = vi.fn();
const txHeatFindFirst = vi.fn();
const txHeatUpdateMany = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  heat: { findFirst: txHeatFindFirst, updateMany: txHeatUpdateMany },
  auditLog: { create: auditCreate },
  // FLOW-002: guard() теперь берёт pg_advisory_xact_lock перед проверкой
  // "не занят ли паркет" — мок просто должен существовать как функция.
  $executeRaw: vi.fn(),
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
    round: { status: "RUNNING", division: { competitionId: "comp1" } },
  });
  txHeatFindFirst.mockReset().mockResolvedValue(null);
  txHeatUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  auditCreate.mockReset();
  finishRotationInTxMock.mockReset();
  autoAdvanceRoundMock.mockReset();
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
    txHeatFindFirst.mockResolvedValue({ id: "heat2", number: 2, round: { type: null, stage: { name: "Полуфинал" } } });

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

// Заезд не может стартовать раньше собственного раунда — иначе он запустится
// "пустым", без единого вызванного жеребьёвкой участника (найдено на реальном
// тесте: заезд был запущен, пока раунд ещё был в DRAFT).
describe("transitionHeat() — заезд не раньше своего раунда", () => {
  it("отклоняет запуск заезда, если раунд ещё не в статусе RUNNING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      status: "PENDING",
      statusVersion: 1,
      round: { status: "DRAWING", division: { competitionId: "comp1" } },
    });

    await expect(transitionHeat("heat1", "RUNNING")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatUpdateMany).not.toHaveBeenCalled();
  });

  it("разрешает запуск, если раунд уже RUNNING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      status: "PENDING",
      statusVersion: 1,
      round: { status: "RUNNING", division: { competitionId: "comp1" } },
    });

    await transitionHeat("heat1", "RUNNING");

    expect(txHeatUpdateMany).toHaveBeenCalledOnce();
  });
});

// Заходы одного раунда должны идти строго по порядку номеров — нельзя
// запустить заход №3, пока заход №1 или №2 ещё не завершён, даже если они
// ещё не начинались вовсе (тот же принцип, что A8 для раундов внутри
// дивизиона, только уровнем ниже — заходы внутри раунда).
describe("transitionHeat() — заходы одного раунда идут по очереди", () => {
  beforeEach(() => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      number: 3,
      roundId: "round1",
      status: "PENDING",
      statusVersion: 1,
      round: { status: "RUNNING", division: { competitionId: "comp1" } },
    });
  });

  it("отклоняет запуск, если более ранний заход этого раунда ещё не завершён", async () => {
    txHeatFindFirst.mockResolvedValueOnce({ number: 2 });

    await expect(transitionHeat("heat1", "RUNNING")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatUpdateMany).not.toHaveBeenCalled();
  });

  it("проверяет заходы именно этого раунда, с меньшим номером и статусом не FINISHED", async () => {
    await transitionHeat("heat1", "RUNNING");

    expect(txHeatFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { roundId: "round1", number: { lt: 3 }, status: { not: "FINISHED" } },
      })
    );
  });

  it("разрешает запуск, если более ранних незавершённых заходов в этом раунде нет", async () => {
    await transitionHeat("heat1", "RUNNING");

    expect(txHeatUpdateMany).toHaveBeenCalledOnce();
  });
});

// Живой танцпол (Этап 6): ротация партнёров завершается вместе с заездом,
// одной транзакцией, без отдельной кнопки.
describe("transitionHeat() — завершение ротации партнёров вместе с заездом", () => {
  it("вызывает finishRotationInTx при переходе в FINISHED", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      status: "RUNNING",
      statusVersion: 1,
      round: { status: "RUNNING", division: { competitionId: "comp1" } },
    });

    await transitionHeat("heat1", "FINISHED");

    expect(finishRotationInTxMock).toHaveBeenCalledWith(fakeTx, "heat1", actor);
  });

  it("проверяет, не был ли этот заход последним незавершённым в раунде, при переходе в FINISHED", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "RUNNING",
      statusVersion: 1,
      round: { status: "RUNNING", division: { competitionId: "comp1" } },
    });

    await transitionHeat("heat1", "FINISHED");

    expect(autoAdvanceRoundMock).toHaveBeenCalledWith(fakeTx, "round1", actor);
  });

  it("не вызывает finishRotationInTx для переходов, отличных от FINISHED", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      status: "PENDING",
      statusVersion: 1,
      round: { status: "RUNNING", division: { competitionId: "comp1" } },
    });

    await transitionHeat("heat1", "RUNNING");

    expect(finishRotationInTxMock).not.toHaveBeenCalled();
  });
});
