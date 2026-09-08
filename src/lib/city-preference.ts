import { cookies } from "next/headers";
import { getActiveCities } from "./cities";

const CITY_COOKIE = "bachata_city";

// Город пользователя хранится в cookie (не требует аккаунта — гость тоже
// должен получать релевантную главную страницу с первого визита).
//
// Берём из того же кэшированного справочника, что и CitySwitcher, вместо
// отдельного findUnique — активных городов единицы, отдельный round-trip к
// удалённой БД на каждой странице ради одной строки не нужен. Результат тот
// же: только активный город, совпавший по slug, иначе null.
export async function getPreferredCity() {
  const cookieStore = await cookies();
  const slug = cookieStore.get(CITY_COOKIE)?.value;
  if (!slug) return null;
  const cities = await getActiveCities();
  return cities.find((c) => c.slug === slug) ?? null;
}

export { CITY_COOKIE };
