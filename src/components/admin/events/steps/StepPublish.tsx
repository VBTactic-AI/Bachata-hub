"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CheckCircleIcon, AlertIcon } from "@/components/admin/icons";
import type { ChecklistItem } from "@/lib/events/event-type-registry";
import { cn } from "@/lib/cn";

const CHECKBOX_ROW =
  "flex cursor-pointer items-start gap-2.5 rounded-app-sm border p-3 transition-colors";

function OptionCheckbox({
  checked,
  onChange,
  title,
  description,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className={cn(CHECKBOX_ROW, checked ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2 hover:border-admin-primary/50")}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-admin-border accent-admin-primary"
        />
        <span>
          <span className="block text-sm font-bold text-night-text">{title}</span>
          <span className="block text-xs text-admin-muted">{description}</span>
        </span>
      </label>
      {checked && children && <div className="mt-2 pl-1">{children}</div>}
    </div>
  );
}

// STEP "Publish" — EventPublishChecklist из задачи: явный список готово/не
// готово, кнопка PUBLISH EVENT недоступна, пока обязательные пункты не
// выполнены (сервер проверяет то же самое ещё раз, event-service.ts —
// CLAUDE.md §19, фронт не источник истины).
//
// Recurring Events v2 (по прямому запросу пользователя) — "Дополнительно":
// две независимые опции, НЕ отдельные формы создания шаблона/серии. Если
// "Сделать регулярным" отмечено, ОПУБЛИКОВАТЬ дальше не редиректит на
// страницу события, а открывает добавленный шаг "Повторение" (см.
// EventWizard.tsx) — публикация уже произошла, серия донастраивается сразу
// следом, не второй отдельной операцией где-то ещё.
export function StepPublish({
  checklist,
  complete,
  willAutoApprove,
  isCompetition,
  competitionId,
  saving,
  onPublish,
  makeTemplate,
  onChangeMakeTemplate,
  templateName,
  onChangeTemplateName,
  makeRecurring,
  onChangeMakeRecurring,
  alreadyInSeries,
}: {
  checklist: ChecklistItem[];
  complete: boolean;
  willAutoApprove: boolean;
  isCompetition: boolean;
  competitionId: string | null;
  saving: boolean;
  onPublish: () => void;
  makeTemplate: boolean;
  onChangeMakeTemplate: (v: boolean) => void;
  templateName: string;
  onChangeTemplateName: (v: string) => void;
  makeRecurring: boolean;
  onChangeMakeRecurring: (v: boolean) => void;
  // Событие уже сделано регулярным ранее (пришли назад в мастер после
  // "Повторение") — повторно предлагать эту опцию нечего, она одноразовая.
  alreadyInSeries: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-4">
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

      {/* Абзацы намеренно не растягиваются на всю ширину колонки (в отличие
          от остального контента шага) — длинная строка текста на всю ширину
          читается хуже, max-w-prose ограничивает её комфортной длиной. */}
      <p className="m-0 max-w-prose text-sm text-admin-muted">
        {willAutoApprove
          ? "Событие появится в календаре сразу — модерация не требуется для вашей школы/роли."
          : "Событие появится в календаре после проверки модератором."}
      </p>

      {isCompetition && (
        <p className="m-0 max-w-prose text-sm text-admin-muted">
          После публикации категории, раунды, судьи и результаты соревнования настраиваются на отдельной странице соревнования.
        </p>
      )}

      {!isCompetition && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-admin-muted">Дополнительно</p>

          <OptionCheckbox
            checked={makeTemplate}
            onChange={onChangeMakeTemplate}
            title="Сохранить как шаблон"
            description="Появится в «Шаблонах событий» — быстрый старт для похожих событий позже"
          >
            <Input
              value={templateName}
              onChange={(e) => onChangeTemplateName(e.target.value)}
              placeholder="Название шаблона (по умолчанию — название события)"
              className="border-admin-border bg-admin-card text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
            />
          </OptionCheckbox>

          {alreadyInSeries ? (
            <div className={cn(CHECKBOX_ROW, "border-admin-border bg-admin-card2 opacity-70")}>
              <span className="mt-0.5 text-admin-primary">
                <CheckCircleIcon />
              </span>
              <span>
                <span className="block text-sm font-bold text-night-text">Уже регулярное</span>
                <span className="block text-xs text-admin-muted">Это событие — часть серии. Настройки повторения — на карточке серии.</span>
              </span>
            </div>
          ) : (
            <OptionCheckbox
              checked={makeRecurring}
              onChange={onChangeMakeRecurring}
              title="Сделать регулярным"
              description="Событие станет первым в серии — дальше появится ещё один шаг для настройки повторения"
            />
          )}
        </div>
      )}

      <Button type="button" variant="admin" disabled={!complete || saving} onClick={onPublish}>
        {saving ? "…" : makeRecurring && !alreadyInSeries ? "ОПУБЛИКОВАТЬ И ДАЛЕЕ →" : "ОПУБЛИКОВАТЬ"}
      </Button>

      {isCompetition && competitionId && (
        <Link href={`/admin/competitions/${competitionId}`} className="text-sm text-admin-primary hover:underline">
          Открыть страницу соревнования →
        </Link>
      )}
    </div>
  );
}
