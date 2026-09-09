// Человекочитаемые подписи для enum'ов движка соревнований — общие для
// /admin/competitions и /profile, чтобы не расходились при правках.
export const COMPETITION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  REGISTRATION_OPEN: "Регистрация открыта",
  REGISTRATION_CLOSED: "Регистрация закрыта",
  CHECK_IN: "Check-in",
  READY: "Готово к старту",
  LIVE: "Идёт",
  SCORING: "Судейство",
  REVIEW: "Проверка результатов",
  PUBLISHED: "Опубликовано",
  ARCHIVED: "Архив",
};

// Порядок state machine соревнования (CLAUDE.md §9) — та же последовательность,
// что и ключи NEXT в CompetitionStatusControls.tsx (переходы разрешает
// src/server/state/competition-state.ts, здесь только порядок для отображения
// прогресса, не источник истины для переходов).
export const COMPETITION_STATUS_ORDER: readonly (keyof typeof COMPETITION_STATUS_LABELS)[] = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "CHECK_IN",
  "READY",
  "LIVE",
  "SCORING",
  "REVIEW",
  "PUBLISHED",
  "ARCHIVED",
];

export const REGISTRATION_ROLE_LABELS: Record<string, string> = { LEADER: "Партнёр", FOLLOWER: "Партнёрша" };
export const REGISTRATION_ROLE_LABELS_PLURAL: Record<string, string> = { LEADER: "Партнёры", FOLLOWER: "Партнёрши" };
// Родительный падеж множественного числа — для конструкций вида "Партнёров: N" /
// "не поровну Партнёров и Партнёрш".
export const REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL: Record<string, string> = { LEADER: "Партнёров", FOLLOWER: "Партнёрш" };

export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Зарегистрирован",
  SCRATCHED: "Снялся",
  DISQUALIFIED: "Дисквалифицирован",
};

export const ROUND_TYPE_LABELS: Record<string, string> = {
  PRELIMINARY: "Отборочный",
  CALLBACK: "Каллбэк",
  QUARTERFINAL: "Четвертьфинал",
  SEMIFINAL: "Полуфинал",
  FINAL: "Финал",
  TIE_BREAK: "Перетанцовка",
  DANCE_OFF: "Dance-off",
};

export const ROUND_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  READY: "Готов",
  DRAWING: "Жеребьёвка",
  DRAW_LOCKED: "Жеребьёвка зафиксирована",
  RUNNING: "Идёт",
  FINISHED: "Завершён",
  SCORING: "Подсчёт баллов",
  COMPLETED: "Готово",
};

export const HEAT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидает",
  RUNNING: "Идёт",
  PAUSED: "Пауза",
  FINISHED: "Завершён",
};

export const ROTATION_MODE_LABELS: Record<string, string> = {
  TRACK_AUTO_SHIFT: "Смены внутри трека (автоматически)",
  SEGMENT_MANUAL_SHIFT: "Смена между отрезками (вручную, диджей называет число)",
};

// Метод оценки раундов до финала (Division.judgingMaxScore/Round.judgingMaxScore,
// 2026-09-07) — 1 = "Да/Нет", 2 = "0/1/2" с квотой по числу проходящих.
export const JUDGING_MAX_SCORE_LABELS: Record<number, string> = {
  1: "Да/Нет",
  2: "0-1-2",
};

export const ROTATION_STATUS_LABELS: Record<string, string> = {
  IDLE: "Не начата",
  RUNNING: "Идёт",
  PAUSED: "Пауза",
  FINISHED: "Завершена",
};

export const RESULT_STATUS_LABELS: Record<string, string> = {
  FINALIST: "Финалист",
  ELIMINATED: "Выбыл",
};

// Формат финала (FinalSettings.format) — те же подписи, что и в
// FinalSettingsPanel.tsx (там своя локальная копия под критерии/scoring-matrix
// UI); вынесено сюда отдельно для вкладки "Судьи" → "Настройки судейства",
// которой нужны только сами подписи, без остального формы финала.
export const FINAL_FORMAT_LABELS: Record<string, string> = {
  NORMAL: "Обычный J&J",
  JUDGES_DANCE: "Танец с судьями",
  RANDOM_COUPLES: "Случайные пары",
  RELATIVE_PLACEMENT: "Относительные места (скейтинг)",
};
