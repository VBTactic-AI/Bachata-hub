"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

// Физическое удаление соревнования целиком — необратимо и затрагивает все
// его данные (регистрации/раунды/жеребьёвки/оценки), поэтому подтверждение
// строже, чем обычный window.confirm() у DeleteIconButton: нужно набрать
// точное название соревнования (тот же приём, что у GitHub при удалении
// репозитория) плюс обязательную причину (CLAUDE.md §28, как и у "Пересобрать
// жеребьёвку"). Кнопка видна только тем, у кого есть competition:delete —
// по сиду это исключительно SUPER_ADMIN (по прямому запросу пользователя,
// 2026-09-09), родитель (page.tsx) не рендерит компонент вовсе без этого
// права, здесь дополнительной проверки нет.
export function DeleteCompetitionButton({
  competitionId,
  competitionName,
  divisionsCount,
  registrationsCount,
  disabledReason,
}: {
  competitionId: string;
  competitionName: string;
  divisionsCount: number;
  registrationsCount: number;
  // Не null — сервер (deleteCompetition) всё равно отклонит запрос для
  // PUBLISHED/ARCHIVED, но известно это и раньше, на сервере же, где строится
  // страница — не открывать форму заранее, чем заставлять админа набрать имя
  // и причину и только тогда узнать, что удалить нельзя.
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const nameMatches = confirmName === competitionName;

  async function submit() {
    if (!nameMatches || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/competitions/${competitionId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSubmitting(false);
      setError(data.error || "Не удалось удалить соревнование.");
      return;
    }
    // Страницы этого соревнования больше не существует — на неё, а не
    // router.refresh() (который бы попытался перезагрузить уже удалённые
    // данные и получить 404).
    router.push("/admin/competitions");
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="adminOutline"
          disabled={!!disabledReason}
          className="border-red-400/50 bg-red-400/10 text-red-400 hover:border-red-400 hover:bg-red-400/15 hover:text-red-400 disabled:hover:bg-red-400/10"
          onClick={() => setOpen(true)}
        >
          Удалить соревнование
        </Button>
        {disabledReason && <span className="text-xs text-admin-muted">{disabledReason}</span>}
      </div>

      {open && !disabledReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setOpen(false)} role="presentation">
          <div
            className="flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden rounded-app border border-red-400/40 bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-competition-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="delete-competition-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Удалить «{competitionName}»?
              </h3>
              <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-admin-muted">
                Необратимо удалит соревнование и все его данные: {divisionsCount} категорий, {registrationsCount}{" "}
                регистраций, раунды, жеребьёвки, оценки судей. История аудита (кто что делал) сохранится, но сами
                данные соревнования будут стёрты навсегда.
              </p>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-night-text">
                Введите название соревнования, чтобы подтвердить
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={competitionName}
                  className="border-admin-border bg-admin-card2 text-sm text-night-text focus:border-red-400 focus:ring-red-400/20"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-night-text">
                Причина удаления
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Например: тестовое соревнование, создано по ошибке"
                  className="border-admin-border bg-admin-card2 text-sm text-night-text focus:border-red-400 focus:ring-red-400/20"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-admin-border px-5 py-4">
              {error && <span className="text-xs text-red-400">{error}</span>}
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-night-text" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={submitting || !nameMatches || !reason.trim()}
                  onClick={submit}
                  className="border-none bg-red-400 text-white hover:brightness-95"
                >
                  Удалить навсегда
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
