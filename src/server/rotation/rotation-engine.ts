import crypto from "node:crypto";
import type { Prisma, RotationMode, RotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "../state/machine";
import { requirePermission, can } from "../rbac/authorize";
import { getActor, type Actor } from "../rbac/actor";
import { writeAudit } from "../audit/audit";
import { AuthenticationRequiredError, PermissionDeniedError, ValidationFailedError, ConcurrentModificationError } from "../errors";

type PrismaTx = Prisma.TransactionClient;

// Живой танцпол / ротация партнёров (Этап 6, docs/00_DECISIONS.md, A12).
// Два независимых, реально используемых сценария (подтверждено
// пользователем 2026-09-04, не переключатели одного сценария):
//   TRACK_AUTO_SHIFT — играет целый трек, программа сама по таймеру каждые
//     intervalSec показывает "СМЕНА" (сдвиг всегда на 1 партнёра).
//   SEGMENT_MANUAL_SHIFT — играет отрезок трека, DJ вручную жмёт "Стоп",
//     затем выбирается N (в диапазоне shiftMin..shiftMax) — случайно (с
//     сохранением seed, CLAUDE.md §6) или вручную.
// Программа НЕ хранит и не назначает конкретные пары (A5) — только считает
// время (сервер — источник времени, CLAUDE.md §12) и показывает надписи на
// экране, без звука.

// Без RESUMED — как и Round/Heat (A2): возобновление это переход
// PAUSED -> RUNNING, не отдельное состояние.
const STATUS_TABLE: TransitionTable<RotationStatus> = {
  IDLE: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING", "FINISHED"],
  FINISHED: [],
};

type ResolvedRotationConfig = {
  mode: RotationMode;
  intervalSec: number;
  shiftMin: number;
  shiftMax: number;
};

type RoundWithDivisionForRotation = {
  rotationMode: RotationMode | null;
  rotationIntervalSec: number | null;
  rotationShiftMin: number | null;
  rotationShiftMax: number | null;
  division: {
    rotationMode: RotationMode;
    rotationIntervalSec: number;
    rotationShiftMin: number;
    rotationShiftMax: number;
  };
};

// Настройки ротации — на дивизионе по умолчанию, на конкретном раунде можно
// переопределить (тот же паттерн, что heatCapacity, A7).
function resolveRotationConfig(round: RoundWithDivisionForRotation): ResolvedRotationConfig {
  return {
    mode: round.rotationMode ?? round.division.rotationMode,
    intervalSec: round.rotationIntervalSec ?? round.division.rotationIntervalSec,
    shiftMin: round.rotationShiftMin ?? round.division.rotationShiftMin,
    shiftMax: round.rotationShiftMax ?? round.division.rotationShiftMax,
  };
}

function generateSeed(): string {
  return crypto.randomBytes(8).toString("hex");
}

// mulberry32 — тот же маленький детерминированный PRNG, что и в Draw Engine
// (draw-engine.ts, DRAW_ALGORITHM_VERSION): тот же seed всегда даёт то же
// число (CLAUDE.md §6 — нельзя использовать Math.random() без сохранения
// результата).
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInRange(seedHex: string, min: number, max: number): number {
  const seedNum = parseInt(seedHex.slice(0, 8), 16);
  const rng = mulberry32(seedNum);
  return min + Math.floor(rng() * (max - min + 1));
}

async function loadHeatForRotation(heatId: string) {
  return prisma.heat.findUniqueOrThrow({
    where: { id: heatId },
    include: { rotation: true, round: { include: { division: true } } },
  });
}

type HeatForRotation = Awaited<ReturnType<typeof loadHeatForRotation>>;
type RotationRow = NonNullable<HeatForRotation["rotation"]>;

// Общий "конверт" для действий, которые НЕ меняют RotationStatus (трек
// пошёл, смена вручную, стоп, выбор N) — только поля внутри статуса
// RUNNING: транзакция, оптимистичная блокировка (statusVersion), audit,
// CompetitionEvent. Статусные переходы (start/pause/resume/finish) ниже
// используют transition() из state/machine.ts напрямую, не эту функцию.
async function commitRotationUpdate(args: {
  heat: HeatForRotation;
  rotation: RotationRow;
  actor: Actor;
  data: Prisma.HeatRotationUncheckedUpdateManyInput;
  eventType: string;
  eventPayload: Prisma.InputJsonValue;
  auditAction: string;
  before: Record<string, unknown>;
}): Promise<void> {
  const { heat, rotation, actor, data, eventType, eventPayload, auditAction, before } = args;
  const competitionId = heat.round.division.competitionId;

  await prisma.$transaction(async (tx) => {
    const result = await tx.heatRotation.updateMany({
      where: { id: rotation.id, statusVersion: rotation.statusVersion },
      data: { ...data, statusVersion: { increment: 1 } },
    });
    if (result.count === 0) {
      // Кто-то другой уже изменил ротацию между нашим чтением и записью
      // (CLAUDE.md §34 — защита от гонок при одновременных действиях DJ/
      // организатора/гл. судьи).
      throw new ConcurrentModificationError("HeatRotation");
    }

    await tx.competitionEvent.create({
      data: {
        competitionId,
        roundId: heat.roundId,
        heatId: heat.id,
        eventType,
        payload: eventPayload,
        actorId: actor.userId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: auditAction,
      entityType: "HeatRotation",
      entityId: rotation.id,
      before,
      after: data,
    });
  });
}

function requireRunning(rotation: RotationRow): void {
  if (rotation.status !== "RUNNING") {
    throw new ValidationFailedError('Это действие доступно, только пока ротация партнёров "Идёт" (не на паузе и не завершена).');
  }
}

// ---------------------------------------------------------------------------
// Старт / пауза / резюме / финиш — статусные переходы
// ---------------------------------------------------------------------------

// Одна кнопка "Начать танцпол" на заезд: создаёт (если ещё нет) строку
// HeatRotation, фиксируя СНИМОК настроек дивизиона/раунда на этот момент
// (правки настроек позже не должны задним числом менять уже идущий заезд,
// CLAUDE.md §50/§51), и переводит её IDLE -> RUNNING. Требует, чтобы сам
// заезд уже был запущен (Heat.status === RUNNING) — ротация это то, что
// происходит НА паркете, не раньше.
export async function startRotation(heatId: string): Promise<void> {
  const heat = await loadHeatForRotation(heatId);
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("timer:control", competitionId);

  if (heat.status !== "RUNNING") {
    throw new ValidationFailedError("Нельзя начать ротацию партнёров: сначала запустите сам заезд.");
  }

  let rotation = heat.rotation;
  if (!rotation) {
    const config = resolveRotationConfig(heat.round);
    try {
      rotation = await prisma.heatRotation.create({
        data: { heatId, mode: config.mode, intervalSec: config.intervalSec, shiftMin: config.shiftMin, shiftMax: config.shiftMax },
      });
    } catch {
      // Гонка: кто-то другой успел создать строку между нашим чтением и
      // записью (CLAUDE.md §34 — защита от двойного запуска).
      rotation = await prisma.heatRotation.findUnique({ where: { heatId } });
      if (!rotation) throw new ValidationFailedError("Не удалось начать ротацию партнёров — попробуйте ещё раз.");
    }
  }
  if (rotation.status !== "IDLE") {
    throw new ValidationFailedError("Ротация партнёров для этого заезда уже была начата.");
  }

  const config: ResolvedRotationConfig = {
    mode: rotation.mode,
    intervalSec: rotation.intervalSec,
    shiftMin: rotation.shiftMin,
    shiftMax: rotation.shiftMax,
  };
  const rotationForClosure = rotation;

  await transition({
    entityType: "HeatRotation",
    entityId: rotation.id,
    table: STATUS_TABLE,
    currentStatus: rotation.status,
    statusVersion: rotation.statusVersion,
    to: "RUNNING",
    actor,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.heatRotation.updateMany({
        where: { id: rotationForClosure.id, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, trackNumber: 1, trackName: null, segmentStartedAt: new Date(), pausedAt: null },
      });
      if (result.count > 0) {
        await tx.competitionEvent.create({
          data: {
            competitionId,
            roundId: heat.roundId,
            heatId,
            eventType: "ROTATION_STARTED",
            payload: { ...config },
            actorId: actor.userId,
          },
        });
      }
      return { before: { status: rotationForClosure.status }, after: { status: to, ...config }, updatedCount: result.count };
    },
  });
}

async function loadRotationOrThrow(heatId: string): Promise<{ heat: HeatForRotation; rotation: RotationRow }> {
  const heat = await loadHeatForRotation(heatId);
  if (!heat.rotation) {
    throw new ValidationFailedError("Ротация партнёров для этого заезда ещё не начата.");
  }
  return { heat, rotation: heat.rotation };
}

export async function pauseRotation(heatId: string): Promise<void> {
  const { heat, rotation } = await loadRotationOrThrow(heatId);
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("timer:control", competitionId);

  await transition({
    entityType: "HeatRotation",
    entityId: rotation.id,
    table: STATUS_TABLE,
    currentStatus: rotation.status,
    statusVersion: rotation.statusVersion,
    to: "PAUSED",
    actor,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.heatRotation.updateMany({
        where: { id: rotation.id, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, pausedAt: new Date() },
      });
      if (result.count > 0) {
        await tx.competitionEvent.create({
          data: { competitionId, roundId: heat.roundId, heatId, eventType: "ROTATION_PAUSED", payload: { trackNumber: rotation.trackNumber }, actorId: actor.userId },
        });
      }
      return { before: { status: rotation.status }, after: { status: to }, updatedCount: result.count };
    },
  });
}

export async function resumeRotation(heatId: string): Promise<void> {
  const { heat, rotation } = await loadRotationOrThrow(heatId);
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("timer:control", competitionId);
  if (!rotation.pausedAt) {
    throw new ValidationFailedError("Ротация партнёров не на паузе.");
  }

  // Сдвигаем начало текущего отрезка вперёд ровно на длительность паузы —
  // отсчёт продолжается с того же места, а не начинается заново (сервер —
  // единственный источник времени, CLAUDE.md §12).
  const pauseDurationMs = Date.now() - rotation.pausedAt.getTime();
  const newSegmentStart = rotation.segmentStartedAt
    ? new Date(rotation.segmentStartedAt.getTime() + pauseDurationMs)
    : new Date();

  await transition({
    entityType: "HeatRotation",
    entityId: rotation.id,
    table: STATUS_TABLE,
    currentStatus: rotation.status,
    statusVersion: rotation.statusVersion,
    to: "RUNNING",
    actor,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.heatRotation.updateMany({
        where: { id: rotation.id, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, pausedAt: null, segmentStartedAt: newSegmentStart },
      });
      if (result.count > 0) {
        await tx.competitionEvent.create({
          data: { competitionId, roundId: heat.roundId, heatId, eventType: "ROTATION_RESUMED", payload: {}, actorId: actor.userId },
        });
      }
      return { before: { status: rotation.status }, after: { status: to }, updatedCount: result.count };
    },
  });
}

// Вызывается автоматически при переходе Heat -> FINISHED (heat-state.ts,
// onApplied) — одной транзакцией вместе с самим завершением заезда, без
// отдельной кнопки "Завершить ротацию". Если ротацию не начинали (IDLE) —
// завершать нечего, тихо ничего не делает (это не ошибка: заезд мог
// закончиться без единого трека, напр. отменён).
export async function finishRotationInTx(tx: PrismaTx, heatId: string, actor: Actor): Promise<void> {
  const rotation = await tx.heatRotation.findUnique({ where: { heatId } });
  if (!rotation) return;
  if (!(STATUS_TABLE[rotation.status] ?? []).includes("FINISHED")) return;

  const result = await tx.heatRotation.updateMany({
    where: { id: rotation.id, statusVersion: rotation.statusVersion },
    data: { status: "FINISHED", statusVersion: { increment: 1 } },
  });
  if (result.count === 0) return; // гонка — заезд и так закрывается, не критично для этого побочного действия

  await writeAudit(tx, {
    actor,
    action: "heatrotation.transition",
    entityType: "HeatRotation",
    entityId: rotation.id,
    before: { status: rotation.status },
    after: { status: "FINISHED" },
  });
}

// ---------------------------------------------------------------------------
// Действия внутри RUNNING — не меняют RotationStatus
// ---------------------------------------------------------------------------

// "Трек пошёл" / "Новый трек" — общее для обоих режимов действие. В режиме
// SEGMENT_MANUAL_SHIFT нельзя начать новый отрезок, пока не выбрано число N
// после "Стоп" (иначе результат "Стоп" потерялся бы молча).
export async function nextTrack(heatId: string, trackName?: string): Promise<void> {
  const { heat, rotation } = await loadRotationOrThrow(heatId);
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("timer:control", competitionId);
  requireRunning(rotation);

  if (rotation.awaitingShiftChoice && rotation.pendingShiftN === null) {
    throw new ValidationFailedError('Сначала выберите, на сколько партнёров переходят ("Случайно" или вручную).');
  }

  const nextNumber = rotation.trackNumber + 1;
  await commitRotationUpdate({
    heat,
    rotation,
    actor,
    data: {
      trackNumber: nextNumber,
      trackName: trackName?.trim() || null,
      segmentStartedAt: new Date(),
      awaitingShiftChoice: false,
      pendingShiftN: null,
      pendingShiftSource: null,
      pendingShiftSeed: null,
    },
    eventType: "TRACK_STARTED",
    eventPayload: { trackNumber: nextNumber, trackName: trackName?.trim() || null },
    auditAction: "heatrotation.next_track",
    before: { trackNumber: rotation.trackNumber, trackName: rotation.trackName },
  });
}

// Досрочная смена партнёров вручную (режим TRACK_AUTO_SHIFT) — таймер сам
// показывает "СМЕНА" каждые intervalSec, но DJ может вызвать её раньше;
// после этого интервал отсчитывается заново от этого момента.
export async function manualShiftNow(heatId: string): Promise<void> {
  const { heat, rotation } = await loadRotationOrThrow(heatId);
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("rotation:control", competitionId);
  requireRunning(rotation);

  if (rotation.mode !== "TRACK_AUTO_SHIFT") {
    throw new ValidationFailedError('Ручная смена доступна только в режиме "смены внутри трека".');
  }

  await commitRotationUpdate({
    heat,
    rotation,
    actor,
    data: { segmentStartedAt: new Date() },
    eventType: "PARTNERS_SHIFTED",
    eventPayload: { trackNumber: rotation.trackNumber, manual: true },
    auditAction: "heatrotation.manual_shift",
    before: { segmentStartedAt: rotation.segmentStartedAt },
  });
}

// Режим SEGMENT_MANUAL_SHIFT: DJ останавливает текущий отрезок — заезд
// ждёт выбора N, прежде чем можно будет запустить следующий отрезок.
export async function stopSegment(heatId: string): Promise<void> {
  const { heat, rotation } = await loadRotationOrThrow(heatId);
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("timer:control", competitionId);
  requireRunning(rotation);

  if (rotation.mode !== "SEGMENT_MANUAL_SHIFT") {
    throw new ValidationFailedError('"Стоп" доступен только в режиме "смена между отрезками".');
  }
  if (rotation.awaitingShiftChoice) {
    throw new ValidationFailedError("Отрезок уже остановлен — выберите, на сколько партнёров переходят.");
  }

  await commitRotationUpdate({
    heat,
    rotation,
    actor,
    data: { awaitingShiftChoice: true },
    eventType: "SEGMENT_STOPPED",
    eventPayload: { trackNumber: rotation.trackNumber },
    auditAction: "heatrotation.stop_segment",
    before: { awaitingShiftChoice: rotation.awaitingShiftChoice },
  });
}

export type ShiftChoiceSource = "RANDOM" | "MANUAL";

// Выбор N (на сколько партнёров переходят) после "Стоп" — случайно (сервер
// выбирает и сохраняет seed, CLAUDE.md §6) или вручную в разрешённом
// диапазоне (Division/Round.rotationShiftMin..Max, снимок на момент старта
// ротации).
export async function chooseShift(heatId: string, input: { source: ShiftChoiceSource; n?: number }): Promise<void> {
  const { heat, rotation } = await loadRotationOrThrow(heatId);
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("rotation:control", competitionId);
  requireRunning(rotation);

  if (rotation.mode !== "SEGMENT_MANUAL_SHIFT") {
    throw new ValidationFailedError('Выбор числа партнёров доступен только в режиме "смена между отрезками".');
  }
  if (!rotation.awaitingShiftChoice) {
    throw new ValidationFailedError('Сначала остановите текущий отрезок ("Стоп").');
  }
  if (rotation.pendingShiftN !== null) {
    throw new ValidationFailedError("Число уже выбрано — начните следующий трек.");
  }

  let n: number;
  let seed: string | null = null;
  if (input.source === "RANDOM") {
    seed = generateSeed();
    n = pickInRange(seed, rotation.shiftMin, rotation.shiftMax);
  } else {
    if (input.n === undefined || !Number.isInteger(input.n)) {
      throw new ValidationFailedError("Укажите число партнёров.");
    }
    if (input.n < rotation.shiftMin || input.n > rotation.shiftMax) {
      throw new ValidationFailedError(`Число должно быть от ${rotation.shiftMin} до ${rotation.shiftMax}.`);
    }
    n = input.n;
  }

  await commitRotationUpdate({
    heat,
    rotation,
    actor,
    data: { pendingShiftN: n, pendingShiftSource: input.source, pendingShiftSeed: seed },
    eventType: "SHIFT_CHOSEN",
    eventPayload: { n, source: input.source, seed },
    auditAction: "heatrotation.choose_shift",
    before: { pendingShiftN: rotation.pendingShiftN },
  });
}

// ---------------------------------------------------------------------------
// Чтение состояния для опроса клиентом (раз в 2–3 сек — docs/00_DECISIONS.md,
// решение по realtime для этого этапа). Сервер — источник времени: клиент
// только отрисовывает обратный отсчёт по segmentStartedAt/intervalSec,
// serverNow лечит рассинхрон часов клиента (CLAUDE.md §12).
// ---------------------------------------------------------------------------

export type RotationView = {
  heatId: string;
  heatStatus: HeatForRotation["status"];
  rotation: null | {
    status: RotationStatus;
    mode: RotationMode;
    intervalSec: number;
    shiftMin: number;
    shiftMax: number;
    trackNumber: number;
    trackName: string | null;
    segmentStartedAt: string | null;
    pausedAt: string | null;
    awaitingShiftChoice: boolean;
    pendingShiftN: number | null;
    pendingShiftSource: string | null;
  };
  serverNow: string;
  canControlTimer: boolean;
  canControlRotation: boolean;
};

export async function getRotationView(heatId: string): Promise<RotationView> {
  const heat = await loadHeatForRotation(heatId);
  const competitionId = heat.round.division.competitionId;

  const actor = await getActor();
  if (!actor) throw new AuthenticationRequiredError();
  const isMember = actor.permissionsByCompetition.has(competitionId) || actor.globalPermissions.size > 0;
  if (!isMember) throw new PermissionDeniedError("timer:control");

  const r = heat.rotation;
  return {
    heatId: heat.id,
    heatStatus: heat.status,
    rotation: r
      ? {
          status: r.status,
          mode: r.mode,
          intervalSec: r.intervalSec,
          shiftMin: r.shiftMin,
          shiftMax: r.shiftMax,
          trackNumber: r.trackNumber,
          trackName: r.trackName,
          segmentStartedAt: r.segmentStartedAt?.toISOString() ?? null,
          pausedAt: r.pausedAt?.toISOString() ?? null,
          awaitingShiftChoice: r.awaitingShiftChoice,
          pendingShiftN: r.pendingShiftN,
          pendingShiftSource: r.pendingShiftSource,
        }
      : null,
    serverNow: new Date().toISOString(),
    canControlTimer: can(actor, "timer:control", competitionId),
    canControlRotation: can(actor, "rotation:control", competitionId),
  };
}
