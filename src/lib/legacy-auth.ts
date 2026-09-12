// Старая (до 2026-09-11) система сессий — bcryptjs-пароль + свой JWT в
// cookie `bachata_session`. Полностью заменена на Supabase Auth
// (см. src/lib/auth.ts, src/lib/supabase/*, src/app/auth/callback/route.ts).
//
// НЕ импортируется больше ниоткуда в активном коде — оставлена нетронутой
// по прямому указанию пользователя как путь отката, пока новая система не
// будет проверена в реальной работе. Удалить целиком (включая эту переменную
// окружения SESSION_SECRET/NEXTAUTH_SECRET и cookie bachata_session), когда
// переход подтверждён.
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "bachata_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней

const KNOWN_WEAK_SECRETS = new Set(["dev-secret-change-me", "changeme", "secret", "password"]);
const MIN_SECRET_LENGTH = 32;

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET не задан");
  }
  if (KNOWN_WEAK_SECRETS.has(secret.trim().toLowerCase())) {
    throw new Error(
      "SESSION_SECRET/NEXTAUTH_SECRET установлен в заведомо слабое значение-заглушку — сгенерируйте случайный секрет (см. .env.example) и задайте его в .env."
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET/NEXTAUTH_SECRET слишком короткий — нужно минимум ${MIN_SECRET_LENGTH} случайных символов.`);
  }
  return new TextEncoder().encode(secret);
}

export async function legacyCreateSession(userId: string) {
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

export async function legacyDestroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function legacyGetSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub;
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}
