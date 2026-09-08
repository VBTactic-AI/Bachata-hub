import { cache } from "react";
import type { Gender } from "@prisma/client";
import { prisma } from "./prisma";
import { getSessionUserId } from "./auth";

// Профиль танцора текущего пользователя в минимальном виде (id + пол) —
// ровно то, что нужно шапке ("показывать ли ссылку «Профиль»") и формам
// регистрации на конкурс (пол — подсказка роли по умолчанию, D8).
//
// React cache() здесь не микрооптимизация: этот же запрос независимо делали
// Header (светлая шапка), DarkTopNav (тёмная шапка) и сама страница — на
// одну загрузку /admin/competitions/[id] приходилось ТРИ одинаковых
// SELECT'а по Dancer (замерено через pg_stat_statements, 2026-09-08).
// На удалённой БД каждый такой запрос — отдельный сетевой round-trip.
// cache() дедуплицирует их в пределах одного HTTP-запроса, как это уже
// сделано для getCurrentUser()/getActor().
export const getMyDancerRef = cache(async (): Promise<{ id: string; gender: Gender | null } | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.dancer.findUnique({ where: { userId }, select: { id: true, gender: true } });
});

export function getDancerProfile(dancerId: string) {
  return prisma.dancer.findUnique({
    where: { id: dancerId },
    include: {
      city: true,
      achievements: { orderBy: { achievedAt: "desc" }, include: { event: true } },
      attendances: {
        orderBy: { createdAt: "desc" },
        include: { event: { include: { city: true } } },
      },
    },
  });
}

export function getDancerByUserId(userId: string) {
  return prisma.dancer.findUnique({ where: { userId } }).then((d) => (d ? getDancerProfile(d.id) : null));
}
