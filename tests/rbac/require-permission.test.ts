import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const getActorMock = vi.fn<() => Promise<Actor | null>>();
vi.mock("@/server/rbac/actor", () => ({ getActor: () => getActorMock() }));

const { requirePermission } = await import("@/server/rbac/authorize");
const { AuthenticationRequiredError, PermissionDeniedError, NotCompetitionMemberError } = await import(
  "@/server/errors"
);

beforeEach(() => {
  getActorMock.mockReset();
});

describe("requirePermission()", () => {
  it("бросает AuthenticationRequiredError для гостя", async () => {
    getActorMock.mockResolvedValue(null);
    await expect(requirePermission("competition:create")).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("возвращает actor, если право есть (положительный тест critical permission)", async () => {
    const actor: Actor = {
      userId: "u1",
      email: "a@b.by",
      globalPermissions: new Set(["competition:create"]),
      permissionsByCompetition: new Map(),
    };
    getActorMock.mockResolvedValue(actor);
    await expect(requirePermission("competition:create")).resolves.toBe(actor);
  });

  it("бросает PermissionDeniedError, если прав вообще нет ни на что", async () => {
    const actor: Actor = {
      userId: "u1",
      email: "a@b.by",
      globalPermissions: new Set(),
      permissionsByCompetition: new Map([["comp1", new Set(["score:submit"])]]),
    };
    getActorMock.mockResolvedValue(actor);
    await expect(requirePermission("draw:lock", "comp1")).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("бросает NotCompetitionMemberError, если пользователь вообще не в этом соревновании", async () => {
    const actor: Actor = {
      userId: "u1",
      email: "a@b.by",
      globalPermissions: new Set(),
      permissionsByCompetition: new Map(), // ни в одном соревновании не состоит
    };
    getActorMock.mockResolvedValue(actor);
    await expect(requirePermission("draw:lock", "comp1")).rejects.toBeInstanceOf(NotCompetitionMemberError);
  });
});
