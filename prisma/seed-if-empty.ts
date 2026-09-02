import { PrismaClient } from "@prisma/client";
import { main } from "./seed";

// Используется в docker-compose при каждом старте контейнера: сидирует
// демо-данные только один раз (при первом запуске на пустом volume), а на
// последующих перезапусках ничего не трогает — не затирает то, что
// пользователи успели добавить сами через сайт.
async function run() {
  const prisma = new PrismaClient();
  try {
    const existingCities = await prisma.city.count();
    if (existingCities > 0) {
      console.log("Seed: в базе уже есть данные — пропускаю (это нормально при перезапуске).");
      return;
    }
    console.log("Seed: база пуста, наполняю демо-данными...");
    const summary = await main(prisma);
    console.log("Seed: готово ->", summary);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error("Seed: ошибка при наполнении демо-данными:", e);
  // Не роняем весь контейнер из-за проблем с сидом — сайт с пустой, но
  // рабочей базой лучше, чем неработающий контейнер.
  process.exitCode = 0;
});
