import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { createClient } from "./supabase/server";
import type { User, UserRole } from "@prisma/client";

// Supabase Auth — источник истины для аутентификации (кто это, какая у
// сессии assurance level). RBAC (что этому пользователю разрешено) остаётся
// полностью отдельным уровнем — см. src/server/rbac/actor.ts,
// docs/00_DECISIONS.md D2. Эти два уровня НЕ объединяются.

export type AuthClaims = { supabaseUserId: string; aal: "aal1" | "aal2" };

// getClaims() (не getSession()!) проверяет подпись JWT заново при каждом
// вызове против опубликованных ключей проекта — это единственный безопасный
// способ читать личность пользователя на сервере (см. предупреждение
// Supabase: getSession() внутри серверного кода не гарантированно валиден).
export const getAuthClaims = cache(async (): Promise<AuthClaims | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const claims = data.claims as { sub?: string; aal?: string };
  if (!claims.sub) return null;
  // JWT без aal-claim (не должно случаться с новыми токенами Supabase, но
  // проверяем явно) — трактуем как aal1, НИКОГДА не как aal2 по умолчанию.
  const aal = claims.aal === "aal2" ? "aal2" : "aal1";
  return { supabaseUserId: claims.sub, aal };
});

// Возвращает текущего пользователя приложения (или null для гостя) по
// связке auth.users.id -> public.User.supabaseUserId. Используется во всех
// server-компонентах и route handlers, где важна роль/авторство — сигнатура
// не изменилась при переходе на Supabase Auth, чтобы не трогать полсотни
// мест вызова.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const claims = await getAuthClaims();
  if (!claims) return null;
  try {
    const user = await prisma.user.findUnique({ where: { supabaseUserId: claims.supabaseUserId } });
    if (!user || user.isBlocked) return null;
    return user;
  } catch {
    return null;
  }
});

// Только public.User.id текущего пользователя, без остальных полей — для
// мест, которым не нужна вся строка User (напр. src/lib/dancer.ts). При
// самописной JWT-сессии это раньше не требовало похода в БД вообще (id
// лежал прямо в токене) — с Supabase Auth токен несёт только
// auth.users.id, поэтому один Prisma-запрос неизбежен; cache() по-прежнему
// дедуплицирует его в пределах одного HTTP-запроса.
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const claims = await getAuthClaims();
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { supabaseUserId: claims.supabaseUserId },
    select: { id: true, isBlocked: true },
  });
  if (!user || user.isBlocked) return null;
  return user.id;
});

export function hasRole(user: User | null, ...roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

// Кто может добавлять события: представитель школы, организатор без школы,
// модератор и админ (см. таблицу ролей в ТЗ). Обычный танцор — нет.
export function canCreateEvents(user: User | null): boolean {
  return hasRole(user, "SCHOOL_REP", "ORGANIZER", "MODERATOR", "ADMIN");
}

// Временно нигде не вызывается (2026-09-11): раздел "Модерация" переехал в
// /admin/moderation и пока открыт только isAdmin (SUPER_ADMIN) — по прямому
// решению пользователя, до появления отдельного ограниченного режима для
// модераторов школы. Функцию не удаляю — она понадобится для этого будущего
// режима без изменений.
export function isModerator(user: User | null): boolean {
  return hasRole(user, "MODERATOR", "ADMIN");
}

// Список всех пользователей и блокировка — более чувствительное действие,
// чем модерация контента, поэтому доступно только ADMIN, не MODERATOR.
export function isAdmin(user: User | null): boolean {
  return hasRole(user, "ADMIN");
}

// Кто из перечисленных пользователей залогинен ПРЯМО СЕЙЧАС (не "когда-либо
// входил", как User.lastLoginAt) — вкладка "Судьи" в админке, 2026-09-12, по
// прямому запросу пользователя ("Активен только тогда, когда именно сейчас
// залогинен"). Источник истины — сама таблица Supabase Auth `auth.sessions`
// (не изобретаем свою: AUTH_SECURITY_SPEC.md требует переиспользовать
// официальную инфраструктуру Supabase Auth, не строить параллельную): строка
// сессии существует, пока пользователь явно не вышел (signOut удаляет её) и
// пока не истёк not_after (если в проекте вообще задан абсолютный лимит
// сессии — по умолчанию его нет, not_after остаётся NULL). Это тот же смысл
// "залогинен", что и в любой обычной панели администратора — "есть живая,
// не отозванная сессия", а не покадровое presence-отслеживание: если человек
// просто закрыл вкладку, не нажав "Выйти", сессия на сервере остаётся
// действительной (это нормальное поведение любого веб-сайта, не баг).
//
// Прямой SQL к схеме `auth` — то же самое Postgres-подключение, что и у
// остальной Prisma (роль `postgres`, см. docs/00_DECISIONS.md про
// инфраструктуру БД), Prisma не моделирует таблицы Supabase Auth сама.
export async function getCurrentlyLoggedInSupabaseUserIds(supabaseUserIds: string[]): Promise<Set<string>> {
  const ids = supabaseUserIds.filter((id): id is string => !!id);
  if (ids.length === 0) return new Set();
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT DISTINCT user_id::text AS user_id
    FROM auth.sessions
    WHERE user_id = ANY(${ids}::uuid[])
      AND (not_after IS NULL OR not_after > now())
  `;
  return new Set(rows.map((r) => r.user_id));
}

// Всё ещё нужен для registerByAdmin() (src/server/competition/register-competitor.ts) —
// участник, добавленный организатором без приглашения, никогда не логинится
// сам паролем, но колонка исторически заполнялась случайным непроходимым
// значением. Не удаляю и не меняю вызывающий код — минимальный набор правок
// (CLAUDE.md §54); сам пароль/hash больше не участвует ни в одном login-flow.
export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
