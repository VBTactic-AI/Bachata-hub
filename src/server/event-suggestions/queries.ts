import { prisma } from "@/lib/prisma";

export async function getMyEventSuggestions(userId: string) {
  return prisma.eventSuggestion.findMany({ where: { suggestedById: userId }, orderBy: { createdAt: "desc" } });
}
