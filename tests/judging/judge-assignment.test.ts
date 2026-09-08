import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

// setDivisionJudges после снятия судьи перепроверяет готовность идущих
// раундов (снятый судья меняет знаменатель "собрано X из N") — сам расчёт
// проверяется в advancement.test.ts, здесь достаточно факта вызова.
const maybeFinalizeAfterScoreInTxMock = vi.fn();
vi.mock("@/server/judging/advancement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/judging/advancement")>();
  return { ...actual, maybeFinalizeAfterScoreInTx: (...a: unknown[]) => maybeFinalizeAfterScoreInTxMock(...a) };
});

const divisionFindUniqueOrThrow = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const judgeAssignmentFindUnique = vi.fn();
const judgeScoreFindMany = vi.fn();
const judgeScoreFindFirst = vi.fn();
const finalJudgeScoreFindMany = vi.fn();
const finalJudgeScoreFindFirst = vi.fn();
const judgeRoundConfirmationFindMany = vi.fn();
const judgeRoundConfirmationFindFirst = vi.fn();
const userFindMany = vi.fn();
const userFindUnique = vi.fn();
const roleFindUniqueOrThrow = vi.fn();
const competitionMemberFindUnique = vi.fn();
const txJudgeAssignmentDelete = vi.fn();
const txJudgeAssignmentDeleteMany = vi.fn();
const txJudgeAssignmentCreate = vi.fn();
const txCompetitionMemberDelete = vi.fn();
const auditCreate = vi.fn();

const txRoundFindMany = vi.fn();
// Добавление судьи попутно выдаёт ему членство в соревновании с ролью JUDGE
// (grantJudgeCompetitionMembership) — до этих тестов путь добавления ни разу
// не доходил до конца, поэтому этих двух моков в фейке не было.
const txRoleFindUniqueOrThrow = vi.fn();
const txCompetitionMemberUpsert = vi.fn();

const fakeTx = {
  judgeAssignment: { delete: txJudgeAssignmentDelete, deleteMany: txJudgeAssignmentDeleteMany, create: txJudgeAssignmentCreate },
  round: { findMany: txRoundFindMany },
  role: { findUniqueOrThrow: txRoleFindUniqueOrThrow, findFirstOrThrow: txRoleFindUniqueOrThrow },
  competitionMember: { upsert: txCompetitionMemberUpsert, delete: txCompetitionMemberDelete },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a) },
    judgeAssignment: {
      findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a),
      findUnique: (...a: unknown[]) => judgeAssignmentFindUnique(...a),
    },
    judgeScore: { findMany: (...a: unknown[]) => judgeScoreFindMany(...a), findFirst: (...a: unknown[]) => judgeScoreFindFirst(...a) },
    finalJudgeScore: { findMany: (...a: unknown[]) => finalJudgeScoreFindMany(...a), findFirst: (...a: unknown[]) => finalJudgeScoreFindFirst(...a) },
    judgeRoundConfirmation: {
      findMany: (...a: unknown[]) => judgeRoundConfirmationFindMany(...a),
      findFirst: (...a: unknown[]) => judgeRoundConfirmationFindFirst(...a),
    },
    user: { findMany: (...a: unknown[]) => userFindMany(...a), findUnique: (...a: unknown[]) => userFindUnique(...a) },
    role: { findUniqueOrThrow: (...a: unknown[]) => roleFindUniqueOrThrow(...a) },
    competitionMember: { findUnique: (...a: unknown[]) => competitionMemberFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { setDivisionJudges, assignJudge, addCompetitionJudge, removeCompetitionJudge } = await import("@/server/judging/judge-assignment");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ competitionId: "comp1" });
  judgeAssignmentFindMany.mockReset().mockResolvedValue([{ id: "asg-old", role: "LEADER", judgeUserId: "judge-old" }]);
  judgeScoreFindMany.mockReset().mockResolvedValue([]);
  judgeScoreFindFirst.mockReset().mockResolvedValue(null);
  finalJudgeScoreFindMany.mockReset().mockResolvedValue([]);
  finalJudgeScoreFindFirst.mockReset().mockResolvedValue(null);
  judgeRoundConfirmationFindMany.mockReset().mockResolvedValue([]);
  judgeRoundConfirmationFindFirst.mockReset().mockResolvedValue(null);
  userFindMany.mockReset().mockResolvedValue([{ email: "old@judge.by" }]);
  userFindUnique.mockReset();
  roleFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "role-judge" });
  competitionMemberFindUnique.mockReset().mockResolvedValue({ id: "member1" });
  judgeAssignmentFindUnique.mockReset().mockResolvedValue(null);
  txJudgeAssignmentDelete.mockReset();
  txJudgeAssignmentDeleteMany.mockReset();
  txJudgeAssignmentCreate.mockReset().mockResolvedValue({ id: "asg-new" });
  txCompetitionMemberDelete.mockReset();
  txRoundFindMany.mockReset().mockResolvedValue([]);
  txRoleFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "role-judge" });
  txCompetitionMemberUpsert.mockReset();
  maybeFinalizeAfterScoreInTxMock.mockReset();
  auditCreate.mockReset();
});

// JUDGE-001: раньше removeDrawHelper-подобная попытка убрать судью, который
// уже что-то оценил, падала необработанной FK-ошибкой БД (JudgeScore/
// FinalJudgeScore/JudgeRoundConfirmation -> JudgeAssignment, ON DELETE
// RESTRICT) и превращалась в общий 500. Теперь проверяется заранее.
describe("setDivisionJudges() — JUDGE-001", () => {
  it("убирает судью без оценок как обычно", async () => {
    await setDivisionJudges("div1", [], []);

    expect(txJudgeAssignmentDelete).toHaveBeenCalledWith({ where: { id: "asg-old" } });
  });

  it("отклоняет удаление судьи, у которого уже есть JudgeScore — называет его email", async () => {
    judgeScoreFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", [], [])).rejects.toThrow(/old@judge\.by/);
    expect(txJudgeAssignmentDelete).not.toHaveBeenCalled();
  });

  it("отклоняет удаление судьи, у которого уже есть FinalJudgeScore", async () => {
    finalJudgeScoreFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", [], [])).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeAssignmentDelete).not.toHaveBeenCalled();
  });

  it("отклоняет удаление судьи, который уже нажал JudgeRoundConfirmation", async () => {
    judgeRoundConfirmationFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", [], [])).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeAssignmentDelete).not.toHaveBeenCalled();
  });

  it("блокирует весь дифф разом, если хоть одно удаление заблокировано (даже если заодно добавляют новых судей)", async () => {
    judgeScoreFindMany.mockResolvedValue([{ judgeAssignmentId: "asg-old" }]);

    await expect(setDivisionJudges("div1", ["judge-new"], [])).rejects.toBeInstanceOf(ValidationFailedError);
    // Ничего не применено частично — ни удаление, ни добавление.
    expect(txJudgeAssignmentCreate).not.toHaveBeenCalled();
  });
});

// Реальный случай на конкурсе (2026-09-08): судья нажал "Готово", после чего
// организатор снял двух лишних судей. Готовность раунда считается как
// "подтвердили X из N назначенных" — снятие судьи уменьшает N, то есть может
// сделать раунд готовым. Раньше это нигде не перепроверялось, и раунд
// оставался в SCORING навсегда, блокируя следующий раунд дивизиона.
describe("setDivisionJudges() — снятие судьи перепроверяет готовность идущих раундов", () => {
  it("после снятия судьи вызывает пересчёт для каждого идущего обычного раунда дивизиона", async () => {
    txRoundFindMany.mockResolvedValue([{ id: "round1" }, { id: "round2" }]);

    await setDivisionJudges("div1", [], []);

    expect(txRoundFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          divisionId: "div1",
          type: null,
          status: { in: ["RUNNING", "FINISHED", "SCORING"] },
        }),
      })
    );
    expect(maybeFinalizeAfterScoreInTxMock).toHaveBeenCalledTimes(2);
    expect(maybeFinalizeAfterScoreInTxMock).toHaveBeenCalledWith(expect.anything(), "round1", actor);
    expect(maybeFinalizeAfterScoreInTxMock).toHaveBeenCalledWith(expect.anything(), "round2", actor);
  });

  it("добавление судьи пересчёт не запускает — оно только увеличивает N", async () => {
    // Текущий состав уже совпадает с желаемым по LEADER, добавляется только новый.
    judgeAssignmentFindMany.mockResolvedValue([{ id: "asg-old", role: "LEADER", judgeUserId: "judge-old" }]);

    await setDivisionJudges("div1", ["judge-old", "judge-new"], []);

    expect(txJudgeAssignmentCreate).toHaveBeenCalled();
    expect(txJudgeAssignmentDelete).not.toHaveBeenCalled();
    expect(maybeFinalizeAfterScoreInTxMock).not.toHaveBeenCalled();
  });
});

// Чекбоксы (batch-добавление, DivisionJudgesPanel) собирают роль на клиенте
// ДО отправки — критическая логика не может быть только на frontend
// (CLAUDE.md §1/§8-9), поэтому setDivisionJudges перепроверяет пол сама.
describe("setDivisionJudges() — сервер перепроверяет роль по полу для новых судей", () => {
  it("пропускает добавление, если роль совпадает с полом", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([{ id: "judge-new", email: "new@x.by", dancer: { gender: "MALE" } }]);

    await setDivisionJudges("div1", ["judge-new"], []);

    expect(txJudgeAssignmentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "LEADER" }) }));
  });

  it("отклоняет батч, если роль в списке не совпадает с полом судьи", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([{ id: "judge-new", email: "new@x.by", dancer: { gender: "MALE" } }]);

    // Мужской судья попал в followerJudgeUserIds — не должен пройти.
    await expect(setDivisionJudges("div1", [], ["judge-new"])).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeAssignmentCreate).not.toHaveBeenCalled();
  });

  it("пропускает добавление без ограничений, если пол не указан", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([{ id: "judge-new", email: "new@x.by", dancer: null }]);

    await setDivisionJudges("div1", [], ["judge-new"]);

    expect(txJudgeAssignmentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "FOLLOWER" }) }));
  });
});

// Роль судьи вычисляется из его пола автоматически (по прямому запросу
// пользователя, 2026-09-09) — разворот прежнего A6/A13 ("пол — только
// подсказка"). Ручной выбор роли остаётся только запасным путём, когда пол в
// профиле не указан вовсе.
describe("assignJudge() — роль по полу судьи", () => {
  it("мужской пол → роль LEADER (судит партнёров)", async () => {
    userFindUnique.mockResolvedValue({ id: "judge1", email: "j1@x.by", dancer: { gender: "MALE" } });
    txJudgeAssignmentCreate.mockResolvedValue({ id: "asg1" });

    const result = await assignJudge("div1", "judge1");

    expect(txJudgeAssignmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ divisionId: "div1", judgeUserId: "judge1", role: "LEADER" }) })
    );
    expect(result).toEqual({ id: "asg1" });
  });

  it("женский пол → роль FOLLOWER (судит партнёрш)", async () => {
    userFindUnique.mockResolvedValue({ id: "judge2", email: "j2@x.by", dancer: { gender: "FEMALE" } });
    txJudgeAssignmentCreate.mockResolvedValue({ id: "asg2" });

    await assignJudge("div1", "judge2");

    expect(txJudgeAssignmentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "FOLLOWER" }) }));
  });

  it("пол известен — явно переданная роль игнорируется, используется вычисленная", async () => {
    userFindUnique.mockResolvedValue({ id: "judge1", email: "j1@x.by", dancer: { gender: "MALE" } });
    txJudgeAssignmentCreate.mockResolvedValue({ id: "asg1" });

    await assignJudge("div1", "judge1", "FOLLOWER");

    expect(txJudgeAssignmentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "LEADER" }) }));
  });

  it("пол не указан и роль не передана — понятная ошибка, а не молчаливый провал", async () => {
    userFindUnique.mockResolvedValue({ id: "judge3", email: "j3@x.by", dancer: null });

    await expect(assignJudge("div1", "judge3")).rejects.toThrow(/Укажите роль вручную/);
    expect(txJudgeAssignmentCreate).not.toHaveBeenCalled();
  });

  it("пол не указан, но роль передана явно — использует её (запасной путь)", async () => {
    userFindUnique.mockResolvedValue({ id: "judge3", email: "j3@x.by", dancer: null });
    txJudgeAssignmentCreate.mockResolvedValue({ id: "asg3" });

    await assignJudge("div1", "judge3", "FOLLOWER");

    expect(txJudgeAssignmentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "FOLLOWER" }) }));
  });

  it("судья не найден — понятная ошибка", async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(assignJudge("div1", "ghost")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет повторное назначение той же роли в той же категории", async () => {
    userFindUnique.mockResolvedValue({ id: "judge1", email: "j1@x.by", dancer: { gender: "MALE" } });
    judgeAssignmentFindUnique.mockResolvedValue({ id: "existing" });

    await expect(assignJudge("div1", "judge1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeAssignmentCreate).not.toHaveBeenCalled();
  });
});

// "Общий список судей" (вкладка "Судьи") — судья появляется в ростере
// соревнования сразу после добавления, ещё не будучи назначен ни на одну
// категорию (2026-09-09) — переиспользует тот же upsert, что и
// grantJudgeCompetitionMembership внутри assignJudge, поэтому идемпотентен.
describe("addCompetitionJudge()", () => {
  it("добавляет судью в общий ростер соревнования", async () => {
    userFindUnique.mockResolvedValue({ id: "judge1", email: "j1@x.by" });
    txCompetitionMemberUpsert.mockResolvedValue({ id: "member1" });

    const result = await addCompetitionJudge("comp1", "judge1");

    expect(txCompetitionMemberUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { competitionId_userId_roleId: { competitionId: "comp1", userId: "judge1", roleId: "role-judge" } },
        update: {},
      })
    );
    expect(result).toEqual({ id: "member1" });
  });

  it("судья не найден — понятная ошибка", async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(addCompetitionJudge("comp1", "ghost")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txCompetitionMemberUpsert).not.toHaveBeenCalled();
  });
});

// Удаление судьи из "Общий список судей" (кнопка-корзина, 2026-09-09) —
// снимает все его назначения по категориям + сам CompetitionMember(JUDGE),
// тот же JUDGE-001-guard, что и в setDivisionJudges.
describe("removeCompetitionJudge()", () => {
  it("убирает судью без оценок — снимает назначения и членство", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "asg1", divisionId: "div1" },
      { id: "asg2", divisionId: "div2" },
    ]);

    await removeCompetitionJudge("comp1", "judge1");

    expect(txJudgeAssignmentDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["asg1", "asg2"] } } });
    expect(txCompetitionMemberDelete).toHaveBeenCalledWith({ where: { id: "member1" } });
  });

  it("отклоняет удаление, если судья уже выставлял оценки", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "asg1", divisionId: "div1" }]);
    judgeScoreFindFirst.mockResolvedValue({ id: "score1" });

    await expect(removeCompetitionJudge("comp1", "judge1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txJudgeAssignmentDeleteMany).not.toHaveBeenCalled();
    expect(txCompetitionMemberDelete).not.toHaveBeenCalled();
  });

  it("отклоняет удаление, если судья уже подтверждал раунд (JudgeRoundConfirmation)", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "asg1", divisionId: "div1" }]);
    judgeRoundConfirmationFindFirst.mockResolvedValue({ id: "conf1" });

    await expect(removeCompetitionJudge("comp1", "judge1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txCompetitionMemberDelete).not.toHaveBeenCalled();
  });

  it("судья не найден в ростере соревнования — понятная ошибка", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);
    competitionMemberFindUnique.mockResolvedValue(null);

    await expect(removeCompetitionJudge("comp1", "ghost")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txCompetitionMemberDelete).not.toHaveBeenCalled();
  });

  it("без назначений вообще — убирает только членство, без ошибок", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);

    await removeCompetitionJudge("comp1", "judge1");

    expect(txJudgeAssignmentDeleteMany).not.toHaveBeenCalled();
    expect(txCompetitionMemberDelete).toHaveBeenCalledWith({ where: { id: "member1" } });
  });

  it("перепроверяет готовность идущих раундов затронутых категорий", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "asg1", divisionId: "div1" }]);
    txRoundFindMany.mockResolvedValue([{ id: "round1" }]);

    await removeCompetitionJudge("comp1", "judge1");

    expect(txRoundFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ divisionId: "div1", type: null }) })
    );
    expect(maybeFinalizeAfterScoreInTxMock).toHaveBeenCalledWith(expect.anything(), "round1", actor);
  });
});
