import type { RegistrationRole, RotationMode, RotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roundLabel } from "./public-competition-view";
import { computeJudgesDanceHeatNumbering } from "@/lib/judges-dance-heat-numbering";

// Большое табло (Этап 12, docs/01 §22 "Big-screen mode") — публичное,
// read-only зеркало живого танцпола (Этап 6, A12): та же модель данных
// (HeatRotation), но без RBAC и без кнопок управления. Сервер остаётся
// источником времени (CLAUDE.md §12) — клиент опрашивает раз в ~2.5 сек,
// как и админская панель (RotationPanel.tsx).
//
// Соревнование физически имеет только один активный заезд одновременно
// (эксклюзивность паркета, A4) — поэтому табло само находит единственный
// RUNNING/PAUSED заезд по competitionId, без heatId в URL.

export type PublicScreenParticipant = { bibNumber: string | null; displayName: string; role: RegistrationRole };

export type PublicScreenRotation = {
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
};

export type PublicScreenView = {
  competitionName: string;
  serverNow: string;
  active: {
    heatId: string;
    heatNumber: number;
    heatStatus: string;
    divisionCategoryName: string;
    roundLabel: string;
    participants: PublicScreenParticipant[];
    rotation: PublicScreenRotation | null;
  } | null;
};

export async function getPublicScreenView(competitionId: string): Promise<PublicScreenView | null> {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId }, select: { name: true, status: true } });
  if (!competition || competition.status === "DRAFT") return null;

  const heat = await prisma.heat.findFirst({
    where: { round: { division: { competitionId } }, status: { in: ["RUNNING", "PAUSED"] } },
    select: {
      id: true,
      number: true,
      status: true,
      round: {
        select: {
          type: true,
          stage: { select: { name: true } },
          division: { select: { category: { select: { name: true } } } },
          finalSession: { select: { format: true } },
          // Только для пересчёта нумерации JUDGES_DANCE ниже (заново с 1 для
          // каждой роли, 2026-09-11) — не для отображения состава заходов.
          heats: {
            select: {
              id: true,
              number: true,
              draws: { orderBy: { version: "desc" }, take: 1, select: { participants: { where: { scored: true }, select: { role: true } } } },
            },
          },
        },
      },
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          participants: {
            where: { scored: true },
            orderBy: { calledOrder: "asc" },
            select: {
              role: true,
              registration: { select: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
            },
          },
        },
      },
      rotation: {
        select: {
          status: true,
          mode: true,
          intervalSec: true,
          shiftMin: true,
          shiftMax: true,
          trackNumber: true,
          trackName: true,
          segmentStartedAt: true,
          pausedAt: true,
          awaitingShiftChoice: true,
          pendingShiftN: true,
        },
      },
    },
  });

  if (!heat) return { competitionName: competition.name, active: null, serverNow: new Date().toISOString() };

  // JUDGES_DANCE — нумерация заново с 1 для каждой роли, не сквозная по
  // всему раунду (по прямому запросу пользователя, 2026-09-11; Heat.number
  // в БД не меняется, только то, что видит зритель на табло).
  let heatNumber = heat.number;
  if (heat.round.finalSession?.format === "JUDGES_DANCE") {
    const numbering = computeJudgesDanceHeatNumbering(
      heat.round.heats.map((h) => ({ id: h.id, number: h.number, dancerRole: h.draws[0]?.participants[0]?.role ?? null }))
    );
    heatNumber = numbering.get(heat.id)?.number ?? heat.number;
  }

  const r = heat.rotation;
  return {
    competitionName: competition.name,
    serverNow: new Date().toISOString(),
    active: {
      heatId: heat.id,
      heatNumber,
      heatStatus: heat.status,
      divisionCategoryName: heat.round.division.category.name,
      roundLabel: roundLabel(heat.round),
      participants: (heat.draws[0]?.participants ?? []).map((p) => ({
        bibNumber: p.registration.checkIn?.bibNumber ?? null,
        displayName: p.registration.dancer.displayName,
        role: p.role,
      })),
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
          }
        : null,
    },
  };
}
