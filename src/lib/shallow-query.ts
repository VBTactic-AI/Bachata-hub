// Отражает текущий выбор клиента (вкладка/категория/этап/заход) в адресной
// строке БЕЗ обращения к next/navigation router — тот на любое изменение
// URL (даже только query-строки) уходит в Next.js App Router и может дёрнуть
// сервер за новым RSC-пейлоадом текущей страницы (~9 SQL-запросов,
// задокументировано в docs/00_DECISIONS.md — именно поэтому переключение
// вкладок/категорий/раундов в CompetitionWorkspaceTabs/CompetitionMonitor
// специально сделано локальным состоянием, а не через router.push/replace).
// history.replaceState — то же самое видимое пользователю и F5 поведение
// (адрес обновился, обновление страницы вернёт туда же), но не идёт через
// роутер Next.js вообще, поэтому не стоит ни одного лишнего запроса.
export function setShallowQueryParams(patch: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(window.history.state, "", url);
}
