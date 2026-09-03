"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ROTATION_STATUS_LABELS } from "@/lib/competition-labels";

type RotationView = {
  heatId: string;
  heatStatus: string;
  rotation: null | {
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
    pendingShiftSource: string | null;
  };
  serverNow: string;
  canControlTimer: boolean;
  canControlRotation: boolean;
};

const POLL_MS = 2500;

// Живой танцпол (Этап 6) — таймер/ротация партнёров заезда. Сервер
// источник времени (CLAUDE.md §12): опрашиваем GET .../rotation раз в
// ~2.5с, а обратный отсчёт между опросами считаем локально по разнице
// клиентских часов на момент последнего опроса (calibration), а не по
// сырому "теперь" браузера — так правки системного времени на клиенте не
// портят отсчёт сильнее, чем на POLL_MS.
export function RotationPanel({ heatId }: { heatId: string }) {
  const [view, setView] = useState<RotationView | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0); // Date.now() - serverNow, на момент последнего опроса
  const [tick, setTick] = useState(0); // только чтобы перерисовывать отсчёт каждую секунду
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trackNameInput, setTrackNameInput] = useState("");
  const [manualN, setManualN] = useState("");
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/heats/${heatId}/rotation`);
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        setError(data.error || "Не удалось получить состояние ротации.");
        return;
      }
      setError(null);
      setView(data as RotationView);
      setClockOffsetMs(Date.now() - new Date((data as RotationView).serverNow).getTime());
    } catch {
      if (mountedRef.current) setError("Не удалось связаться с сервером.");
    }
  }, [heatId]);

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

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/heats/${heatId}/rotation/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось выполнить действие.");
      return;
    }
    await load();
  }

  if (!view) {
    return error ? <p className="error-text">{error}</p> : null;
  }

  if (view.heatStatus !== "RUNNING" && view.heatStatus !== "PAUSED" && !view.rotation) {
    // Заезд ещё не запущен (или уже завершён без единого трека) — панели
    // здесь показывать нечего.
    return null;
  }

  const r = view.rotation;
  const canTimer = view.canControlTimer && !busy;
  const canRotation = view.canControlRotation && !busy;

  // "Сейчас" с поправкой на смещение часов клиента относительно сервера,
  // измеренное на момент последнего опроса (см. комментарий у компонента).
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
  void tick; // читаем tick только чтобы React перерисовывал компонент каждую секунду

  return (
    <div className="rounded-app-sm border border-line p-3 mt-2 stack gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Живой танцпол</strong>
        <span className="hint-text">{r ? ROTATION_STATUS_LABELS[r.status] ?? r.status : "Не начата"}</span>
      </div>

      {error && <p className="error-text">{error}</p>}

      {!r && (
        <>
          {view.heatStatus === "RUNNING" ? (
            canTimer ? (
              <Button type="button" size="sm" disabled={!canTimer} onClick={() => call("start")}>
                Начать танцпол
              </Button>
            ) : (
              <p className="hint-text">Ротацию ещё не начали.</p>
            )
          ) : null}
        </>
      )}

      {r && r.status !== "FINISHED" && (
        <>
          <p className="m-0">
            Трек {r.trackNumber}
            {r.trackName ? ` · «${r.trackName}»` : ""}
          </p>

          {r.mode === "TRACK_AUTO_SHIFT" && r.status === "RUNNING" && (
            <p className="m-0">До смены партнёров: {Math.max(0, Math.ceil(r.intervalSec - (elapsedSec % r.intervalSec)))} сек</p>
          )}

          {r.mode === "SEGMENT_MANUAL_SHIFT" && r.status === "RUNNING" && !r.awaitingShiftChoice && (
            <p className="m-0 hint-text">Отрезок идёт ({Math.floor(elapsedSec)} сек) — «Стоп», когда пора менять партнёров.</p>
          )}

          {r.awaitingShiftChoice && r.pendingShiftN === null && (
            <p className="m-0 text-accent">Стоп! Выберите, на сколько партнёров переходят ({r.shiftMin}–{r.shiftMax}).</p>
          )}

          {r.pendingShiftN !== null && <p className="m-0 text-accent">Переход на {r.pendingShiftN} партнёров.</p>}

          <div className="flex flex-wrap items-center gap-2">
            {r.status === "RUNNING" && (
              <>
                {canTimer && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => call("pause")}>
                    Пауза
                  </Button>
                )}

                {r.mode === "TRACK_AUTO_SHIFT" && canRotation && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => call("shift-now")}>
                    Смена сейчас
                  </Button>
                )}

                {r.mode === "SEGMENT_MANUAL_SHIFT" && !r.awaitingShiftChoice && canTimer && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => call("stop-segment")}>
                    Стоп
                  </Button>
                )}

                {r.mode === "SEGMENT_MANUAL_SHIFT" && r.awaitingShiftChoice && r.pendingShiftN === null && canRotation && (
                  <>
                    <Button type="button" size="sm" onClick={() => call("choose-shift", { source: "RANDOM" })}>
                      Случайно
                    </Button>
                    <Input
                      type="number"
                      min={r.shiftMin}
                      max={r.shiftMax}
                      placeholder={`${r.shiftMin}-${r.shiftMax}`}
                      value={manualN}
                      onChange={(e) => setManualN(e.target.value)}
                      className="w-20"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!manualN}
                      onClick={() => call("choose-shift", { source: "MANUAL", n: Number(manualN) })}
                    >
                      Подтвердить
                    </Button>
                  </>
                )}

                {(r.mode === "TRACK_AUTO_SHIFT" || r.pendingShiftN !== null) && canTimer && (
                  <>
                    <Input
                      type="text"
                      placeholder="Название трека (необязательно)"
                      value={trackNameInput}
                      onChange={(e) => setTrackNameInput(e.target.value)}
                      className="w-48"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        call("next-track", { trackName: trackNameInput || undefined });
                        setTrackNameInput("");
                        setManualN("");
                      }}
                    >
                      {r.trackNumber === 0 ? "Трек пошёл" : "Новый трек"}
                    </Button>
                  </>
                )}
              </>
            )}

            {r.status === "PAUSED" && canTimer && (
              <Button type="button" size="sm" onClick={() => call("resume")}>
                Продолжить
              </Button>
            )}
          </div>
        </>
      )}

      {r && r.status === "FINISHED" && <p className="hint-text m-0">Ротация партнёров завершена вместе с заездом.</p>}
    </div>
  );
}
