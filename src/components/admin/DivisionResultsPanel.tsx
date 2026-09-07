"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select, Input } from "@/components/ui/field";
import { RESULT_STATUS_LABELS } from "@/lib/competition-labels";
import { perfFetch } from "@/lib/performance-debug/client";

export type DivisionResultRow = {
  id: string;
  registrationId: string;
  role: "LEADER" | "FOLLOWER";
  displayName: string;
  bibNumber: string | null;
  status: "FINALIST" | "ELIMINATED";
  placement: number | null;
  publishedAt: string | null;
};

// Официальный протокол дивизиона (Этап 10, docs/00_DECISIONS.md) — черновик
// до "Рассчитать"/"Отправить на проверку", затем протокол (места публикуются
// вместе со всем соревнованием, см. CompetitionResultsPanel на уровне
// соревнования). Исправление строки — отдельная мини-форма с обязательной
// причиной (CLAUDE.md §29-30), доступна и до, и после публикации.
export function DivisionResultsPanel({
  divisionId,
  finalRoundCompleted,
  hasResults,
  reviewedAt,
  rows,
  canReview,
  canCorrect,
}: {
  divisionId: string;
  finalRoundCompleted: boolean;
  hasResults: boolean;
  reviewedAt: string | null;
  rows: DivisionResultRow[];
  canReview: boolean;
  canCorrect: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);

  async function calculate() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.calculate_results",
      `/api/divisions/${divisionId}/results/calculate`,
      { method: "POST" },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось рассчитать результаты.");
      return;
    }
    router.refresh();
  }

  async function review() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.review_results",
      `/api/divisions/${divisionId}/results/review`,
      { method: "POST" },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось отметить проверку.");
      return;
    }
    router.refresh();
  }

  if (!finalRoundCompleted) return null;

  return (
    <div className="rounded-app-sm border border-line p-3 mt-2 stack gap-2">
      <p className="m-0 font-semibold">Результаты категории</p>

      {!hasResults && (
        <Button type="button" size="sm" disabled={loading} onClick={calculate}>
          Рассчитать результаты
        </Button>
      )}

      {hasResults && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {(["LEADER", "FOLLOWER"] as const).map((role) => {
              const roleRows = rows
                .filter((r) => r.role === role)
                .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999));
              if (roleRows.length === 0) return null;
              return (
                <div key={role}>
                  <p className="hint-text m-0">{role === "LEADER" ? "Партнёры" : "Партнёрши"}</p>
                  <ul className="stack gap-0.5 m-0 pl-4">
                    {roleRows.map((r) => (
                      <li key={r.registrationId}>
                        {r.status === "FINALIST" ? `${r.placement ?? "—"} место` : RESULT_STATUS_LABELS[r.status]} — №
                        {r.bibNumber ?? "—"} {r.displayName}
                        {canCorrect && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setCorrecting(correcting === r.id ? null : r.id)}>
                            исправить
                          </Button>
                        )}
                        {canCorrect && r.status === "FINALIST" && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setSwapping(swapping === r.id ? null : r.id)}>
                            ⇄ поменять местами
                          </Button>
                        )}
                        {canCorrect && correcting === r.id && (
                          <CorrectResultForm
                            resultId={r.id}
                            initialStatus={r.status}
                            initialPlacement={r.placement}
                            onDone={() => {
                              setCorrecting(null);
                              router.refresh();
                            }}
                            onCancel={() => setCorrecting(null)}
                          />
                        )}
                        {canCorrect && swapping === r.id && (
                          <SwapResultForm
                            resultId={r.id}
                            otherFinalists={roleRows.filter((x) => x.id !== r.id && x.status === "FINALIST")}
                            onDone={() => {
                              setSwapping(null);
                              router.refresh();
                            }}
                            onCancel={() => setSwapping(null)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {!reviewedAt && canReview && (
            <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={review}>
              Отметить проверенным
            </Button>
          )}
          {reviewedAt && <p className="hint-text m-0">Проверено {new Date(reviewedAt).toLocaleString("ru-RU")}</p>}
        </>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

function CorrectResultForm({
  resultId,
  initialStatus,
  initialPlacement,
  onDone,
  onCancel,
}: {
  resultId: string;
  initialStatus: "FINALIST" | "ELIMINATED";
  initialPlacement: number | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"FINALIST" | "ELIMINATED">(initialStatus);
  const [placement, setPlacement] = useState(initialPlacement ? String(initialPlacement) : "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/results/${resultId}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        placement: status === "FINALIST" ? Number(placement) : null,
        reason,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить исправление.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-1.5 mt-1 pl-4 border-l border-line">
      <div className="flex flex-wrap gap-2">
        <Label>
          Статус
          <Select value={status} onChange={(e) => setStatus(e.target.value as "FINALIST" | "ELIMINATED")}>
            <option value="FINALIST">{RESULT_STATUS_LABELS.FINALIST}</option>
            <option value="ELIMINATED">{RESULT_STATUS_LABELS.ELIMINATED}</option>
          </Select>
        </Label>
        {status === "FINALIST" && (
          <Label>
            Место
            <Input type="number" min={1} value={placement} onChange={(e) => setPlacement(e.target.value)} />
          </Label>
        )}
      </div>
      <Label>
        Причина исправления
        <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </Label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={loading || !reason.trim() || (status === "FINALIST" && !placement)}>
          Сохранить исправление
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={onCancel}>
          Отмена
        </Button>
        {error && <span className="error-text">{error}</span>}
      </div>
    </form>
  );
}

// Обмен местами двух финалистов (results.ts, swapResultPlacements) — единый
// способ поменять двух местами: correctResult() по одному участнику теперь
// отказывает в уже занятом месте (найдено вживую 2026-09-08 — два участника
// оказались на одном месте после исправления по отдельности), обмен меняет
// обе строки одной транзакцией, дубликата места не бывает даже транзитно.
function SwapResultForm({
  resultId,
  otherFinalists,
  onDone,
  onCancel,
}: {
  resultId: string;
  otherFinalists: { id: string; displayName: string; bibNumber: string | null; placement: number | null }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [otherId, setOtherId] = useState(otherFinalists[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/results/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultIdA: resultId, resultIdB: otherId, reason }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось поменять местами.");
      return;
    }
    onDone();
  }

  if (otherFinalists.length === 0) {
    return <p className="hint-text mt-1 pl-4 border-l border-line">Больше не с кем меняться местами в этой роли.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-1.5 mt-1 pl-4 border-l border-line">
      <Label>
        Поменять местами с
        <Select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
          {otherFinalists.map((o) => (
            <option key={o.id} value={o.id}>
              {o.placement} место — №{o.bibNumber ?? "—"} {o.displayName}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        Причина обмена
        <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </Label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={loading || !reason.trim()}>
          Поменять местами
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={onCancel}>
          Отмена
        </Button>
        {error && <span className="error-text">{error}</span>}
      </div>
    </form>
  );
}
