"use client";

import { Fragment, type ReactNode, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HeatStatus, RegistrationRole, RoundStatus } from "@prisma/client";
import { setShallowQueryParams } from "@/lib/shallow-query";
import { HEAT_STATUS_LABELS, REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL, ROUND_STATUS_LABELS } from "@/lib/competition-labels";
import { categoryDotColor } from "../category-colors";
import { AddDrawHelperForm } from "../AddDrawHelperForm";
import { AddHeatButton } from "../AddHeatButton";
import { DeleteIconButton } from "../DeleteIconButton";
import { HeatStatusControls } from "../HeatStatusControls";
import { CheckCircleIcon, ChevronRightIcon, PersonIcon, TrophyIcon } from "../icons";
import { RemoveDrawHelperButton } from "../RemoveDrawHelperButton";
import { ReplaceDrawHelperButton } from "../ReplaceDrawHelperButton";
import { RerollDrawButton } from "../RerollDrawButton";
import { RotationPanel } from "../RotationPanel";
import { RoundStatusControls } from "../RoundStatusControls";
import { SplitHeatButton } from "../SplitHeatButton";
import { StartDrawingForm } from "../StartDrawingForm";
import { JudgesLivePanel } from "./JudgesLivePanel";
import { defaultCategoryId, defaultHeatId, defaultRoundId, hasActiveRound, resolveSelected } from "./selection";
import type { MonitorCategory, MonitorHeat, MonitorParticipant, MonitorRound } from "./types";

// Вкладка "Монитор" — единственное рабочее место организатора во время
// прогона (заменила вкладку "Раунды", 2026-09-09): категория → этап → заход,
// с номерами на паркете, жеребьёвкой, вызовом помощника и живым составом
// судей на одном экране.
//
// Здесь НЕТ ни одного бизнес-правила (CLAUDE.md §48): что можно нажать,
// решает сервер и уже посчитанные на нём флаги (canEditDraw, neededRole,
// hasRealImbalance), а сами действия выполняют те же компоненты, что и
// раньше. Монитор только выбирает, что показать, и раскладывает это.
//
// Данные обновляются НЕ опросом: заходы, жеребьёвка и статусы меняются
// только действиями самого организатора, а те уже делают router.refresh().
// Единственное, что меняется без его участия, — оценки судей: за ними
// следит JudgesLivePanel по своей подписке, а таймер паркета — RotationPanel.

const ROUND_STATUS_TONE: Record<RoundStatus, string> = {
  DRAFT: "bg-admin-disabled",
  READY: "bg-admin-disabled",
  DRAWING: "bg-admin-primaryHover",
  DRAW_LOCKED: "bg-admin-primaryHover",
  RUNNING: "bg-night-success",
  PAUSED: "bg-night-warning",
  FINISHED: "bg-admin-primaryHover",
  SCORING: "bg-night-warning",
  // Раньше совпадал с DRAFT/READY ("bg-admin-disabled") — пройденный этап
  // выглядел неотличимо от ещё не начатого (найдено по прямому запросу
  // пользователя, 2026-09-09: "если этап пройдёт, обозначить визуально").
  // В карточке этапа ниже COMPLETED вдобавок получает не точку, а галочку
  // (CheckCircleIcon) — форма отличается от "Идёт" (тоже зелёный, но точка),
  // а не только оттенок.
  COMPLETED: "bg-night-success",
};

const HEAT_STATUS_TONE: Record<HeatStatus, string> = {
  PENDING: "bg-admin-disabled",
  RUNNING: "bg-night-success",
  PAUSED: "bg-night-warning",
  FINISHED: "bg-admin-primaryHover",
};

// Синий — партнёры/ведущие, розовый — партнёрши/ведомые (по прямому запросу
// пользователя, 2026-09-09): один и тот же цвет для номера, полоски-акцента
// и иконки — единственное, что отличает стороны визуально, форма иконки
// намеренно одна и та же (см. PersonIcon). Литеральные строки классов (не
// собранные через template-string) — Tailwind ищет полные имена классов в
// исходном коде, интерполяция их не находит.
const ROLE_TEXT_CLASS: Record<RegistrationRole, string> = {
  LEADER: "text-[#60a5fa]",
  FOLLOWER: "text-[#f472b6]",
};
const ROLE_BG_CLASS: Record<RegistrationRole, string> = {
  LEADER: "bg-[#60a5fa]",
  FOLLOWER: "bg-[#f472b6]",
};

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-admin-card2 px-2.5 py-1 text-xs font-bold text-night-text">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function ParticipantRow({
  participant,
  heatId,
  role,
  canEditDraw,
}: {
  participant: MonitorParticipant;
  heatId: string;
  role: RegistrationRole;
  canEditDraw: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-app-sm px-2 py-1.5 transition-colors hover:bg-admin-card/70">
      <span
        className={`grid h-9 min-w-[48px] shrink-0 place-items-center rounded-app-sm border border-admin-border bg-admin-bg/70 text-base font-extrabold tabular-nums ${ROLE_TEXT_CLASS[role]}`}
      >
        {participant.bibNumber ?? "—"}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-night-text">{participant.displayName}</span>
        {/* Помощник обычно из другой категории — сразу видно, кого позвали. */}
        {participant.isHelper && participant.helperCategoryName && (
          <span className="truncate text-[11px] text-admin-disabled">{participant.helperCategoryName}</span>
        )}
      </span>
      {participant.isHelper && (
        <span className="shrink-0 rounded-full bg-night-warning/15 px-2 py-0.5 text-[10px] font-bold text-night-warning">помощник</span>
      )}
      {/* «Убрать» — ПЕРЕД «заменить» в разметке (по прямому запросу
          пользователя, 2026-09-09): flex-wrap переносит элемент на новую
          строку, только когда САМ не помещается, не трогая уже
          расположенные раньше него — «убрать» встаёт в общий ряд один раз и
          там и остаётся, даже когда раскрытая форма замены
          (ReplaceDrawHelperButton) занимает всю ширину следующей строки. Если
          поменять их местами, «убрать» после каждого клика на «заменить»
          уезжало бы вместе с раскрывшейся формой. */}
      {participant.isHelper && canEditDraw && (
        <>
          <RemoveDrawHelperButton participantId={participant.id} heatId={heatId} role={role} />
          <ReplaceDrawHelperButton heatId={heatId} participantId={participant.id} role={role} />
        </>
      )}
    </li>
  );
}

function SideColumn({
  heat,
  role,
  title,
  deficit,
  categoryName,
  categoryOrder,
  roundName,
}: {
  heat: MonitorHeat;
  role: RegistrationRole;
  title: string;
  deficit: number;
  categoryName: string;
  categoryOrder: number;
  roundName: string;
}) {
  const list = role === "LEADER" ? heat.leaders : heat.followers;
  const isNeeded = heat.neededRole === role;
  return (
    <div className="flex flex-col rounded-app border border-admin-border bg-admin-card2">
      <div className="flex items-center gap-2 border-b border-admin-border px-3.5 py-3">
        <span className={`h-4 w-[3px] shrink-0 rounded-sm ${ROLE_BG_CLASS[role]}`} aria-hidden="true" />
        <span className={ROLE_TEXT_CLASS[role]} aria-hidden="true">
          <PersonIcon />
        </span>
        <h4 className="m-0 text-[13px] font-extrabold uppercase tracking-wide text-night-text">{title}</h4>
        <span className={`ml-auto text-xl font-extrabold tabular-nums leading-none ${ROLE_TEXT_CLASS[role]}`}>{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="m-0 px-3.5 py-3 text-sm text-admin-muted">Пусто.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-2">
          {list.map((p) => (
            <ParticipantRow key={p.id} participant={p} heatId={heat.id} role={role} canEditDraw={heat.canEditDraw} />
          ))}
        </ul>
      )}
      <div
        className={`mt-auto flex flex-wrap items-center gap-2.5 border-t border-admin-border px-3.5 py-2.5 text-xs ${
          isNeeded ? "bg-night-warning/10" : ""
        }`}
      >
        {isNeeded ? (
          <span className="font-semibold text-night-warning">
            Не хватает: {deficit} {REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL[role]}
          </span>
        ) : (
          <span className="text-admin-muted">{heat.neededRole ? " " : "Стороны сходятся"}</span>
        )}
        {/* Кнопка вызова помощника — своя, в подвале ИМЕННО этой стороны (по
            прямому запросу пользователя, 2026-09-09 — раньше была одна общая
            под обеими колонками). Раскрытый список кандидатов теперь модалка
            (AddDrawHelperForm), поэтому ширина колонки ему больше не мешает. */}
        {isNeeded && heat.canEditDraw && (
          <span className="ml-auto">
            <AddDrawHelperForm
              heatId={heat.id}
              role={role}
              categoryName={categoryName}
              categoryOrder={categoryOrder}
              roundName={roundName}
              heatNumber={heat.number}
            />
          </span>
        )}
      </div>
    </div>
  );
}

function HeatPanel({
  heat,
  roundStatus,
  categoryName,
  categoryOrder,
  roundName,
  rotationSettingsPanel,
}: {
  heat: MonitorHeat;
  roundStatus: RoundStatus;
  categoryName: string;
  categoryOrder: number;
  roundName: string;
  rotationSettingsPanel: ReactNode;
}) {
  const deficit = Math.abs(heat.leaders.length - heat.followers.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-app border border-admin-border bg-admin-card2/60 px-4 py-3">
        <span className="text-sm font-bold text-night-text">Заход {heat.number}</span>
        <StatusPill label={HEAT_STATUS_LABELS[heat.status] ?? heat.status} tone={HEAT_STATUS_TONE[heat.status]} />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <HeatStatusControls heatId={heat.id} status={heat.status} roundStatus={roundStatus} />
          {heat.canDelete && (
            <DeleteIconButton
              url={`/api/heats/${heat.id}`}
              confirmMessage={`Удалить заход №${heat.number}? Отменить нельзя.`}
              label={`Удалить заход №${heat.number}`}
            />
          )}
        </span>
      </div>

      {heat.hasDraw ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SideColumn
              heat={heat}
              role="LEADER"
              title="Партнёры"
              deficit={deficit}
              categoryName={categoryName}
              categoryOrder={categoryOrder}
              roundName={roundName}
            />
            <SideColumn
              heat={heat}
              role="FOLLOWER"
              title="Партнёрши"
              deficit={deficit}
              categoryName={categoryName}
              categoryOrder={categoryOrder}
              roundName={roundName}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-app border border-admin-border bg-admin-card2 px-4 py-3">
            <div>
              <p className="m-0 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">Жеребьёвка захода</p>
              <p className="m-0 mt-1 text-xs tabular-nums text-admin-muted">
                версия <span className="font-bold text-night-text">{heat.drawVersion}</span>
                {heat.drawSeed && (
                  <>
                    {" · seed "}
                    <span className="font-mono text-[11.5px] text-admin-primaryHover">{heat.drawSeed}</span>
                  </>
                )}
              </p>
            </div>
            {heat.canEditDraw ? (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <RerollDrawButton heatId={heat.id} />
                {heat.hasRealImbalance && <SplitHeatButton heatId={heat.id} />}
              </span>
            ) : (
              <p className="m-0 ml-auto max-w-[340px] text-right text-[11.5px] text-admin-disabled">
                Жеребьёвку можно менять только пока идёт жеребьёвка раунда и заход ещё не запущен. Любое изменение
                попадает в журнал.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="m-0 rounded-app border border-dashed border-admin-border px-4 py-6 text-center text-sm text-admin-muted">
          Жеребьёвка для этого захода ещё не проведена.
        </p>
      )}

      {heat.status !== "PENDING" && <RotationPanel heatId={heat.id} settingsPanel={rotationSettingsPanel} />}
    </div>
  );
}

function AdvancementCard({ round }: { round: MonitorRound }) {
  const called = round.calledLeaders + round.calledFollowers;
  return (
    <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">
      <p className="m-0 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">
        {round.isFinalRound ? "Финал" : "Проходят дальше"}
      </p>
      {round.finalistsCount ? (
        <>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-admin-muted">
            Из {round.calledLeaders} партнёров и {round.calledFollowers} партнёрш этого этапа
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-app-sm border border-admin-border bg-admin-card2 px-3 py-2.5">
              <p className="m-0 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">Партнёров</p>
              <p className={`m-0 mt-1 text-[17px] font-extrabold tabular-nums ${ROLE_TEXT_CLASS.LEADER}`}>{round.finalistsCount}</p>
            </div>
            <div className="rounded-app-sm border border-admin-border bg-admin-card2 px-3 py-2.5">
              <p className="m-0 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">Партнёрш</p>
              <p className={`m-0 mt-1 text-[17px] font-extrabold tabular-nums ${ROLE_TEXT_CLASS.FOLLOWER}`}>{round.finalistsCount}</p>
            </div>
          </div>
          {/* CLAUDE.md §19: на границе отсева система не выбирает за судей. */}
          <p className="m-0 mt-3.5 rounded-app-sm border border-night-warning/30 bg-night-warning/[0.09] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#f8cf8d]">
            <span className="font-bold text-night-warning">Ничья на границе — перетанцовка.</span> Если на последнем
            проходящем месте окажется несколько участников, система не выберет за судей, а создаст дополнительный раунд.
          </p>
        </>
      ) : (
        <p className="m-0 mt-1.5 text-sm text-admin-muted">
          {round.isFinalRound
            ? "Финальный этап — дальше никто не проходит, определяются места."
            : "Число проходящих для этого этапа не задано."}
        </p>
      )}
      {called === 0 && <p className="m-0 mt-2 text-[11.5px] text-admin-disabled">Участники на паркет ещё не вызывались.</p>}
    </section>
  );
}

export function CompetitionMonitor({
  categories,
  canViewScoreMonitor,
  resultsPublishPanel,
}: {
  categories: MonitorCategory[];
  canViewScoreMonitor: boolean;
  // Публикация результатов ВСЕГО соревнования (не только текущей выбранной
  // категории, CompetitionResultsPanel.tsx) — переехала сюда, к протоколу
  // категории, с вкладки "Главная" по прямому запросу пользователя,
  // 2026-09-09 ("кнопка публикации там же, где смотрим результаты
  // категории"). Опционально — только у тех, у кого есть result:publish.
  resultsPublishPanel?: ReactNode;
}) {
  // Выбор категории/этапа/захода читается из URL один раз при монтировании
  // (та же query-строка, что и в ссылке "← Назад к соревнованию" со страницы
  // "Монитор оценок судей", 2026-09-09) — И каждый клик пишет обратно в адрес
  // (setShallowQueryParams, в обход роутера Next.js), чтобы F5 в любой точке
  // монитора возвращал на то же самое место (по прямому запросу пользователя,
  // 2026-09-09), а не на "что сейчас идёт" по умолчанию. history.replaceState
  // не идёт через Next.js router — переключение по-прежнему не стоит ни
  // одного лишнего запроса (см. комментарий у CompetitionWorkspaceTabs).
  const searchParams = useSearchParams();
  const fallbackCategoryId = defaultCategoryId(categories);
  const [categoryId, setCategoryId] = useState<string | null>(searchParams.get("category") ?? fallbackCategoryId);
  const [roundId, setRoundId] = useState<string | null>(searchParams.get("round"));
  const [heatId, setHeatId] = useState<string | null>(searchParams.get("heat"));
  // "Результаты" — не настоящий этап (не в category.rounds), а отдельный
  // режим просмотра этой же категории: протокол + оценки судей по
  // критериям финала, вместо сетки заходов (redesign 2026-09-09, по
  // запросу пользователя — "ещё один квадратик после Финала"). Отдельный
  // булев флаг, а не sentinel-значение roundId, — чтобы re-open обычного
  // этапа (selectRound) не приходилось нигде явно проверять на "не тот ли
  // это специальный id".
  const [showResults, setShowResults] = useState(searchParams.get("view") === "results");

  const category = resolveSelected(categories, categoryId, fallbackCategoryId);
  if (!category) return <p className="text-sm text-admin-muted">Категорий пока нет.</p>;

  const round = resolveSelected(category.rounds, roundId, defaultRoundId(category.rounds));
  const heat = round ? resolveSelected(round.heats, heatId, defaultHeatId(round.heats)) : null;

  function selectCategory(id: string) {
    setCategoryId(id);
    // Этап и заход принадлежат прежней категории — сбрасываем, чтобы
    // сработало то же правило "показать то, что идёт сейчас".
    setRoundId(null);
    setHeatId(null);
    setShowResults(false);
    setShallowQueryParams({ category: id, round: null, heat: null, view: null });
  }

  function selectRound(id: string) {
    setRoundId(id);
    setHeatId(null);
    setShowResults(false);
    setShallowQueryParams({ round: id, heat: null, view: null });
  }

  function selectResults() {
    setShowResults(true);
    setShallowQueryParams({ view: "results" });
  }

  function selectHeat(id: string) {
    setHeatId(id);
    setShallowQueryParams({ heat: id });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Категории ─────────────────────────────────────────── */}
      {categories.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto rounded-app border border-admin-border bg-admin-card/50 p-1.5" role="tablist" aria-label="Категории">
          {categories.map((c, i) => {
            const isActive = c.id === category.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectCategory(c.id)}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm border px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-admin-primary/40 bg-admin-primary/15 text-night-text"
                    : "border-transparent text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryDotColor(i) }} aria-hidden="true" />
                {c.name}
                {hasActiveRound(c.rounds) && <span className="text-[11px] font-bold text-night-success">идёт</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Этапы категории ───────────────────────────────────── */}
      {category.rounds.length === 0 ? (
        <div className="rounded-app border border-admin-border bg-admin-card p-5">
          <p className="m-0 text-sm text-admin-muted">
            У категории «{category.name}» ещё нет раундов.
            {category.stagePlanLabel ? ` План по этапам: ${category.stagePlanLabel}.` : " План по этапам не задан."}
          </p>
          <p className="m-0 mt-1 text-sm text-admin-muted">
            Партнёров: {category.registeredLeaders} ({category.checkedInLeaders} прошли check-in) · Партнёрш:{" "}
            {category.registeredFollowers} ({category.checkedInFollowers} прошли check-in)
          </p>
          {category.generateRounds && <div className="mt-3">{category.generateRounds}</div>}
        </div>
      ) : (
        // Горизонтальный ряд со скроллом (не grid, как раньше) — по прямому
        // запросу пользователя (2026-09-09): между этапами теперь стрелка
        // ("этап переходит в следующий"), а она осмысленна только в одну
        // строку — в grid карточки переносились на новую строку, и стрелка
        // между последней в строке и первой в следующей не имела бы смысла.
        <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-app border border-admin-border bg-admin-card/50 p-1.5" role="tablist" aria-label="Этапы категории">
          {category.rounds.map((r, i) => {
            const isActive = r.id === round?.id;
            const isCompleted = r.status === "COMPLETED";
            return (
              <Fragment key={r.id}>
                {i > 0 && (
                  <span className="flex shrink-0 items-center text-admin-disabled" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => selectRound(r.id)}
                  className={`flex min-w-[168px] shrink-0 flex-col gap-1.5 rounded-app border p-3.5 text-left transition-colors ${
                    isActive
                      ? "border-admin-primary bg-admin-primary/10"
                      : isCompleted
                        ? "border-night-success/30 bg-night-success/[0.07] hover:border-night-success/50"
                        : "border-admin-border bg-admin-card hover:border-admin-disabled"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {isCompleted ? (
                      <span className="shrink-0 text-night-success" aria-hidden="true">
                        <CheckCircleIcon />
                      </span>
                    ) : (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ROUND_STATUS_TONE[r.status]}`} aria-hidden="true" />
                    )}
                    <span className={`text-sm font-bold ${isActive || isCompleted ? "text-night-text" : "text-admin-muted"}`}>{r.name}</span>
                  </span>
                  <span className="text-xs tabular-nums text-admin-disabled">
                    {r.calledLeaders} / {r.calledFollowers}
                    {r.finalistsCount ? ` · проходят ${r.finalistsCount} пар` : ""}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold uppercase tracking-wide ${isCompleted ? "text-night-success" : "text-admin-disabled"}`}
                  >
                    {ROUND_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </button>
              </Fragment>
            );
          })}

          {/* "Ещё один квадратик после Финала" (по запросу пользователя,
              2026-09-09) — не настоящий этап, отдельный режим просмотра
              category.results/finalResultsTable ниже (см. selectResults). */}
          {category.resultsAvailable && (
            <Fragment>
              {category.rounds.length > 0 && (
                <span className="flex shrink-0 items-center text-admin-disabled" aria-hidden="true">
                  <ChevronRightIcon />
                </span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={showResults}
                onClick={selectResults}
                className={`flex min-w-[168px] shrink-0 flex-col gap-1.5 rounded-app border p-3.5 text-left transition-colors ${
                  showResults
                    ? "border-admin-violet bg-admin-violet/10"
                    : "border-admin-violet/30 bg-admin-violet/[0.07] hover:border-admin-violet/50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="shrink-0 text-admin-violet" aria-hidden="true">
                    <TrophyIcon />
                  </span>
                  <span className="text-sm font-bold text-night-text">Результаты</span>
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-wide text-admin-violet">Протокол и оценки</span>
              </button>
            </Fragment>
          )}
        </div>
      )}

      {/* ── Результаты категории ──────────────────────────────── */}
      {/* Отдельный режим просмотра вместо сетки заходов — протокол
          (DivisionResultsPanel), оценки судей по критериям финала
          (FinalResultsTable) и публикация результатов всего соревнования
          (resultsPublishPanel), все уже на admin-* палитре, вместе на одном
          тёмном экране (redesign 2026-09-09). key={category.id} — та же
          причина, что и раньше: смена категории не должна тащить за собой
          открытую форму "исправить"/её error от прошлой категории. */}
      {showResults && category.resultsAvailable && (
        <Fragment key={category.id}>
          <div className="flex flex-col gap-4">
            {category.finalResultsTable && (
              <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">
                <h3 className="m-0 mb-3 text-sm font-extrabold text-night-text">Оценки судей по критериям (финал)</h3>
                {category.finalResultsTable}
              </section>
            )}
            {category.results}
            {resultsPublishPanel}
          </div>
        </Fragment>
      )}

      {/* ── Выбранный этап ────────────────────────────────────── */}
      {!showResults && round && (
        // key={round.id} — при смене раунда React иначе переиспользует те же
        // экземпляры компонентов (RoundStatusControls/GenerateRoundsButton и
        // всё вложенное в HeatPanel) на новом месте дерева и тащит за собой их
        // локальный error/loading — ошибка от раунда №2 продолжала
        // показываться после переключения на раунд №1 (найдено вживую, со
        // скриншотом, 2026-09-09). key меняет "личность" поддерева — React
        // размонтирует старое и создаёт всё заново с чистым состоянием.
        <div key={round.id} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="overflow-hidden rounded-app border border-admin-border bg-admin-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-admin-border px-[18px] py-4">
                <h3 className="m-0 text-base font-extrabold text-night-text">{round.name}</h3>
                <StatusPill label={ROUND_STATUS_LABELS[round.status] ?? round.status} tone={ROUND_STATUS_TONE[round.status]} />
                <span className="rounded-full border border-admin-border px-2.5 py-1 text-xs font-semibold text-admin-muted">
                  Судейство: <span className="text-night-text">{round.judgingMethodLabel}</span>
                </span>
                {round.finalFormatLabel && (
                  <span className="rounded-full border border-admin-border px-2.5 py-1 text-xs font-semibold text-admin-muted">
                    Финал: <span className="text-night-text">{round.finalFormatLabel}</span>
                  </span>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <RoundStatusControls roundId={round.id} status={round.status} />
                  {/* "Перегенерировать раунды" — категория целиком, не этот
                      конкретный раунд, но по прямому запросу пользователя
                      (2026-09-09) стоит здесь же, рядом с "Зафиксировать
                      жеребьёвку" — сервер сам отклонит, если хоть один раунд
                      категории уже начат, отдельный "режим подтверждения"
                      уже встроен в саму кнопку. */}
                  {category.generateRounds}
                </span>
              </div>

              <div className="p-[18px]">
                {round.showsHeats ? (
                  <div className="flex flex-col gap-4">
                    {/* "+ Заход" — справа от списка заходов (по прямому запросу
                        пользователя, 2026-09-09), в той же строке-полоске, что
                        и сами вкладки заходов; показывается, даже если заходов
                        ещё 0 или 1 (тогда сама полоска состоит из одной этой
                        кнопки). */}
                    {(round.heats.length > 1 || round.canAddHeat) && (
                      <div className="flex items-center gap-1.5 overflow-x-auto rounded-app-sm bg-admin-card2/50 p-1.5" role="tablist" aria-label="Заходы">
                        {round.heats.length > 1 &&
                          round.heats.map((h) => {
                            const isActive = h.id === heat?.id;
                            return (
                              <button
                                key={h.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => selectHeat(h.id)}
                                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-app-sm px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                                  isActive ? "bg-admin-primary text-white" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-white" : HEAT_STATUS_TONE[h.status]}`}
                                  aria-hidden="true"
                                />
                                Заход {h.number}
                                <span className="text-[11.5px] tabular-nums opacity-75">
                                  {h.leaders.length} / {h.followers.length}
                                </span>
                              </button>
                            );
                          })}
                        {round.canAddHeat && (
                          <span className="ml-auto shrink-0">
                            <AddHeatButton roundId={round.id} />
                          </span>
                        )}
                      </div>
                    )}
                    {round.heats.length === 0 ? (
                      <p className="m-0 text-sm text-admin-muted">Заходов пока нет.</p>
                    ) : (
                      heat && (
                        // key={heat.id} — та же причина, что у key={round.id}
                        // выше, только для переключения между заходами внутри
                        // одного раунда (сам сценарий со скриншота
                        // пользователя): HeatStatusControls/RerollDrawButton/
                        // SplitHeatButton/AddDrawHelperForm/RotationPanel
                        // иначе не размонтируются при смене захода.
                        <HeatPanel
                          key={heat.id}
                          heat={heat}
                          roundStatus={round.status}
                          categoryName={category.name}
                          categoryOrder={category.order}
                          roundName={round.name}
                          rotationSettingsPanel={category.rotationSettingsPanel}
                        />
                      )
                    )}
                  </div>
                ) : (
                  <p className="m-0 text-sm text-admin-muted">
                    Этот формат финала не использует обычную жеребьёвку — заходами управляет панель ниже.
                  </p>
                )}

                {round.showStartDrawing && (
                  <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-admin-border pt-4">
                    <StartDrawingForm roundId={round.id} />
                  </div>
                )}
              </div>
            </section>

            {/* Панели этапа (старт финала, форматы финала, подсчёт, решения по
                ничьей, протоколы) — переведены на admin-* вместе с остальным
                монитором (redesign 2026-09-09, по прямому запросу
                пользователя со скриншотом: раньше это была единственная
                светлая "text-ink" поверхность на всей странице). */}
            {round.panels.length > 0 && (
              <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">
                <div className="flex flex-col gap-3">
                  {round.panels.map((panel, i) => (
                    <div key={i}>{panel}</div>
                  ))}
                </div>
              </section>
            )}

            {/* Уже на admin-* палитре — отдельно от светлых panels выше
                (см. комментарий у advancementPublishPanel в types.ts). */}
            {round.advancementPublishPanel && (
              <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">{round.advancementPublishPanel}</section>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <AdvancementCard round={round} />
            <JudgesLivePanel
              roundId={round.id}
              roundStatus={round.status}
              leaders={category.judges.leaders}
              followers={category.judges.followers}
              canViewLive={canViewScoreMonitor}
              scoreMonitorHref={round.scoreMonitorHref}
            />
          </aside>
        </div>
      )}

    </div>
  );
}
