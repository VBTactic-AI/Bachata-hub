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
//
// maxDuration — на Vercel serverless-функция обрывается по таймауту
// (по умолчанию заметно короче); держим соединение максимально долго в
// рамках Hobby-лимита (60с — поддерживается на всех тарифах, на Pro/Enterprise
// можно поднять). Браузер (EventSource) сам переподключается после обрыва —
// см. useScoreEvents в ScoreMonitorTable.tsx, которая при каждом (пере)открытии
// запрашивает полный снимок заново (score-monitor/route.ts), а не только ждёт
// следующее событие — иначе то, что произошло за время обрыва, терялось бы молча.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
  let selfClose: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        unsubscribe?.();
        unsubscribe = null;
        if (heartbeat) clearInterval(heartbeat);
        if (selfClose) clearTimeout(selfClose);
      };

      unsubscribe = subscribeToRoundScoreEvents(roundId, (event) => {
        controller.enqueue(encoder.encode(`event: score\ndata: ${JSON.stringify(event)}\n\n`));
      });
      // Держит соединение живым через reverse-proxy/балансировщики, которые
      // сами обрывают простаивающие HTTP-соединения через ~30-60с.
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 20000);
      // Закрываем сами С ЗАПАСОМ до maxDuration — платформа (Vercel) обрывала
      // бы соединение резко (клиент увидел бы разрыв не сразу, иногда с
      // задержкой на реконнект); аккуратное controller.close() браузер
      // (EventSource) воспринимает как штатный конец потока и переподключается
      // без дополнительной задержки на таймаут.
      // ReadableStream.cancel() ниже вызывается только при отмене СО СТОРОНЫ
      // потребителя (клиент отключился) — на плановое самозакрытие оно не
      // сработает, поэтому здесь cleanup() вызывается явно перед close().
      selfClose = setTimeout(() => {
        cleanup();
        controller.close();
      }, 55000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (selfClose) clearTimeout(selfClose);
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
