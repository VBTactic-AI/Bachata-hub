"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";

type Status = "IDLE" | "RUNNING" | "CLOSED" | "PUBLISHED";
type View = { status: Status; closesAt: string | null } | null;

const POLL_MS = 4000;

const STATUS_LABEL: Record<Status, string> = {
  IDLE: "Не запущено",
  RUNNING: "Идёт",
  CLOSED: "Закрыто — ждёт решения",
  PUBLISHED: "Опубликовано",
};

// Кнопка запуска/остановки приза зрительских симпатий прямо во вкладке
// "Монитор" (2026-09-12, по прямому запросу пользователя) — organiser не
// должен переключаться на вкладку "Голосование" ради самого частого во время
// живого этапа действия. Стиль кнопок — тот же, что уже используется в
// полной панели (AudienceVotePanel.tsx, "выделить как сейчас"): variant
// "admin" для старта, "adminOutline" для стопа. Настройка (режим/текст) и
// решения после закрытия (подтвердить победителя/опубликовать) — по-прежнему
// только на вкладке "Голосование", здесь их сознательно нет — это именно
// "быстрая кнопка", не дублирование всей панели.
export function AudienceVoteQuickControl({
  divisionId,
  competitionId,
  canManage,
}: {
  divisionId: string;
  competitionId: string;
  canManage: boolean;
}) {
  const [view, setView] = useState<View | undefined>(undefined); // undefined — ещё грузится
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/divisions/${divisionId}/audience-vote`);
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        setError(data.error || "Не удалось загрузить голосование.");
        return;
      }
      setError(null);
      setView(data.view ? { status: data.view.status, closesAt: data.view.closesAt } : null);
    } catch {
      if (mountedRef.current) setError("Не удалось связаться с сервером.");
    }
  }, [divisionId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (view?.status !== "RUNNING") return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [view?.status, load]);

  async function call(path: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}/audience-vote${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось выполнить действие.");
      return;
    }
    await load();
  }

  if (!canManage) return null;
  if (view === undefined) {
    // Загрузка ещё не завершилась — рендерим только реальную ошибку (не
    // "Загрузка…", чтобы не мигать ею на каждом рендере монитора), если она
    // уже есть; иначе тихо ничего не показываем до первого ответа сервера.
    return error ? <p className="m-0 text-xs text-red-400">{error}</p> : null;
  }

  const votingHref = `/admin/competitions/${competitionId}?tab=voting`;

  if (view === null) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-app border border-admin-border bg-admin-card/50 px-4 py-2.5 text-sm">
        <span className="font-semibold text-night-text">Приз зрительских симпатий:</span>
        <span className="text-admin-muted">не настроен для этой категории</span>
        <Link href={votingHref} className="ml-auto text-sm font-semibold text-admin-primaryHover no-underline hover:no-underline">
          Настроить →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-app border border-admin-border bg-admin-card/50 px-4 py-2.5 text-sm">
      <span className="font-semibold text-night-text">Приз зрительских симпатий:</span>
      <StatusBadge
        label={STATUS_LABEL[view.status]}
        variant={view.status === "RUNNING" ? "success" : view.status === "PUBLISHED" ? "success" : view.status === "CLOSED" ? "warning" : "neutral"}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {view.status === "IDLE" && (
          <Button type="button" size="sm" variant="admin" disabled={busy} onClick={() => call("/start")}>
            Начать голосование
          </Button>
        )}
        {view.status === "RUNNING" && (
          <Button type="button" size="sm" variant="adminOutline" disabled={busy} onClick={() => call("/stop")}>
            Остановить голосование
          </Button>
        )}
        {(view.status === "CLOSED" || view.status === "PUBLISHED") && (
          <Link href={votingHref} className="text-sm font-semibold text-admin-primaryHover no-underline hover:no-underline">
            Перейти к результатам →
          </Link>
        )}
      </span>
    </div>
  );
}
