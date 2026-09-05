"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Participant = { bibNumber: string | null; displayName: string; role: "LEADER" | "FOLLOWER" };
type Rotation = {
  status: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
  mode: "TRACK_AUTO_SHIFT" | "SEGMENT_MANUAL_SHIFT";
  intervalSec: number;
  shiftMin: number;
  shiftMax: number;
  trackNumber: number;
  trackName: string | null;
  segmentStartedAt: string | null;
  pausedAt: string | null;
  awaitingShiftChoice: boolean;
  pendingShiftN: number | null;
} | null;
type ScreenView = {
  competitionName: string;
  serverNow: string;
  active: {
    heatId: string;
    heatNumber: number;
    heatStatus: string;
    divisionCategoryName: string;
    roundLabel: string;
    participants: Participant[];
    rotation: Rotation;
  } | null;
};

const POLL_MS = 2500;

// Большое табло (Этап 12) — read-only зеркало живого танцпола, без кнопок
// управления. Тот же приём калибровки часов, что и в RotationPanel.tsx
// (Этап 6, A12): сервер — источник времени, клиент только досчитывает
// отсчёт между опросами.
export function PublicScreenBoard({ competitionId }: { competitionId: string }) {
  const [view, setView] = useState<ScreenView | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [tick, setTick] = useState(0);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/competitions/${competitionId}/screen`, { cache: "no-store" });
      if (!res.ok || !mountedRef.current) return;
      const data = (await res.json()) as ScreenView;
      if (!mountedRef.current) return;
      setView(data);
      setClockOffsetMs(Date.now() - new Date(data.serverNow).getTime());
    } catch {
      // Молча пропускаем один неудачный опрос — следующий через POLL_MS.
    }
  }, [competitionId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const pollId = setInterval(load, POLL_MS);
    const tickId = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [load]);

  if (!view) {
    return <BoardShell competitionName="" />;
  }

  if (!view.active) {
    return (
      <BoardShell competitionName={view.competitionName}>
        <p className="text-3xl text-white/70">Сейчас паркет свободен</p>
      </BoardShell>
    );
  }

  const { active } = view;
  const r = active.rotation;
  void tick;
  const calibratedNowMs = Date.now() - clockOffsetMs;
  let elapsedSec = 0;
  if (r?.segmentStartedAt) {
    const segStart = new Date(r.segmentStartedAt).getTime();
    if (r.status === "PAUSED" && r.pausedAt) {
      elapsedSec = Math.max(0, (new Date(r.pausedAt).getTime() - segStart) / 1000);
    } else if (r.status === "RUNNING") {
      elapsedSec = Math.max(0, (calibratedNowMs - segStart) / 1000);
    }
  }

  const leaders = active.participants.filter((p) => p.role === "LEADER");
  const followers = active.participants.filter((p) => p.role === "FOLLOWER");

  return (
    <BoardShell competitionName={view.competitionName}>
      <p className="m-0 text-2xl uppercase tracking-wide text-white/60">
        {active.divisionCategoryName} · {active.roundLabel} · Заход {active.heatNumber}
      </p>

      {r && r.trackName && <p className="m-0 mt-2 text-3xl text-white/80">«{r.trackName}»</p>}

      {r && r.status === "RUNNING" && r.mode === "TRACK_AUTO_SHIFT" && (
        <p className="m-0 mt-6 font-display text-8xl font-extrabold text-white">
          {Math.max(0, Math.ceil(r.intervalSec - (elapsedSec % r.intervalSec)))}
        </p>
      )}
      {r && r.status === "RUNNING" && r.mode === "TRACK_AUTO_SHIFT" && (
        <p className="m-0 text-2xl text-white/60">до смены партнёров</p>
      )}

      {r && r.status === "RUNNING" && r.mode === "SEGMENT_MANUAL_SHIFT" && !r.awaitingShiftChoice && (
        <p className="m-0 mt-6 text-4xl text-white/80">Танцуем…</p>
      )}
      {r && r.awaitingShiftChoice && r.pendingShiftN === null && (
        <p className="m-0 mt-6 text-5xl font-bold text-amber-300">СМЕНА!</p>
      )}
      {r && r.pendingShiftN !== null && (
        <p className="m-0 mt-6 text-5xl font-bold text-amber-300">Переход на {r.pendingShiftN} партнёров</p>
      )}
      {r && r.status === "PAUSED" && <p className="m-0 mt-6 text-4xl text-white/80">Пауза</p>}

      <div className="mt-10 grid w-full max-w-4xl grid-cols-2 gap-8 text-left">
        <RoleColumn label="Ведущие" participants={leaders} />
        <RoleColumn label="Ведомые" participants={followers} />
      </div>
    </BoardShell>
  );
}

function RoleColumn({ label, participants }: { label: string; participants: Participant[] }) {
  return (
    <div>
      <p className="m-0 mb-2 text-lg uppercase tracking-wide text-white/50">{label}</p>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        {participants.map((p) => (
          <li key={`${p.bibNumber}-${p.displayName}`} className="rounded-xl bg-white/10 px-4 py-2 text-2xl font-semibold text-white">
            №{p.bibNumber ?? "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardShell({ competitionName, children }: { competitionName: string; children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black px-8 text-center text-white">
      {competitionName && <p className="absolute top-6 m-0 text-xl uppercase tracking-widest text-white/40">{competitionName}</p>}
      {children}
    </div>
  );
}
