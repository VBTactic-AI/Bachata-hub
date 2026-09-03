import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Идемпотентность для draw/расчёта результатов/публикации (03 §26). Первый
// вызов с данным (scope, key) выполняет fn и фиксирует факт выполнения;
// повторный вызов с тем же ключом — no-op, fn не выполняется повторно.
// Судейские оценки используют собственный clientSubmissionId, не эту таблицу.
export async function withIdempotency<T>(scope: string, key: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    await prisma.idempotencyKey.create({ data: { scope, key } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Уже выполнялось с этим ключом — молча пропускаем повторный вызов.
      return undefined;
    }
    throw e;
  }
  return fn();
}
