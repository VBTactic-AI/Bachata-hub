import type { EventSeries } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { computeOccurrenceDates, computeOccurrenceTimes, dateOnlyUtc, addDaysUtc } from "./recurrence";

// Generation Engine (задача §6/§8) — вызывается ТОЛЬКО периодическим cron'ом
// (src/app/api/cron/notifications/sweep/route.ts), никогда с клиента/из
// useEffect (CLAUDE.md §8 "критическая логика не на frontend", задача §8
// прямо запрещает polling браузера для этого).

function todayUtc(): Date {
  const now = new Date();
  return dateOnlyUtc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

// Генерация для ОДНОЙ серии. Идемпотентна: повторный вызов с тем же
// состоянием БД не создаёт дубликатов — реальная защита это unique-индекс
// Event(seriesId, occurrenceDate) в БД (см. миграцию), а не только проверка
// "уже существует" перед вставкой (два параллельных тика cron всё равно не
// продублируют строку, конфликт поймает P2002).
export async function generateSeriesOccurrences(series: EventSeries): Promise<{ created: number }> {
  if (series.status !== "ACTIVE") return { created: 0 };

  const today = todayUtc();
  const horizonEnd = addDaysUtc(today, series.generationHorizonDays);
  const thresholdDate = addDaysUtc(today, series.generationThresholdDays);

  // lastGeneratedThrough — курсор: если он ещё далеко в будущем (за порогом),
  // генерировать пока нечего. Если null (первый запуск) — всегда генерируем.
  if (series.lastGeneratedThrough && series.lastGeneratedThrough.getTime() > thresholdDate.getTime()) {
    return { created: 0 };
  }

  const windowStart = series.lastGeneratedThrough ? addDaysUtc(series.lastGeneratedThrough, 1) : today;
  const windowEnd = series.endDate && series.endDate.getTime() < horizonEnd.getTime() ? series.endDate : horizonEnd;
  if (windowStart.getTime() > windowEnd.getTime()) {
    // Уже сгенерировано до конца окна (или до endDate) — просто обновляем
    // курсор, чтобы не пересчитывать это же условие на каждом тике впустую.
    await prisma.eventSeries.update({ where: { id: series.id }, data: { lastGeneratedThrough: windowEnd, lastGeneratedAt: new Date() } });
    return { created: 0 };
  }

  const rule = series.recurrenceRule as unknown as Parameters<typeof computeOccurrenceDates>[0];
  const dates = computeOccurrenceDates(rule, series.startDate, series.endDate, windowStart, windowEnd);

  // Одним запросом узнаём, какие даты уже сгенерированы в этом диапазоне —
  // сокращает число попыток INSERT, которые заведомо упрутся в P2002
  // (CLAUDE.md §22 "не делать N+1", но здесь и наоборот: не гадать вслепую).
  const existing = await prisma.event.findMany({
    where: { seriesId: series.id, occurrenceDate: { in: dates } },
    select: { occurrenceDate: true },
  });
  const existingSet = new Set(existing.map((e) => e.occurrenceDate!.getTime()));
  const toCreate = dates.filter((d) => !existingSet.has(d.getTime()));

  let created = 0;
  for (const occurrenceDate of toCreate) {
    const { startsAt, endsAt } = computeOccurrenceTimes(occurrenceDate, series.defaultStartTime, series.defaultEndTime, series.timezone);
    const dateLabel = occurrenceDate.toISOString().slice(0, 10);
    const slug = await uniqueSlug("event", `${series.name} ${dateLabel}`);

    try {
      await prisma.event.create({
        data: {
          slug,
          title: series.name,
          description: series.description,
          cityId: series.cityId,
          schoolId: series.schoolId,
          organizerName: series.schoolId ? null : series.organizerName,
          format: series.format,
          eventType: "REGULAR",
          level: series.level,
          startsAt,
          endsAt,
          venueName: series.venueName,
          venueAddress: series.venueAddress,
          capacity: series.capacity,
          registrationEnabled: series.registrationEnabled,
          ticketingMode: series.ticketingMode,
          priceText: series.priceText,
          externalLinkUrl: series.externalLinkUrl,
          tags: series.tags,
          certainty: series.certainty,
          // Occurrence всегда создаётся черновиком — публикация (если
          // autoPublish включён) отдельным шагом (publishDueSeriesOccurrences)
          // ближе к дате события, не в момент генерации наперёд на 12 недель.
          status: "DRAFT",
          createdById: series.createdById,
          seriesId: series.id,
          occurrenceDate,
        },
      });
      created++;
    } catch (err) {
      // P2002 — гонка с другим тиком cron (тот же occurrenceDate уже успел
      // вставить другой процесс между SELECT выше и этим INSERT). Не ошибка,
      // не считается созданным — реальный дубль всё равно исключён БД.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }

  await prisma.eventSeries.update({
    where: { id: series.id },
    data: { lastGeneratedThrough: windowEnd, lastGeneratedAt: new Date() },
  });

  return { created };
}

// Top-level cron entry (задача §8): найти ACTIVE серии, у которых горизонт
// генерации требует внимания, и серии с истёкшим endDate — перевести в ENDED.
export async function generateDueSeriesOccurrences(): Promise<{ seriesProcessed: number; occurrencesCreated: number; ended: number }> {
  const today = todayUtc();

  const endedResult = await prisma.eventSeries.updateMany({
    where: { status: { in: ["ACTIVE", "PAUSED"] }, endDate: { lt: today } },
    data: { status: "ENDED" },
  });

  const dueSeries = await prisma.eventSeries.findMany({
    where: { status: "ACTIVE" },
  });

  let occurrencesCreated = 0;
  let seriesProcessed = 0;
  for (const series of dueSeries) {
    const result = await generateSeriesOccurrences(series);
    if (result.created > 0) seriesProcessed++;
    occurrencesCreated += result.created;
  }

  return { seriesProcessed, occurrencesCreated, ended: endedResult.count };
}
