import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const idempotencyKeyCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { idempotencyKey: { create: (...args: unknown[]) => idempotencyKeyCreate(...args) } },
}));

const { withIdempotency } = await import("@/server/idempotency");

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.18.0",
  });
}

beforeEach(() => {
  idempotencyKeyCreate.mockReset();
});

describe("withIdempotency()", () => {
  it("выполняет fn при первом вызове с новым ключом", async () => {
    idempotencyKeyCreate.mockResolvedValue({});
    const fn = vi.fn().mockResolvedValue("done");

    const result = await withIdempotency("draw.generate", "round-1", fn);

    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("НЕ выполняет fn повторно при том же ключе (дубликат отклонён на уровне БД)", async () => {
    idempotencyKeyCreate.mockRejectedValue(uniqueViolation());
    const fn = vi.fn().mockResolvedValue("done");

    const result = await withIdempotency("draw.generate", "round-1", fn);

    expect(result).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it("пробрасывает неожиданные ошибки БД, а не молча их проглатывает", async () => {
    idempotencyKeyCreate.mockRejectedValue(new Error("connection lost"));
    const fn = vi.fn();

    await expect(withIdempotency("draw.generate", "round-1", fn)).rejects.toThrow("connection lost");
    expect(fn).not.toHaveBeenCalled();
  });
});
