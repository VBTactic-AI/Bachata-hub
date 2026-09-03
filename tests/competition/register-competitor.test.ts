import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const getActorMock = vi.fn<() => Promise<Actor | null>>();
vi.mock("@/server/rbac/actor", () => ({ getActor: () => getActorMock() }));

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const hashPasswordMock = vi.fn().mockResolvedValue("hashed");
vi.mock("@/lib/auth", () => ({ hashPassword: (...a: unknown[]) => hashPasswordMock(...a) }));

const dancerFindUnique = vi.fn();
const dancerCreate = vi.fn();
const divisionFindFirst = vi.fn();
const roleFindUniqueOrThrow = vi.fn();
const registrationCreate = vi.fn();
const competitionMemberUpsert = vi.fn();
const auditCreate = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();

const fakeTx = {
  dancer: { findUnique: dancerFindUnique, create: dancerCreate },
  division: { findFirst: divisionFindFirst },
  role: { findUniqueOrThrow: roleFindUniqueOrThrow },
  registration: { create: registrationCreate },
  competitionMember: { upsert: competitionMemberUpsert },
  auditLog: { create: auditCreate },
  user: { findUnique: userFindUnique, create: userCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx) },
}));

const { registerSelf, registerByAdmin, suggestedRoleForGender } = await import(
  "@/server/competition/register-competitor"
);
const { AuthenticationRequiredError, RegistrationNotOpenError } = await import("@/server/errors");

const actor: Actor = {
  userId: "u1",
  email: "a@b.by",
  globalPermissions: new Set(),
  permissionsByCompetition: new Map(),
};

beforeEach(() => {
  getActorMock.mockReset();
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  dancerFindUnique.mockReset();
  dancerCreate.mockReset();
  divisionFindFirst.mockReset().mockResolvedValue({ id: "div1", competition: { status: "REGISTRATION_OPEN" } });
  roleFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "role-competitor" });
  registrationCreate.mockReset().mockResolvedValue({ id: "reg1" });
  competitionMemberUpsert.mockReset();
  auditCreate.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
});

describe("suggestedRoleForGender()", () => {
  it("MALE -> LEADER, FEMALE -> FOLLOWER, null -> null (подсказка, не правило)", () => {
    expect(suggestedRoleForGender("MALE")).toBe("LEADER");
    expect(suggestedRoleForGender("FEMALE")).toBe("FOLLOWER");
    expect(suggestedRoleForGender(null)).toBeNull();
  });
});

describe("registerSelf()", () => {
  it("требует аутентификацию", async () => {
    getActorMock.mockResolvedValue(null);
    await expect(registerSelf("comp1", { divisionId: "div1", role: "LEADER" })).rejects.toBeInstanceOf(
      AuthenticationRequiredError
    );
  });

  it("отклоняет регистрацию, если соревнование не в REGISTRATION_OPEN", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue({ id: "dancer1", gender: null });
    divisionFindFirst.mockResolvedValue({ id: "div1", competition: { status: "DRAFT" } });

    await expect(registerSelf("comp1", { divisionId: "div1", role: "LEADER" })).rejects.toBeInstanceOf(
      RegistrationNotOpenError
    );
    expect(registrationCreate).not.toHaveBeenCalled();
  });

  it("создаёт профиль танцора на лету, если его ещё нет (напр. у SCHOOL_REP)", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue(null);
    dancerCreate.mockResolvedValue({ id: "newDancer", gender: null });

    await registerSelf("comp1", { divisionId: "div1", role: "LEADER" });

    expect(dancerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1" }) })
    );
    expect(registrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dancerId: "newDancer" }) })
    );
  });

  it("роль совпадает с полом — регистрация сразу подтверждена, без ожидания", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue({ id: "dancer1", gender: "MALE" });

    await registerSelf("comp1", { divisionId: "div1", role: "LEADER" });

    expect(registrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "LEADER", requestedRole: null, roleOverrideStatus: null }),
      })
    );
  });

  it("роль расходится с полом — сохраняется безопасная роль по полу, запрошенная роль ждёт подтверждения", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue({ id: "dancer1", gender: "MALE" }); // подсказка -> LEADER

    await registerSelf("comp1", { divisionId: "div1", role: "FOLLOWER" });

    expect(registrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "LEADER", requestedRole: "FOLLOWER", roleOverrideStatus: "PENDING" }),
      })
    );
  });

  it("пол не указан — противоречия нет, роль принимается как есть", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue({ id: "dancer1", gender: null });

    await registerSelf("comp1", { divisionId: "div1", role: "FOLLOWER" });

    expect(registrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "FOLLOWER", requestedRole: null, roleOverrideStatus: null }),
      })
    );
  });
});

describe("registerByAdmin()", () => {
  it("проверяет registration:manage ИМЕННО для этого competitionId", async () => {
    userFindUnique.mockResolvedValue({ id: "u2", dancer: { id: "dancer2", gender: null } });

    await registerByAdmin("comp1", { divisionId: "div1", role: "FOLLOWER", email: "existing@b.by" });

    expect(requirePermissionMock).toHaveBeenCalledWith("registration:manage", "comp1");
  });

  it("создаёт нового пользователя и профиль танцора, если email не найден", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "newUser", dancer: { id: "newDancer", gender: null } });

    await registerByAdmin("comp1", {
      divisionId: "div1",
      role: "LEADER",
      email: "new@b.by",
      displayName: "Новый Танцор",
    });

    expect(hashPasswordMock).toHaveBeenCalledOnce();
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@b.by",
          role: "DANCER",
          dancer: { create: { displayName: "Новый Танцор" } },
        }),
      })
    );
    expect(registrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dancerId: "newDancer" }) })
    );
  });

  it("дозаводит профиль танцора существующему пользователю без Dancer", async () => {
    userFindUnique.mockResolvedValue({ id: "u3", email: "schoolrep@b.by", dancer: null });
    dancerCreate.mockResolvedValue({ id: "dancer3", gender: null });

    await registerByAdmin("comp1", { divisionId: "div1", role: "LEADER", email: "schoolrep@b.by" });

    expect(userCreate).not.toHaveBeenCalled();
    expect(dancerCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "u3" }) }));
  });

  it("учитывает пол существующего профиля при регистрации админом", async () => {
    userFindUnique.mockResolvedValue({ id: "u4", dancer: { id: "dancer4", gender: "FEMALE" } });

    await registerByAdmin("comp1", { divisionId: "div1", role: "LEADER", email: "existing@b.by" });

    expect(registrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "FOLLOWER", requestedRole: "LEADER", roleOverrideStatus: "PENDING" }),
      })
    );
  });
});
