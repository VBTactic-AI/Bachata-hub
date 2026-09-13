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
const registrationFindFirst = vi.fn();
const registrationCreate = vi.fn();
const competitionMemberUpsert = vi.fn();
const auditCreate = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const executeRaw = vi.fn();
const notificationJobUpsert = vi.fn().mockResolvedValue({});

const fakeTx = {
  dancer: { findUnique: dancerFindUnique, findFirst: dancerFindUnique, create: dancerCreate },
  division: { findFirst: divisionFindFirst },
  role: { findUniqueOrThrow: roleFindUniqueOrThrow, findFirstOrThrow: roleFindUniqueOrThrow },
  registration: { findFirst: registrationFindFirst, create: registrationCreate },
  competitionMember: { upsert: competitionMemberUpsert },
  auditLog: { create: auditCreate },
  user: { findUnique: userFindUnique, findFirst: userFindUnique, create: userCreate },
  // Notification & Subscription Engine (Phase 7) — insertRegistration()
  // эмитит JNJ_REGISTERED в этой же транзакции, см. emit-domain-event.ts.
  notificationJob: { upsert: (...a: unknown[]) => notificationJobUpsert(...a) },
  // Тегированный шаблон ($executeRaw`...`) — вызывается как функция, но с
  // массивом строк первым аргументом; для теста форма вызова не важна,
  // важно только что он резолвится и не падает (advisory lock — деталь
  // конкуренции, не бизнес-логики, которую тестирует этот файл).
  $executeRaw: (...a: unknown[]) => executeRaw(...a),
};

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx) },
}));

const { registerSelf, registerByAdmin, suggestedRoleForGender } = await import(
  "@/server/competition/register-competitor"
);
const { AuthenticationRequiredError, RegistrationNotOpenError, AlreadyRegisteredInCompetitionError } = await import(
  "@/server/errors"
);

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
  divisionFindFirst
    .mockReset()
    .mockResolvedValue({ id: "div1", competition: { status: "REGISTRATION_OPEN", name: "Test Competition" } });
  roleFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "role-competitor" });
  // По умолчанию — ни в одной категории этого соревнования ещё нет
  // регистрации (проверка "только одна категория на соревнование").
  registrationFindFirst.mockReset().mockResolvedValue(null);
  registrationCreate.mockReset().mockResolvedValue({ id: "reg1" });
  competitionMemberUpsert.mockReset();
  auditCreate.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
  executeRaw.mockReset().mockResolvedValue(0);
  notificationJobUpsert.mockReset().mockResolvedValue({});
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

  // Только одна категория на соревнование на человека (по прямому запросу
  // пользователя, 2026-09-10) — раньше можно было отметить сразу несколько
  // категорий в RegistrationWizard, сервер это никак не проверял.
  it("уже зарегистрирован в ДРУГОЙ категории этого соревнования — отклоняет", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue({ id: "dancer1", gender: null });
    registrationFindFirst.mockResolvedValue({
      id: "reg-existing",
      division: { category: { name: "Дебютанты" } },
    });

    await expect(registerSelf("comp1", { divisionId: "div1", role: "FOLLOWER" })).rejects.toBeInstanceOf(
      AlreadyRegisteredInCompetitionError
    );
    expect(registrationCreate).not.toHaveBeenCalled();
  });

  it("advisory lock берётся ДО проверки существующей регистрации (сериализация гонки)", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue({ id: "dancer1", gender: null });

    await registerSelf("comp1", { divisionId: "div1", role: "LEADER" });

    expect(executeRaw).toHaveBeenCalledOnce();
    const executeRawOrder = executeRaw.mock.invocationCallOrder[0];
    const findFirstOrder = registrationFindFirst.mock.invocationCallOrder[0];
    expect(executeRawOrder).toBeLessThan(findFirstOrder);
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

describe("Notification & Subscription Engine — JNJ_REGISTERED (Phase 7)", () => {
  it("registerSelf(): DIRECT-уведомление самому зарегистрированному, в той же транзакции", async () => {
    getActorMock.mockResolvedValue(actor);
    dancerFindUnique.mockResolvedValue({ id: "dancer1", gender: null });
    registrationCreate.mockResolvedValue({ id: "reg1" });

    await registerSelf("comp1", { divisionId: "div1", role: "LEADER" });

    expect(notificationJobUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: "JNJ_REGISTERED:reg1" },
        create: expect.objectContaining({
          eventType: "JNJ_REGISTERED",
          payload: { entityId: "comp1", competitionName: "Test Competition", directUserId: "u1" },
        }),
      })
    );
  });

  it("registerByAdmin(): получатель — зарегистрированный участник, а НЕ админ, выполнивший регистрацию", async () => {
    userFindUnique.mockResolvedValue({ id: "u2", dancer: { id: "dancer2", gender: null } });
    registrationCreate.mockResolvedValue({ id: "reg2" });

    await registerByAdmin("comp1", { divisionId: "div1", role: "FOLLOWER", email: "existing@b.by" });

    expect(notificationJobUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ payload: expect.objectContaining({ directUserId: "u2" }) }),
      })
    );
  });
});
