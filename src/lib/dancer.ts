import { prisma } from "./prisma";

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
