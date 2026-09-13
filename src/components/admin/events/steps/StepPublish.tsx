"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, AlertIcon } from "@/components/admin/icons";
import type { ChecklistItem } from "@/lib/events/event-type-registry";
import { cn } from "@/lib/cn";

// STEP "Publish" — EventPublishChecklist из задачи: явный список готово/не
// готово, кнопка PUBLISH EVENT недоступна, пока обязательные пункты не
// выполнены (сервер проверяет то же самое ещё раз, event-service.ts —
// CLAUDE.md §19, фронт не источник истины).
export function StepPublish({
  checklist,
  complete,
  willAutoApprove,
  isCompetition,
  competitionId,
  saving,
  onPublish,
}: {
  checklist: ChecklistItem[];
  complete: boolean;
  willAutoApprove: boolean;
  isCompetition: boolean;
  competitionId: string | null;
  saving: boolean;
  onPublish: () => void;
}) {
  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Публикация</h2>

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {checklist.map((item) => (
          <li key={item.id} className={cn("flex items-center gap-2 text-sm", item.ok ? "text-night-text" : "text-admin-muted")}>
            {item.ok ? (
              <span className="text-admin-primary">
                <CheckCircleIcon />
              </span>
            ) : (
              <span className="text-red-400">
                <AlertIcon />
              </span>
            )}
            {item.label}
          </li>
        ))}
      </ul>

      <p className="m-0 text-sm text-admin-muted">
        {willAutoApprove
          ? "Событие появится в календаре сразу — модерация не требуется для вашей школы/роли."
          : "Событие появится в календаре после проверки модератором."}
      </p>

      {isCompetition && (
        <p className="m-0 text-sm text-admin-muted">
          После публикации категории, раунды, судьи и результаты соревнования настраиваются на отдельной странице соревнования.
        </p>
      )}

      <Button type="button" variant="admin" disabled={!complete || saving} onClick={onPublish}>
        {saving ? "…" : "ОПУБЛИКОВАТЬ"}
      </Button>

      {isCompetition && competitionId && (
        <Link href={`/admin/competitions/${competitionId}`} className="text-sm text-admin-primary hover:underline">
          Открыть страницу соревнования →
        </Link>
      )}
    </div>
  );
}
