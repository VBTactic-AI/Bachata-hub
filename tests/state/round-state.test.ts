import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

// Этап 7/8: расчёт результата после авто-перехода в SCORING протестирован
// отдельно (tests/judging/advancement.test.ts), здесь только вызов хука.
const maybeCalculateOnEntryMock = vi.fn();
vi.mock("@/server/judging/advancement", () => ({
  maybeCalculateOnEntryInTx: (...a: unknown[]) => maybeCalculateOnEntryMock(...a),
}));

const roundFindUniqueOrThrow = vi.fn();
const txRoundFindFirst = vi.fn();
const txRoundFindUniqueOrThrow = vi.fn();
const txRoundUpdateMany = vi.fn();
const txHeatFindFirst = vi.fn();
const txHeatFindMany = vi.fn();
const txHeatCount = vi.fn();
const txRegistrationFindMany = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  round: { findFirst: txRoundFindFirst, findUniqueOrThrow: txRoundFindUniqueOrThrow, updateMany: txRoundUpdateMany },
  heat: { findFirst: txHeatFindFirst, findMany: txHeatFindMany, count: txHeatCount },
  registration: { findMany: txRegistrationFindMany },
  auditLog: { create: auditCreate },
  // FLOW-002: guard() теперь берёт pg_advisory_xact_lock перед проверкой
  // "раунды по очереди" — мок не бьётся с реальной БД, просто должен
  // существовать как функция.
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { transitionRound, autoAdvanceRoundIfAllHeatsFinishedInTx } = await import("@/server/state/round-state");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "round2",
    order: 2,
    status: "DRAW_LOCKED",
    statusVersion: 1,
    division: { id: "div1", competitionId: "comp1" },
  });
  txRoundFindFirst.mockReset().mockResolvedValue(null);
  txRoundFindUniqueOrThrow.mockReset();
  txRoundUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txHeatFindFirst.mockReset().mockResolvedValue(null);
  txHeatFindMany.mockReset().mockResolvedValue([]);
  txHeatCount.mockReset().mockResolvedValue(0);
  txRegistrationFindMany.mockReset().mockResolvedValue([]);
  auditCreate.mockReset();
  maybeCalculateOnEntryMock.mockReset();
});

describe("transitionRound() — DRAWING только через отдельное действие", () => {
  beforeEach(() => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      order: 1,
      status: "READY",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });
  });

  it("отклоняет прямой переход в DRAWING без extraData (без выбора порядка вызова)", async () => {
    await expect(transitionRound("round1", "DRAWING")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("проверяет право draw:generate для перехода в DRAWING", async () => {
    await transitionRound("round1", "DRAWING", { extraData: { config: { drawCallOrder: "RANDOM" } } });
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:generate", "comp1");
  });

  it("разрешает переход в DRAWING с extraData и вызывает onApplied той же транзакцией", async () => {
    const onApplied = vi.fn();

    await transitionRound("round1", "DRAWING", {
      extraData: { config: { drawCallOrder: "SEQUENTIAL" } },
      onApplied,
    });

    expect(txRoundUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ config: { drawCallOrder: "SEQUENTIAL" } }) })
    );
    expect(onApplied).toHaveBeenCalledWith(fakeTx, actor);
  });

  it("не вызывает onApplied, если обновление проиграло гонку (updatedCount = 0)", async () => {
    txRoundUpdateMany.mockResolvedValue({ count: 0 });
    const onApplied = vi.fn();

    await expect(
      transitionRound("round1", "DRAWING", { extraData: { config: {} }, onApplied })
    ).rejects.toThrow();
    expect(onApplied).not.toHaveBeenCalled();
  });
});

describe("transitionRound() — DRAW_LOCKED требует список у каждого заезда", () => {
  beforeEach(() => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      order: 1,
      status: "DRAWING",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });
  });

  it("проверяет право draw:lock", async () => {
    await transitionRound("round1", "DRAW_LOCKED");
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:lock", "comp1");
  });

  it("отклоняет, если у какого-то заезда раунда нет ни одной жеребьёвки", async () => {
    txHeatFindFirst.mockResolvedValue({ id: "heat3", number: 3 });

    await expect(transitionRound("round1", "DRAW_LOCKED")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("разрешает, если у всех заездов раунда есть жеребьёвка", async () => {
    txHeatFindFirst.mockResolvedValue(null);

    await transitionRound("round1", "DRAW_LOCKED");

    expect(txHeatFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roundId: "round1", draws: { none: {} } } })
    );
    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });
});

// По запросу пользователя (2026-09-04): перед фиксацией жеребьёвки все
// зарегистрированные и прошедшие check-in обязаны попасть хоть в какой-то
// заход, и в каждом заходе поровну ведущих/ведомых — иначе кто-то останется
// без пары или вовсе за бортом раунда.
describe("transitionRound() — DRAW_LOCKED требует полное распределение и баланс пар", () => {
  beforeEach(() => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      order: 1,
      status: "DRAWING",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });
    txHeatFindFirst.mockResolvedValue(null); // у каждого захода есть жеребьёвка
  });

  function participant(registrationId: string, role: "LEADER" | "FOLLOWER", scored = true) {
    return { registrationId, role, scored };
  }

  it("отклоняет, если в заходе не поровну ведущих и ведомых", async () => {
    txHeatFindMany.mockResolvedValue([
      {
        number: 1,
        draws: [{ participants: [participant("l1", "LEADER"), participant("l2", "LEADER"), participant("f1", "FOLLOWER")] }],
      },
    ]);

    await expect(transitionRound("round1", "DRAW_LOCKED")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("отклоняет, если прошедший check-in участник не попал ни в один заход", async () => {
    txHeatFindMany.mockResolvedValue([
      { number: 1, draws: [{ participants: [participant("l1", "LEADER"), participant("f1", "FOLLOWER")] }] },
    ]);
    txRegistrationFindMany.mockImplementation(({ where }: { where: { role: string } }) =>
      Promise.resolve(
        where.role === "LEADER" ? [{ id: "l1" }, { id: "l2" }] : [{ id: "f1" }] // l2 нигде не вызван
      )
    );

    await expect(transitionRound("round1", "DRAW_LOCKED")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("разрешает, если все заходы сбалансированы и все прошедшие check-in распределены", async () => {
    txHeatFindMany.mockResolvedValue([
      { number: 1, draws: [{ participants: [participant("l1", "LEADER"), participant("f1", "FOLLOWER")] }] },
      {
        number: 2,
        draws: [
          {
            participants: [
              participant("l2", "LEADER"),
              participant("l-helper", "LEADER", false), // помощник — тоже даёт пару
              participant("f2", "FOLLOWER"),
              participant("f3", "FOLLOWER"),
            ],
          },
        ],
      },
    ]);
    txRegistrationFindMany.mockImplementation(({ where }: { where: { role: string } }) =>
      Promise.resolve(where.role === "LEADER" ? [{ id: "l1" }, { id: "l2" }] : [{ id: "f1" }, { id: "f2" }, { id: "f3" }])
    );

    await transitionRound("round1", "DRAW_LOCKED");

    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });

  it("не считает помощника (scored=false) за реального при проверке полноты распределения", async () => {
    // f-helper — помощник, не входит в пул CHECKED_IN дивизиона, поэтому не
    // должен требовать своего собственного покрытия.
    txHeatFindMany.mockResolvedValue([
      {
        number: 1,
        draws: [{ participants: [participant("l1", "LEADER"), participant("f-helper", "FOLLOWER", false)] }],
      },
    ]);
    txRegistrationFindMany.mockImplementation(({ where }: { where: { role: string } }) =>
      Promise.resolve(where.role === "LEADER" ? [{ id: "l1" }] : [])
    );

    await transitionRound("round1", "DRAW_LOCKED");

    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });
});

// Раунды одного дивизиона запускаются строго по очереди — нельзя начать
// финал, не проведя отборочный (docs/00_DECISIONS.md, A8).
describe("transitionRound() — раунды дивизиона по очереди", () => {
  it("запускает раунд, если все более ранние раунды дивизиона уже COMPLETED", async () => {
    txRoundFindFirst.mockResolvedValue(null);

    await transitionRound("round2", "RUNNING");

    expect(txRoundFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { divisionId: "div1", order: { lt: 2 }, status: { not: "COMPLETED" } },
      })
    );
    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });

  it("отклоняет запуск, если более ранний раунд дивизиона ещё не COMPLETED", async () => {
    txRoundFindFirst.mockResolvedValue({ id: "round1", order: 1, type: null, stage: { name: "Отборочный" } });

    await expect(transitionRound("round2", "RUNNING")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("не проверяет очередь для переходов, отличных от RUNNING/DRAWING", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round2",
      order: 2,
      status: "DRAFT",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });

    await transitionRound("round2", "READY");

    expect(txRoundFindFirst).not.toHaveBeenCalled();
    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });

  it("не смотрит на раунды ДРУГИХ дивизионов", async () => {
    await transitionRound("round2", "RUNNING");

    const whereArg = txRoundFindFirst.mock.calls[0][0].where;
    expect(whereArg.divisionId).toBe("div1");
  });
});

// Этап 7/8 (A13, закрывает известное ограничение A9): нельзя начать
// жеребьёвку следующего раунда, пока предыдущий не COMPLETED — иначе
// жеребьёвка сформировалась бы раньше, чем Advancement Engine определит,
// кто прошёл (draw-engine.ts тогда тянул бы пул из ещё не посчитанного
// раунда). Тот же принцип, что уже применялся к RUNNING (A8).
describe("transitionRound() — жеребьёвку следующего раунда нельзя начать раньше предыдущего", () => {
  beforeEach(() => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round2",
      order: 2,
      status: "READY",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });
  });

  it("отклоняет начало жеребьёвки, если более ранний раунд дивизиона ещё не COMPLETED", async () => {
    txRoundFindFirst.mockResolvedValue({ id: "round1", order: 1, type: null, stage: { name: "Отборочный" } });

    await expect(
      transitionRound("round2", "DRAWING", { extraData: { config: { drawCallOrder: "RANDOM" } } })
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("разрешает начать жеребьёвку, если все более ранние раунды дивизиона уже COMPLETED", async () => {
    txRoundFindFirst.mockResolvedValue(null);

    await transitionRound("round2", "DRAWING", { extraData: { config: { drawCallOrder: "RANDOM" } } });

    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });
});

// Этап 6/7: когда все заходы раунда завершены, раунд сам идёт
// RUNNING -> FINISHED -> SCORING — кнопка не нужна (по запросу пользователя,
// 2026-09-04). Вызывается из heat-state.ts внутри транзакции завершения
// захода, поэтому здесь тестируется напрямую как отдельная функция.
describe("autoAdvanceRoundIfAllHeatsFinishedInTx()", () => {
  it("ничего не делает, если раунд не в статусе RUNNING/PAUSED", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ id: "round1", status: "DRAW_LOCKED", statusVersion: 1 });

    await autoAdvanceRoundIfAllHeatsFinishedInTx(fakeTx as never, "round1", actor);

    expect(txHeatCount).not.toHaveBeenCalled();
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  // Найдено на живом баге (2026-09-04): у раунда своя кнопка "Пауза"
  // (независимая от паузы захода/ротации), и заход мог завершиться, пока
  // раунд стоит на паузе — раунд должен всё равно досчитать результат, а
  // не застрять в PAUSED навсегда.
  it("переводит раунд PAUSED -> FINISHED -> SCORING, когда все заходы завершены во время паузы раунда", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ id: "round1", status: "PAUSED", statusVersion: 1 });
    txHeatCount.mockResolvedValue(0);
    txRoundUpdateMany.mockResolvedValue({ count: 1 });

    await autoAdvanceRoundIfAllHeatsFinishedInTx(fakeTx as never, "round1", actor);

    expect(txRoundUpdateMany).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ before: { status: "PAUSED" } }) })
    );
    expect(maybeCalculateOnEntryMock).toHaveBeenCalledWith(fakeTx, "round1", actor);
  });

  it("ничего не делает, если остались незавершённые заходы", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ id: "round1", status: "RUNNING", statusVersion: 1 });
    txHeatCount.mockResolvedValue(1);

    await autoAdvanceRoundIfAllHeatsFinishedInTx(fakeTx as never, "round1", actor);

    expect(txHeatCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roundId: "round1", status: { not: "FINISHED" } } })
    );
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("переводит раунд RUNNING -> FINISHED -> SCORING и запускает расчёт результата, когда все заходы завершены", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ id: "round1", status: "RUNNING", statusVersion: 1 });
    txHeatCount.mockResolvedValue(0);
    txRoundUpdateMany.mockResolvedValue({ count: 1 });

    await autoAdvanceRoundIfAllHeatsFinishedInTx(fakeTx as never, "round1", actor);

    expect(txRoundUpdateMany).toHaveBeenCalledTimes(2);
    expect(txRoundUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: "round1", statusVersion: 1 }, data: expect.objectContaining({ status: "FINISHED" }) })
    );
    expect(txRoundUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: "round1", statusVersion: 2 }, data: expect.objectContaining({ status: "SCORING" }) })
    );
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(maybeCalculateOnEntryMock).toHaveBeenCalledWith(fakeTx, "round1", actor);
  });

  it("не идёт дальше и не считает результат, если переход в FINISHED проиграл гонку", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ id: "round1", status: "RUNNING", statusVersion: 1 });
    txHeatCount.mockResolvedValue(0);
    txRoundUpdateMany.mockResolvedValue({ count: 0 });

    await autoAdvanceRoundIfAllHeatsFinishedInTx(fakeTx as never, "round1", actor);

    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
    expect(maybeCalculateOnEntryMock).not.toHaveBeenCalled();
  });
});
