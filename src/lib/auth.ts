import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { User, UserRole } from "@prisma/client";

const SESSION_COOKIE = "bachata_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET не задан");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// Возвращает текущего пользователя (или null для гостя). Используется во всех
// server-компонентах и route handlers, где важна роль/авторство.
//
// Обёрнуто в React cache() (не связано с HTTP-кэшированием) — дедуплицирует
// повторные вызовы В ПРЕДЕЛАХ ОДНОГО запроса: например, страница судьи сама
// вызывает getActor() для проверки редиректа, а getJudgeQueue() внутри нужного
// ей requirePermission() вызывает его снова — без cache() это два отдельных
// сетевых похода к удалённой БД (Supabase pooler, ~150мс каждый round-trip)
// за одними и теми же данными в рамках одного и того же запроса пользователя.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isBlocked) return null;
    return user;
  } catch {
    return null;
  }
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

export function isModerator(user: User | null): boolean {
  return hasRole(user, "MODERATOR", "ADMIN");
}

// Список всех пользователей и блокировка — более чувствительное действие,
// чем модерация контента, поэтому доступно только ADMIN, не MODERATOR.
export function isAdmin(user: User | null): boolean {
  return hasRole(user, "ADMIN");
}
