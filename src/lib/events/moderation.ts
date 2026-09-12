import type { School, User } from "@prisma/client";
import { isAdmin } from "@/lib/auth";

// Кто публикует Event Wizard'ом без очереди модерации сайта — решение
// пользователя (2026-09-12, в этой сессии): верифицированные школы
// (School.verificationStatus = VERIFIED) и их владелец/представитель
// (School.ownerUserId), плюс сайтовый ADMIN. Все остальные (органайзер без
// школы, школа в статусе COMMUNITY) — как и раньше, через модерацию
// (moderationStatus: PENDING -> APPROVED/REJECTED).
export function shouldAutoApproveEvent(user: User, school: School | null): boolean {
  if (isAdmin(user)) return true;
  if (school && school.verificationStatus === "VERIFIED" && school.ownerUserId === user.id) return true;
  return false;
}
