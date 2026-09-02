import { cookies } from "next/headers";
import { prisma } from "./prisma";

const CITY_COOKIE = "bachata_city";

// Город пользователя хранится в cookie (не требует аккаунта — гость тоже
// должен получать релевантную главную страницу с первого визита).
export async function getPreferredCity() {
  const cookieStore = await cookies();
  const slug = cookieStore.get(CITY_COOKIE)?.value;
  if (!slug) return null;
  return prisma.city.findUnique({ where: { slug, isActive: true } });
}

export { CITY_COOKIE };
