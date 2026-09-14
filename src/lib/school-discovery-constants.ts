// Общая константа между сервером (src/lib/school-discovery.ts) и клиентом
// (src/components/SchoolEventsDiscovery.tsx) — отдельный файл БЕЗ импорта
// prisma/next-cache специально: если бы клиентский компонент импортировал
// её напрямую из school-discovery.ts, вебпак затянул бы в клиентский бандл
// весь файл вместе с prisma → node:async_hooks и сборка падала бы (найдено
// на next dev, 2026-09-14) — тот же класс проблемы, что уже решён для
// formatEventCardPrice (см. комментарий в src/lib/event-price.ts).
export const OTHER_EVENTS_ID = "other";
