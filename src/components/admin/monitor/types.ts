import type { ReactNode } from "react";
import type { HeatStatus, RegistrationRole, RoundStatus } from "@prisma/client";

// Модель данных вкладки "Монитор" — единственного места, где организатор
// ведёт живое соревнование (заменила вкладку "Раунды", 2026-09-09).
//
// Разделение намеренное: всё, что монитор рисует САМ (категории, этапы,
// заходы, номера участников, счётчики), приходит обычными сериализуемыми
// данными, а редкие тяжёлые панели, которые монитор только размещает
// (финал, перетанцовки, протоколы, настройки категории), приходят уже
// отрендеренными на сервере узлами (ReactNode). Так монитор не дублирует
// ни одной строки бизнес-логики (CLAUDE.md §48) и не заставляет page.tsx
// заново собирать то, что там уже собрано.

export type MonitorParticipant = {
  // DrawParticipant.id — им же адресуются кнопки помощника.
  id: string;
  bibNumber: string | null;
  displayName: string;
  // scored=false — помощник, вызванный дотанцевать; его не оценивают.
  isHelper: boolean;
  // Помощник обычно из другой категории — показываем, из какой именно.
  helperCategoryName: string | null;
};

export type MonitorHeat = {
  id: string;
  number: number;
  status: HeatStatus;
  leaders: MonitorParticipant[];
  followers: MonitorParticipant[];
  hasDraw: boolean;
  // Версия и seed действующей жеребьёвки — воспроизводимость выборки должна
  // быть видна организатору на том же экране, где он её пересобирает
  // (CLAUDE.md §6), а не только в журнале.
  drawVersion: number | null;
  drawSeed: string | null;
  // Те же условия, что были на вкладке "Раунды": жеребьёвку можно править
  // только пока раунд в DRAWING, заход ещё не запущен и список уже создан.
  canEditDraw: boolean;
  // Какой стороны не хватает — определяется по факту, а не выбором
  // организатора (docs/00_DECISIONS.md, 2026-09-04). null — сходится.
  neededRole: RegistrationRole | null;
  // Дисбаланс среди РЕАЛЬНЫХ участников (без помощников) — условие для
  // "Разбить на 2 выхода".
  hasRealImbalance: boolean;
  // Заход можно удалить только пока он PENDING и для него ЕЩЁ НЕТ
  // жеребьёвки (create-heat.ts, deleteHeat) — узкая, безопасная область:
  // не даёт молча убрать из раунда уже вызванных участников.
  canDelete: boolean;
};

export type MonitorRound = {
  id: string;
  name: string;
  status: RoundStatus;
  finalistsCount: number | null;
  isFinalRound: boolean;
  isTieBreak: boolean;
  // Метод судейства этого раунда — "снимок" на момент создания раунда
  // (Round.judgingMaxScore не меняется задним числом, CLAUDE.md §50), не
  // текущая настройка категории. Для финального раунда дополнительно формат
  // финала (настройка категории — сам формат раунда не хранит его отдельно).
  judgingMethodLabel: string;
  finalFormatLabel: string | null;
  // JUDGES_DANCE/RANDOM_COUPLES не используют Draw Engine — заходами
  // управляют собственные панели, обычную сетку заходов не показываем.
  showsHeats: boolean;
  canAddHeat: boolean;
  showStartDrawing: boolean;
  scoreMonitorHref: string | null;
  // Прямая ссылка на вкладку "Результаты" (ResultsWorkspace.tsx), сразу на
  // эту категорию и этот этап — тот же список "прошёл/не прошёл", что и в
  // panels ниже, но по всем этапам категории сразу и без остального
  // Монитора (для SUPER_ADMIN/EVENT_ADMIN, которым нужно быстро свериться,
  // не листая заходы).
  roundResultsHref: string;
  // Сколько реальных (scored) участников вызвано в раунде — база для
  // карточки "проходят дальше".
  calledLeaders: number;
  calledFollowers: number;
  heats: MonitorHeat[];
  // Всё, что специфично для конкретного раунда и уже собрано на сервере:
  // старт финала, панели форматов финала, прогресс подсчёта, формы решения
  // по ничьей, таблицы результатов. Массив, а не один узел: пустой список —
  // единственный надёжный способ понять "панелей нет" и не нарисовать
  // пустую рамку (содержимое ReactNode на пустоту не проверить).
  //
  // Рендерится монитором в общей тёмной рамке (admin-*, CLAUDE.md §64) —
  // отдельная секция от advancementPublishPanel ниже просто потому, что тот
  // публикуется независимо от остальных панелей раунда, а не из-за разницы
  // палитр (обе уже на admin-*, redesign 2026-09-09).
  panels: ReactNode[];
  // Публикация списка "кто прошёл дальше" ЭТОГО раунда
  // (RoundAdvancementPublish) — уже на admin-* палитре (redesign
  // 2026-09-09), поэтому рендерится монитором в своей отдельной тёмной
  // секции, а не смешивается со светлыми panels выше.
  advancementPublishPanel: ReactNode | null;
};

export type MonitorJudge = {
  judgeAssignmentId: string;
  judgeUserId: string;
  displayName: string;
};

export type MonitorCategory = {
  id: string;
  name: string;
  // DivisionCategory.order — нужен модалке вызова помощника, чтобы подписать
  // группы кандидатов "категория выше"/"категория ниже" относительно ЭТОЙ
  // категории (draw-helper-candidates.ts возвращает категорию каждой группы
  // с её собственным order, сравнение — на клиенте, без нового запроса).
  order: number;
  registeredLeaders: number;
  registeredFollowers: number;
  checkedInLeaders: number;
  checkedInFollowers: number;
  stagePlanLabel: string | null;
  judges: { leaders: MonitorJudge[]; followers: MonitorJudge[] };
  rounds: MonitorRound[];
  // Настройки ротации по умолчанию — спрятаны за шестерёнкой ВНУТРИ "Живого
  // танцпола" (RotationPanel), а не отдельным блоком (2026-09-09, по решению
  // пользователя). null, если прав на изменение нет — та же гейтинг-логика,
  // что была у прежнего отдельного блока.
  rotationSettingsPanel: ReactNode | null;
  // Официальный протокол дивизиона и оценки судей по критериям финала теперь
  // живут только на отдельной вкладке "Результаты" (ResultsWorkspace,
  // redesign 2026-09-09, по прямому запросу пользователя) — здесь остаются
  // только булевы гейты, решающие, показывать ли соответствующую
  // плитку-ссылку в "Мониторе" (сам ReactNode Монитору для этого не нужен).
  // resultsAvailable — тот же признак, что использует сам DivisionResultsPanel
  // внутри себя (финальный раунд категории завершён).
  resultsAvailable: boolean;
  hasFinalResultsTable: boolean;
  // Плитки "Результаты"/"Оценки судей" в "Мониторе" не показывают контент
  // сами (по прямому решению пользователя, 2026-09-09 — оставить их на
  // месте, но вести на объединённую вкладку "Результаты" вместо локального
  // переключения режима просмотра) — это прямые ссылки на неё, с этой же
  // категорией и финальным раундом.
  resultsHref: string;
  scoresHref: string;
  generateRounds: ReactNode | null;
};
