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

export const REGISTRATION_ROLE_LABELS: Record<string, string> = { LEADER: "Ведущий", FOLLOWER: "Ведомый" };

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
