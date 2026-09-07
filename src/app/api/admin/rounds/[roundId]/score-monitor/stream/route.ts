import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { respondToDomainError } from "@/server/http";
import { subscribeToRoundScoreEvents } from "@/server/realtime/score-relay";

// SSE-раздача live-событий live-таблицы head judge/admin (score-monitor.ts
// отдаёт первичный снимок при загрузке страницы, этот роут — только
// последующие обновления). RBAC проверяется ЗДЕСЬ, до открытия потока —
// Realtime-релей сам по себе ничего не фильтрует по праву, это ответственность
// каждого подписчика (CLAUDE.md §31).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;

  let competitionId: string;
  try {
    const round = await prisma.round.findUniqueOrThrow({
      where: { id: roundId },
      select: { division: { select: { competitionId: true } } },
    });
    competitionId = round.division.competitionId;
    await requirePermission("score:view_all", competitionId);
  } catch (e) {
    return respondToDomainError(e);
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribeToRoundScoreEvents(roundId, (event) => {
        controller.enqueue(encoder.encode(`event: score\ndata: ${JSON.stringify(event)}\n\n`));
      });
      // Держит соединение живым через reverse-proxy/балансировщики, которые
      // сами обрывают простаивающие HTTP-соединения через ~30-60с.
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 20000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
