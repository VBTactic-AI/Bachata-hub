import { describe, it, expect, vi, beforeEach } from "vitest";

// ensureBridgedUser() — единственная точка связки auth.users.id (Supabase
// Auth) с public.User, общая для email-логина и OAuth callback (см. план
// миграции: "не создавать отдельного пользователя при повторном входе",
// "безопасно обработать account linking").

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
  },
}));

const { ensureBridgedUser } = await import("@/server/auth/bridge-user");

beforeEach(() => {
  userFindUnique.mockReset();
  userUpdate.mockReset();
  userCreate.mockReset();
});

describe("ensureBridgedUser()", () => {
  it("уже привязан (supabaseUserId совпадает) — просто обновляет lastLoginAt, не создаёт дубликат", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u1", email: "a@b.by" });

    await ensureBridgedUser({ supabaseUserId: "su1", email: "a@b.by" });

    expect(userFindUnique).toHaveBeenCalledTimes(1);
    expect(userFindUnique).toHaveBeenCalledWith({ where: { supabaseUserId: "su1" } });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { lastLoginAt: expect.any(Date) } });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("не привязан, но email уже существует (аккаунт до перехода на Supabase Auth) — линкует, не создаёт дубликат", async () => {
    userFindUnique
      .mockResolvedValueOnce(null) // по supabaseUserId не нашли
      .mockResolvedValueOnce({ id: "u2", email: "old@b.by" }); // по email нашли

    await ensureBridgedUser({ supabaseUserId: "su-new", email: "old@b.by" });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { supabaseUserId: "su-new", lastLoginAt: expect.any(Date) },
    });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("не найден нигде — создаёт нового пользователя с ролью DANCER по умолчанию (не берёт роль из провайдера)", async () => {
    userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await ensureBridgedUser({ supabaseUserId: "su-brand-new", email: "new@b.by" });

    expect(userCreate).toHaveBeenCalledWith({
      data: {
        email: "new@b.by",
        supabaseUserId: "su-brand-new",
        role: "DANCER",
        lastLoginAt: expect.any(Date),
      },
    });
  });

  it("email нормализуется (trim + lowercase) при поиске и создании", async () => {
    userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await ensureBridgedUser({ supabaseUserId: "su1", email: "  Mixed@Case.COM  " });

    expect(userFindUnique).toHaveBeenNthCalledWith(2, { where: { email: "mixed@case.com" } });
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: "mixed@case.com" }) }));
  });
});
