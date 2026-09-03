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
