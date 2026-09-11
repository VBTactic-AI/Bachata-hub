"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type AudienceVoteRole = "LEADER" | "FOLLOWER" | "ANY";
type Candidate = { registrationId: string; role: "LEADER" | "FOLLOWER"; bibNumber: string | null; displayName: string };

export type AudienceVoteViewData = {
  divisionId: string;
  categoryName: string;
  mode: "GENERAL" | "BY_ROLE";
  displayMode: "NUMBER_ONLY" | "NUMBER_AND_NAME";
  infoText: string | null;
  status: "IDLE" | "RUNNING" | "CLOSED" | "PUBLISHED";
  serverNow: string;
  closesAt: string | null;
  candidates: Candidate[];
  myVotes: { role: AudienceVoteRole; registrationId: string }[];
  results: { tally: Record<string, number>; winners: { role: AudienceVoteRole; registrationId: string; voteCount: number }[] } | null;
};

const POLL_MS = 2500;

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.8-9.3C.7 7.7 2.4 4.5 5.7 4c2.1-.3 4 .7 6.3 3 2.3-2.3 4.2-3.3 6.3-3 3.3.5 5 3.7 3.5 7.2-2.3 4.7-9.8 9.3-9.8 9.3Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function candidateLabel(c: Candidate, displayMode: AudienceVoteViewData["displayMode"]) {
  const num = c.bibNumber ? `№${c.bibNumber}` : "№—";
  return displayMode === "NUMBER_ONLY" ? num : `${num} ${c.displayName}`;
}

function CandidateRow({
  c,
  displayMode,
  selected,
  votable,
  onVote,
  popKey,
}: {
  c: Candidate;
  displayMode: AudienceVoteViewData["displayMode"];
  selected: boolean;
  votable: boolean;
  onVote: () => void;
  popKey: number;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-app border px-4 py-3 transition ${
        selected ? "border-night-primary bg-night-primary/10" : "border-night-border bg-night-card"
      }`}
    >
      <span className="text-[0.95rem] font-semibold text-night-text">{candidateLabel(c, displayMode)}</span>
      <button
        type="button"
        disabled={!votable}
        onClick={onVote}
        aria-pressed={selected}
        aria-label={selected ? "Голос отдан — нажмите ещё раз, чтобы изменить" : "Проголосовать"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
          selected ? "bg-night-primary text-white" : "bg-night-card2 text-night-pink hover:text-night-primary"
        }`}
      >
        <span key={popKey} className={selected ? "animate-heart-pop" : ""}>
          <HeartIcon filled={selected} />
        </span>
      </button>
    </div>
  );
}

export function AudienceVoteBoard({ competitionId, divisionId, initial }: { competitionId: string; divisionId: string; initial: AudienceVoteViewData }) {
  const [view, setView] = useState<AudienceVoteViewData>(initial);
  const [clockOffsetMs, setClockOffsetMs] = useState(Date.now() - new Date(initial.serverNow).getTime());
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [popKeys, setPopKeys] = useState<Record<string, number>>({});
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/divisions/${divisionId}/audience-vote`);
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current || !res.ok) return;
      setView(data as AudienceVoteViewData);
      setClockOffsetMs(Date.now() - new Date((data as AudienceVoteViewData).serverNow).getTime());
    } catch {
      // Тихо — следующий опрос попробует снова, страница не должна мигать ошибкой на каждый сбой сети.
    }
  }, [divisionId]);

  useEffect(() => {
    mountedRef.current = true;
    const pollId = setInterval(load, POLL_MS);
    const tickId = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [load]);

  async function vote(role: AudienceVoteRole, registrationId: string) {
    if (view.status !== "RUNNING" || busy) return;
    setBusy(true);
    setError(null);
    setPopKeys((prev) => ({ ...prev, [registrationId]: (prev[registrationId] ?? 0) + 1 }));
    // Оптимистично — не ждём ответа сервера, чтобы сердечко отзывалось мгновенно.
    setView((prev) => ({ ...prev, myVotes: [...prev.myVotes.filter((v) => v.role !== role), { role, registrationId }] }));
    const res = await fetch(`/api/public/divisions/${divisionId}/audience-vote/ballot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, registrationId }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить голос.");
      await load(); // откат оптимистичного состояния к тому, что реально в БД
      return;
    }
  }

  void tick; // читаем только чтобы React перерисовывал компонент каждую секунду (обратный отсчёт)
  const now = Date.now() - clockOffsetMs;
  const remainingMs = view.closesAt ? new Date(view.closesAt).getTime() - now : null;
  const remainingLabel =
    remainingMs !== null && remainingMs > 0
      ? `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}`
      : null;

  const votedFor = (role: AudienceVoteRole) => view.myVotes.find((v) => v.role === role)?.registrationId;

  const groups: { role: AudienceVoteRole; title: string; candidates: Candidate[] }[] =
    view.mode === "GENERAL"
      ? [{ role: "ANY", title: "Голосуйте за участника", candidates: view.candidates }]
      : [
          { role: "LEADER", title: "Партнёры", candidates: view.candidates.filter((c) => c.role === "LEADER") },
          { role: "FOLLOWER", title: "Партнёрши", candidates: view.candidates.filter((c) => c.role === "FOLLOWER") },
        ];

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/compete/${competitionId}`} className="text-sm font-semibold text-night-muted no-underline hover:text-night-text">
        ← К странице соревнования
      </Link>
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">🏆 Приз зрительских симпатий</h1>
        <p className="m-0 mt-1 text-sm text-night-muted">{view.categoryName}</p>
      </div>

      {view.status === "RUNNING" && remainingLabel && (
        <div className="self-start rounded-full border border-night-primary/40 bg-night-primary/10 px-4 py-1.5 text-sm font-bold tabular-nums text-night-primary">
          ⏱ До закрытия: {remainingLabel}
        </div>
      )}

      {view.infoText && (
        <div className="rounded-app border border-night-border bg-night-card2 p-4 text-sm leading-relaxed text-night-text">{view.infoText}</div>
      )}

      {view.status === "IDLE" && <p className="m-0 text-night-muted">Голосование по этой категории ещё не началось.</p>}
      {view.status === "CLOSED" && <p className="m-0 text-night-muted">Голосование завершено. Результаты появятся здесь после публикации организатором.</p>}

      {(view.status === "RUNNING" || view.status === "CLOSED") &&
        groups.map((g) => (
          <div key={g.role} className="flex flex-col gap-2">
            {view.mode === "BY_ROLE" && <h2 className="m-0 font-night text-sm font-bold uppercase tracking-wide text-night-muted">{g.title}</h2>}
            {g.candidates.length === 0 ? (
              <p className="m-0 text-sm text-night-muted">Нет участников.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {g.candidates.map((c) => (
                  <CandidateRow
                    key={c.registrationId}
                    c={c}
                    displayMode={view.displayMode}
                    selected={votedFor(g.role) === c.registrationId}
                    votable={view.status === "RUNNING"}
                    onVote={() => vote(g.role, c.registrationId)}
                    popKey={popKeys[c.registrationId] ?? 0}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

      {view.status === "PUBLISHED" && view.results && (
        <div className="flex flex-col gap-4">
          {groups.map((g) => {
            const winners = new Set(view.results!.winners.filter((w) => w.role === g.role).map((w) => w.registrationId));
            return (
              <div key={g.role} className="flex flex-col gap-2">
                {view.mode === "BY_ROLE" && <h2 className="m-0 font-night text-sm font-bold uppercase tracking-wide text-night-muted">{g.title}</h2>}
                <div className="flex flex-col gap-2">
                  {g.candidates
                    .slice()
                    .sort((a, b) => (view.results!.tally[b.registrationId] ?? 0) - (view.results!.tally[a.registrationId] ?? 0))
                    .map((c) => (
                      <div
                        key={c.registrationId}
                        className={`flex items-center justify-between gap-3 rounded-app border px-4 py-3 ${
                          winners.has(c.registrationId) ? "border-night-primary bg-night-primary/10" : "border-night-border bg-night-card"
                        }`}
                      >
                        <span className="text-[0.95rem] font-semibold text-night-text">
                          {winners.has(c.registrationId) && "🏆 "}
                          {candidateLabel(c, view.displayMode)}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-night-pink">{view.results!.tally[c.registrationId] ?? 0}</span>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}
    </div>
  );
}
