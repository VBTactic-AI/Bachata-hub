"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select, Input } from "@/components/ui/field";
import { RESULT_STATUS_LABELS } from "@/lib/competition-labels";
import { perfFetch } from "@/lib/performance-debug/client";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
// Синий/розовый — те же роль-цвета, что и в остальном "Мониторе"
// (CompetitionMonitor.tsx, ROLE_TEXT_CLASS) — литеральные классы, не
// интерполяция (Tailwind ищет полные имена классов в исходном коде).
const ROLE_TEXT_CLASS: Record<"LEADER" | "FOLLOWER", string> = {
  LEADER: "text-[#60a5fa]",
  FOLLOWER: "text-[#f472b6]",
};

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

  // Виден только когда финальный раунд категории завершён — до этого
  // рассчитывать нечего, а держать пустую карточку на виду весь прогон не
  // нужно (по прямому запросу пользователя, 2026-09-09).
  if (!finalRoundCompleted) return null;

  return (
    <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-sm font-extrabold text-night-text">Результаты категории</h3>
        {hasResults && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              reviewedAt ? "bg-night-success/15 text-night-success" : "bg-night-warning/15 text-night-warning"
            }`}
          >
            {reviewedAt ? "Проверено" : "Черновик"}
          </span>
        )}
      </div>

      {!hasResults && (
        <Button type="button" size="sm" variant="admin" className="mt-3" disabled={loading} onClick={calculate}>
          Рассчитать результаты
        </Button>
      )}

      {hasResults && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["LEADER", "FOLLOWER"] as const).map((role) => {
              const roleRows = rows
                .filter((r) => r.role === role)
                .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999));
              if (roleRows.length === 0) return null;
              return (
                <div key={role} className="overflow-hidden rounded-app-sm border border-admin-border bg-admin-card2">
                  <p className={`m-0 border-b border-admin-border px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider ${ROLE_TEXT_CLASS[role]}`}>
                    {role === "LEADER" ? "Партнёры" : "Партнёрши"}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-2">
                    {roleRows.map((r) => (
                      <li key={r.registrationId} className="flex flex-col gap-1 rounded-app-sm px-2 py-1.5 transition-colors hover:bg-admin-card/70">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-9 shrink-0 text-right text-sm font-extrabold tabular-nums ${ROLE_TEXT_CLASS[role]}`}>
                            {r.status === "FINALIST" ? (r.placement ?? "—") : "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-night-text">
                            №{r.bibNumber ?? "—"} {r.displayName}
                          </span>
                          {r.status !== "FINALIST" && <span className="shrink-0 text-xs text-admin-disabled">{RESULT_STATUS_LABELS[r.status]}</span>}
                        </div>
                        {canCorrect && (
                          <div className="flex items-center gap-3 pl-[46px] text-xs">
                            <button type="button" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setCorrecting(correcting === r.id ? null : r.id)}>
                              исправить
                            </button>
                            {r.status === "FINALIST" && (
                              <button type="button" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setSwapping(swapping === r.id ? null : r.id)}>
                                ⇄ поменять местами
                              </button>
                            )}
                          </div>
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
            <Button type="button" size="sm" variant="admin" className="mt-3" disabled={loading} onClick={review}>
              Отметить проверенным
            </Button>
          )}
          {reviewedAt && <p className="m-0 mt-3 text-sm text-admin-muted">Проверено {new Date(reviewedAt).toLocaleString("ru-RU")}</p>}
        </>
      )}
      {error && <p className="m-0 mt-2 text-sm text-red-400">{error}</p>}
    </section>
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
    <form onSubmit={onSubmit} className="ml-[46px] mt-1 flex flex-col gap-2 rounded-app-sm border border-admin-border bg-admin-card p-2.5">
      <div className="flex flex-wrap gap-2">
        <Label className="text-night-text">
          Статус
          <Select value={status} onChange={(e) => setStatus(e.target.value as "FINALIST" | "ELIMINATED")} className={FIELD_CLASS}>
            <option value="FINALIST">{RESULT_STATUS_LABELS.FINALIST}</option>
            <option value="ELIMINATED">{RESULT_STATUS_LABELS.ELIMINATED}</option>
          </Select>
        </Label>
        {status === "FINALIST" && (
          <Label className="text-night-text">
            Место
            <Input type="number" min={1} value={placement} onChange={(e) => setPlacement(e.target.value)} className={`${FIELD_CLASS} w-20`} />
          </Label>
        )}
      </div>
      <Label className="text-night-text">
        Причина исправления
        <Input value={reason} onChange={(e) => setReason(e.target.value)} required className={FIELD_CLASS} />
      </Label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="admin" disabled={loading || !reason.trim() || (status === "FINALIST" && !placement)}>
          Сохранить исправление
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" disabled={loading} onClick={onCancel}>
          Отмена
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
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
    return <p className="ml-[46px] mt-1 text-sm text-admin-muted">Больше не с кем меняться местами в этой роли.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="ml-[46px] mt-1 flex flex-col gap-2 rounded-app-sm border border-admin-border bg-admin-card p-2.5">
      <Label className="text-night-text">
        Поменять местами с
        <Select value={otherId} onChange={(e) => setOtherId(e.target.value)} className={FIELD_CLASS}>
          {otherFinalists.map((o) => (
            <option key={o.id} value={o.id}>
              {o.placement} место — №{o.bibNumber ?? "—"} {o.displayName}
            </option>
          ))}
        </Select>
      </Label>
      <Label className="text-night-text">
        Причина обмена
        <Input value={reason} onChange={(e) => setReason(e.target.value)} required className={FIELD_CLASS} />
      </Label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="admin" disabled={loading || !reason.trim()}>
          Поменять местами
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" disabled={loading} onClick={onCancel}>
          Отмена
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </form>
  );
}
