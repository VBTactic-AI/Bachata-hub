import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import type { CreateCompetitionInput } from "./schemas";

// competition:create — только SUPER_ADMIN (03 §4). Дальше создатель
// автоматически становится EVENT_ADMIN этого соревнования (см. ниже) — иначе
// после создания у него самого не будет ни одного права внутри него, т.к.
// EVENT_ADMIN назначается через CompetitionMember, а не глобально.
export async function createCompetition(input: CreateCompetitionInput): Promise<{ id: string; slug: string }> {
  const actor = await requirePermission("competition:create");
  const slug = await uniqueSlug("competition", input.name);
  const eventAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "EVENT_ADMIN" } });

  const competition = await prisma.$transaction(async (tx) => {
    const created = await tx.competition.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        organizerName: input.organizerName,
        venue: input.venue,
        cityId: input.cityId,
        timezone: input.timezone,
        startAt: input.startAt,
        endAt: input.endAt,
        eventId: input.eventId,
        createdById: actor.userId,
      },
    });

    await tx.competitionMember.create({
      data: {
        competitionId: created.id,
        userId: actor.userId,
        roleId: eventAdminRole.id,
        addedById: actor.userId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "competition.create",
      entityType: "Competition",
      entityId: created.id,
      after: { name: created.name, slug: created.slug, status: created.status },
    });

    return created;
  });

  return { id: competition.id, slug: competition.slug };
}
