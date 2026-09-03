import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

vi.mock("node:crypto", () => ({
  default: { randomBytes: () => Buffer.from("deadbeefcafebabe", "hex") },
}));

const requirePermissionMock = vi.fn();
const canMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
  can: (...a: unknown[]) => canMock(...a),
}));

const getActorMock = vi.fn();
vi.mock("@/server/rbac/actor", () => ({ getActor: (...a: unknown[]) => getActorMock(...a) }));

const heatFindUniqueOrThrow = vi.fn();
const heatRotationCreate = vi.fn();
const heatRotationFindUnique = vi.fn();
const txHeatRotationUpdateMany = vi.fn();
const txHeatRotationFindUnique = vi.fn();
const txCompetitionEventCreate = vi.fn();
const txAuditCreate = vi.fn();

const fakeTx = {
  heatRotation: { updateMany: txHeatRotationUpdateMany, findUnique: txHeatRotationFindUnique },
  competitionEvent: { create: txCompetitionEventCreate },
  auditLog: { create: txAuditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUniqueOrThrow: (...a: unknown[]) => heatFindUniqueOrThrow(...a) },
    heatRotation: { create: (...a: unknown[]) => heatRotationCreate(...a), findUnique: (...a: unknown[]) => heatRotationFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { startRotation, pauseRotation, resumeRotation, finishRotationInTx, nextTrack, manualShiftNow, stopSegment, chooseShift, getRotationView } =
  await import("@/server/rotation/rotation-engine");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function makeHeat(overrides: Record<string, unknown> = {}) {
  return {
    id: "heat1",
    roundId: "round1",
    status: "RUNNING",
    rotation: null as unknown,
    round: {
      rotationMode: null,
      rotationIntervalSec: null,
      rotationShiftMin: null,
      rotationShiftMax: null,
      division: {
        competitionId: "comp1",
        rotationMode: "TRACK_AUTO_SHIFT",
        rotationIntervalSec: 30,
        rotationShiftMin: 1,
        rotationShiftMax: 3,
      },
    },
    ...overrides,
  };
}

function makeRotation(overrides: Record<string, unknown> = {}) {
  return {
    id: "rot1",
    heatId: "heat1",
    status: "RUNNING",
    statusVersion: 2,
    mode: "TRACK_AUTO_SHIFT",
    intervalSec: 30,
    shiftMin: 1,
    shiftMax: 3,
    trackNumber: 1,
    trackName: null,
    segmentStartedAt: new Date("2026-01-01T00:00:00.000Z"),
    pausedAt: null,
    awaitingShiftChoice: false,
    pendingShiftN: null,
    pendingShiftSource: null,
    pendingShiftSeed: null,
    ...overrides,
  };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  canMock.mockReset().mockReturnValue(true);
  getActorMock.mockReset();
  heatFindUniqueOrThrow.mockReset();
  heatRotationCreate.mockReset();
  heatRotationFindUnique.mockReset();
  txHeatRotationUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txHeatRotationFindUnique.mockReset();
  txCompetitionEventCreate.mockReset();
  txAuditCreate.mockReset();
});

// Одна кнопка "Начать танцпол" на заезд — создаёт HeatRotation со снимком
// настроек дивизиона/раунда (docs/00_DECISIONS.md, A12) и переводит
// IDLE -> RUNNING.
describe("startRotation()", () => {
  it("отклоняет старт, если сам заезд ещё не запущен", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ status: "PENDING" }));

    await expect(startRotation("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(heatRotationCreate).not.toHaveBeenCalled();
  });

  it("создаёт строку со снимком настроек дивизиона и переводит IDLE -> RUNNING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat());
    heatRotationCreate.mockResolvedValue({
      id: "rot1",
      status: "IDLE",
      statusVersion: 1,
      mode: "TRACK_AUTO_SHIFT",
      intervalSec: 30,
      shiftMin: 1,
      shiftMax: 3,
    });

    await startRotation("heat1");

    expect(heatRotationCreate).toHaveBeenCalledWith({
      data: { heatId: "heat1", mode: "TRACK_AUTO_SHIFT", intervalSec: 30, shiftMin: 1, shiftMax: 3 },
    });
    expect(txHeatRotationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rot1", statusVersion: 1 },
        data: expect.objectContaining({ status: "RUNNING", trackNumber: 1 }),
      })
    );
    expect(txCompetitionEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "ROTATION_STARTED" }) })
    );
  });

  it("использует настройки раунда, если они переопределены, а не дивизиона (A7/A12)", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({
        round: {
          rotationMode: "SEGMENT_MANUAL_SHIFT",
          rotationIntervalSec: null,
          rotationShiftMin: 2,
          rotationShiftMax: 4,
          division: { competitionId: "comp1", rotationMode: "TRACK_AUTO_SHIFT", rotationIntervalSec: 30, rotationShiftMin: 1, rotationShiftMax: 3 },
        },
      })
    );
    heatRotationCreate.mockResolvedValue({ id: "rot1", status: "IDLE", statusVersion: 1 });

    await startRotation("heat1");

    expect(heatRotationCreate).toHaveBeenCalledWith({
      data: { heatId: "heat1", mode: "SEGMENT_MANUAL_SHIFT", intervalSec: 30, shiftMin: 2, shiftMax: 4 },
    });
  });

  it("отклоняет повторный старт уже начатой ротации", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ status: "RUNNING" }) }));

    await expect(startRotation("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatRotationUpdateMany).not.toHaveBeenCalled();
  });
});

describe("pauseRotation() / resumeRotation()", () => {
  it("переводит RUNNING -> PAUSED и фиксирует момент паузы", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation() }));

    await pauseRotation("heat1");

    expect(txHeatRotationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAUSED", pausedAt: expect.any(Date) }) })
    );
  });

  it("отклоняет резюме, если ротация не на паузе", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ status: "PAUSED", pausedAt: null }) }));

    await expect(resumeRotation("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("при резюме сдвигает segmentStartedAt на длительность паузы, а не сбрасывает его (CLAUDE.md §12 — сервер источник времени)", async () => {
    vi.useFakeTimers();
    try {
      const segStart = new Date("2026-01-01T00:00:00.000Z");
      const pausedAt = new Date("2026-01-01T00:00:10.000Z");
      vi.setSystemTime(new Date("2026-01-01T00:00:25.000Z")); // пауза длилась 15с
      heatFindUniqueOrThrow.mockResolvedValue(
        makeHeat({ rotation: makeRotation({ status: "PAUSED", segmentStartedAt: segStart, pausedAt }) })
      );

      await resumeRotation("heat1");

      const call = txHeatRotationUpdateMany.mock.calls[0][0];
      expect((call.data.segmentStartedAt as Date).toISOString()).toBe(new Date(segStart.getTime() + 15000).toISOString());
      expect(call.data.status).toBe("RUNNING");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("finishRotationInTx() — вызывается автоматически при завершении заезда", () => {
  it("ничего не делает, если ротацию не начинали (строки нет)", async () => {
    txHeatRotationFindUnique.mockResolvedValue(null);

    await finishRotationInTx(fakeTx as never, "heat1", actor);

    expect(txHeatRotationUpdateMany).not.toHaveBeenCalled();
  });

  it("ничего не делает для IDLE — ротацию не начинали, завершать нечего", async () => {
    txHeatRotationFindUnique.mockResolvedValue({ id: "rot1", status: "IDLE", statusVersion: 1 });

    await finishRotationInTx(fakeTx as never, "heat1", actor);

    expect(txHeatRotationUpdateMany).not.toHaveBeenCalled();
  });

  it("завершает RUNNING/PAUSED ротацию вместе с заездом", async () => {
    txHeatRotationFindUnique.mockResolvedValue({ id: "rot1", status: "RUNNING", statusVersion: 3 });

    await finishRotationInTx(fakeTx as never, "heat1", actor);

    expect(txHeatRotationUpdateMany).toHaveBeenCalledWith({
      where: { id: "rot1", statusVersion: 3 },
      data: { status: "FINISHED", statusVersion: { increment: 1 } },
    });
    expect(txAuditCreate).toHaveBeenCalledOnce();
  });
});

describe("nextTrack() — общее действие для обоих режимов", () => {
  it("увеличивает номер трека и запоминает название", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ trackNumber: 1 }) }));

    await nextTrack("heat1", "Bachata Rosa");

    expect(txHeatRotationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ trackNumber: 2, trackName: "Bachata Rosa" }) })
    );
  });

  it('блокирует новый трек в режиме "смена между отрезками", пока не выбрано число N', async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: true, pendingShiftN: null }) })
    );

    await expect(nextTrack("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatRotationUpdateMany).not.toHaveBeenCalled();
  });

  it("разрешает новый трек, если число N уже выбрано", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: true, pendingShiftN: 2 }) })
    );

    await nextTrack("heat1");

    expect(txHeatRotationUpdateMany).toHaveBeenCalled();
  });

  it("отклоняет, если ротация на паузе", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ status: "PAUSED" }) }));

    await expect(nextTrack("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("manualShiftNow() — досрочная смена в режиме TRACK_AUTO_SHIFT", () => {
  it("перезапускает интервал", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ mode: "TRACK_AUTO_SHIFT" }) }));

    await manualShiftNow("heat1");

    expect(txHeatRotationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ segmentStartedAt: expect.any(Date) }) }));
  });

  it("отклоняет в режиме SEGMENT_MANUAL_SHIFT", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT" }) }));

    await expect(manualShiftNow("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("stopSegment() — режим SEGMENT_MANUAL_SHIFT", () => {
  it("останавливает текущий отрезок", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT" }) }));

    await stopSegment("heat1");

    expect(txHeatRotationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ awaitingShiftChoice: true }) }));
  });

  it("отклоняет в режиме TRACK_AUTO_SHIFT", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ mode: "TRACK_AUTO_SHIFT" }) }));

    await expect(stopSegment("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('отклоняет повторный "Стоп"', async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: true }) }));

    await expect(stopSegment("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("chooseShift() — выбор N после Стоп", () => {
  it("случайное число попадает в диапазон и сохраняет seed (CLAUDE.md §6)", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: true, shiftMin: 1, shiftMax: 3 }) })
    );

    await chooseShift("heat1", { source: "RANDOM" });

    const call = txHeatRotationUpdateMany.mock.calls[0][0];
    expect(call.data.pendingShiftSource).toBe("RANDOM");
    expect(call.data.pendingShiftSeed).toBeTruthy();
    expect(call.data.pendingShiftN).toBeGreaterThanOrEqual(1);
    expect(call.data.pendingShiftN).toBeLessThanOrEqual(3);
  });

  it("ручной выбор вне диапазона отклоняется", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: true, shiftMin: 1, shiftMax: 3 }) })
    );

    await expect(chooseShift("heat1", { source: "MANUAL", n: 5 })).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatRotationUpdateMany).not.toHaveBeenCalled();
  });

  it("ручной выбор в диапазоне сохраняется без seed", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: true, shiftMin: 1, shiftMax: 3 }) })
    );

    await chooseShift("heat1", { source: "MANUAL", n: 2 });

    const call = txHeatRotationUpdateMany.mock.calls[0][0];
    expect(call.data.pendingShiftN).toBe(2);
    expect(call.data.pendingShiftSeed).toBeNull();
  });

  it('отклоняет выбор, если "Стоп" ещё не нажат', async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: false }) })
    );

    await expect(chooseShift("heat1", { source: "RANDOM" })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет повторный выбор, если число уже выбрано", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      makeHeat({ rotation: makeRotation({ mode: "SEGMENT_MANUAL_SHIFT", awaitingShiftChoice: true, pendingShiftN: 2 }) })
    );

    await expect(chooseShift("heat1", { source: "RANDOM" })).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("getRotationView() — опрос клиентом", () => {
  it("отклоняет, если пользователь не назначен на это соревнование", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat());
    getActorMock.mockResolvedValue({ userId: "u2", email: "x@y.by", globalPermissions: new Set(), permissionsByCompetition: new Map() });

    await expect(getRotationView("heat1")).rejects.toBeTruthy();
  });

  it("возвращает состояние для члена соревнования", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(makeHeat({ rotation: makeRotation() }));
    getActorMock.mockResolvedValue({
      userId: "u1",
      email: "a@b.by",
      globalPermissions: new Set(),
      permissionsByCompetition: new Map([["comp1", new Set(["timer:control"])]]),
    });

    const view = await getRotationView("heat1");

    expect(view.rotation?.status).toBe("RUNNING");
    expect(view.heatId).toBe("heat1");
  });
});
