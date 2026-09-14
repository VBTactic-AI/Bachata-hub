import type { School, User } from "@prisma/client";
import { isAdmin } from "@/lib/auth";

// Кто публикует Event Wizard'ом без очереди модерации сайта — решение
// пользователя (2026-09-12): верифицированные школы (School.verificationStatus
// = VERIFIED) и их владелец/представитель (School.ownerUserId), плюс
// сайтовый ADMIN. Расширено 2026-09-15: User.isVerifiedEventOrganizer тоже
// освобождает от модерации — этот флаг выдаётся ТОЛЬКО через одобрение
// AccessRequest(type: EVENT_ORGANIZER) супер-админом (см.
// src/server/access-requests/review.ts), то есть организатор уже прошёл
// проверку человеком на этапе заявки; повторная модерация каждого его
// события — лишний шаг. НЕ путать с обычной ролью User.role === "ORGANIZER"
// (устаревший свободный выбор роли при регистрации, до 2026-09-14, без какой
//-либо проверки) — она по-прежнему НЕ освобождает от модерации.
export function shouldAutoApproveEvent(user: User, school: School | null): boolean {
  if (isAdmin(user)) return true;
  if (user.isVerifiedEventOrganizer) return true;
  if (school && school.verificationStatus === "VERIFIED" && school.ownerUserId === user.id) return true;
  return false;
}
