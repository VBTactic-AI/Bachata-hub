import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canCreateEvents, isAdmin } from "@/lib/auth";
import type { Actor } from "@/server/rbac/actor";
import { hasNoAdminAccess } from "@/server/rbac/authorize";

// Единая точка правды "к каким из пяти админок есть доступ" — используется и
// хабом /admin (какие карточки показать/куда сразу редиректить), и кнопкой
// "Админ панель" на /profile (показывать её вообще или нет). Раньше это
// иначе означало бы держать одну и ту же логику в двух местах и рано или
// поздно рассинхронизировать (2026-09-14).
export type AdminSectionAccess = {
  system: boolean;
  content: boolean;
  competitions: boolean;
  school: boolean;
  festival: boolean;
};

export async function getAdminSectionAccess(user: User, actor: Actor | null): Promise<AdminSectionAccess> {
  const school = await prisma.school.findFirst({ where: { ownerUserId: user.id }, select: { id: true } });

  return {
    system: isAdmin(user),
    content: canCreateEvents(user),
    // Раньше здесь стояло "(actor?.permissionsByCompetition.size ?? 0) > 0" —
    // но эта карта заполняется и для CompetitionMember роли COMPETITOR,
    // которую любой танцор автоматически получает при обычной регистрации
    // на конкурс (registerSelf/registerByAdmin, docs/00_DECISIONS.md, D9).
    // Из-за этого рядовой участник без единого штатного назначения видел
    // доступ к разделу "Соревнования" и кнопку "Админ панель". hasNoAdminAccess
    // уже отделяет "рядовые" права участника/судьи от штатных ролей
    // (EVENT_ADMIN/HEAD_JUDGE/SCORER/DJ/MC/SUPER_ADMIN) — тот же критерий,
    // что уже используется для общего редиректа с /admin (authorize.ts).
    competitions: isAdmin(user) || (actor !== null && !hasNoAdminAccess(actor)),
    school: !!school,
    festival: user.isVerifiedFestivalOrganizer,
  };
}

export function hasAnyAdminAccess(access: AdminSectionAccess): boolean {
  return Object.values(access).some(Boolean);
}
