import type { RegistrationRole, RotationMode, RotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roundLabel } from "./public-competition-view";

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
        select: { type: true, stage: { select: { name: true } }, division: { select: { category: { select: { name: true } } } } },
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

  const r = heat.rotation;
  return {
    competitionName: competition.name,
    serverNow: new Date().toISOString(),
    active: {
      heatId: heat.id,
      heatNumber: heat.number,
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
