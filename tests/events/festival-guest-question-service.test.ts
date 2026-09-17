import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const festivalFindUnique = vi.fn();
const questionFindUnique = vi.fn();
const questionFindMany = vi.fn();
const questionCreate = vi.fn();
const questionUpdate = vi.fn();
const questionCount = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    festivalGuestQuestion: {
      findUnique: (...a: unknown[]) => questionFindUnique(...a),
      findMany: (...a: unknown[]) => questionFindMany(...a),
      create: (...a: unknown[]) => questionCreate(...a),
      update: (...a: unknown[]) => questionUpdate(...a),
      count: (...a: unknown[]) => questionCount(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const {
  submitGuestQuestion,
  moderateGuestQuestion,
  answerGuestQuestion,
  listGuestQuestions,
  listPublicGuestQuestions,
  FestivalGuestQuestionValidationError,
  FestivalGuestQuestionRateLimitError,
} = await import("@/server/events/festival-guest-question-service");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "user1@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "ORGANIZER",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    isVerifiedEventOrganizer: false,
    isVerifiedFestivalOrganizer: false,
    ...overrides,
  } as User;
}

const owner = makeUser({ id: "owner1" });
const stranger = makeUser({ id: "stranger1" });
const baseFestival = { id: "fest1", createdById: "owner1", eventId: null as string | null };
const baseQuestion = {
  id: "q1",
  festivalId: "fest1",
  askerName: "Максим",
  question: "Будет ли трансляция?",
  moderationStatus: "PENDING" as const,
  moderatedById: null as string | null,
  moderatedAt: null as Date | null,
  answer: null as string | null,
  answeredById: null as string | null,
  answeredAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  questionFindUnique.mockResolvedValue({ ...baseQuestion, festival: { ...baseFestival } });
  questionCreate.mockImplementation((args) => Promise.resolve({ ...baseQuestion, ...args.data }));
  questionUpdate.mockImplementation((args) => Promise.resolve({ ...baseQuestion, ...args.data }));
  questionCount.mockResolvedValue(0);
  eventTeamMemberFindUnique.mockResolvedValue(null);
});

describe("submitGuestQuestion() — анонимно, без логина", () => {
  it("NotFound, если фестиваля нет", async () => {
    festivalFindUnique.mockResolvedValue(null);
    await expect(submitGuestQuestion("missing", { question: "Q?" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("вопрос не может быть пустым", async () => {
    await expect(submitGuestQuestion("fest1", { question: "  " })).rejects.toBeInstanceOf(FestivalGuestQuestionValidationError);
  });

  it("создаёт вопрос без имени (полностью анонимно)", async () => {
    await submitGuestQuestion("fest1", { question: "Можно с ребёнком?" });
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ festivalId: "fest1", askerName: null, moderationStatus: "PENDING" }) })
    );
  });

  it("без submitterIp лимит не проверяется вообще (count не вызывается)", async () => {
    await submitGuestQuestion("fest1", { question: "Q?" });
    expect(questionCount).not.toHaveBeenCalled();
  });

  it("под лимитом — создаёт вопрос", async () => {
    questionCount.mockResolvedValue(2);
    await submitGuestQuestion("fest1", { question: "Q?", submitterIp: "1.2.3.4" });
    expect(questionCreate).toHaveBeenCalled();
  });

  it("превышен лимит (3 вопроса за 10 минут с одного IP) — отказ", async () => {
    questionCount.mockResolvedValue(3);
    await expect(submitGuestQuestion("fest1", { question: "Q?", submitterIp: "1.2.3.4" })).rejects.toBeInstanceOf(
      FestivalGuestQuestionRateLimitError
    );
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it("лимит считается по festivalId+IP+окну времени", async () => {
    await submitGuestQuestion("fest1", { question: "Q?", submitterIp: "1.2.3.4" });
    expect(questionCount).toHaveBeenCalledWith({
      where: { festivalId: "fest1", submitterIp: "1.2.3.4", createdAt: { gte: expect.any(Date) } },
    });
  });
});

describe("moderateGuestQuestion()", () => {
  it("постороннему запрещено", async () => {
    await expect(moderateGuestQuestion("q1", stranger, "APPROVED")).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("организатор одобряет — moderationStatus меняется, answer не трогается", async () => {
    await moderateGuestQuestion("q1", owner, "APPROVED");
    expect(questionUpdate).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { moderationStatus: "APPROVED", moderatedById: "owner1", moderatedAt: expect.any(Date) },
    });
  });
});

describe("answerGuestQuestion()", () => {
  it("постороннему запрещено", async () => {
    await expect(answerGuestQuestion("q1", stranger, "Ответ")).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("ответ не может быть пустым", async () => {
    await expect(answerGuestQuestion("q1", owner, "   ")).rejects.toBeInstanceOf(FestivalGuestQuestionValidationError);
  });

  it("организатор отвечает — не требует, чтобы вопрос уже был APPROVED", async () => {
    questionFindUnique.mockResolvedValue({ ...baseQuestion, moderationStatus: "PENDING", festival: { ...baseFestival } });
    await answerGuestQuestion("q1", owner, "Да, будет трансляция.");
    expect(questionUpdate).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { answer: "Да, будет трансляция.", answeredById: "owner1", answeredAt: expect.any(Date) },
    });
  });
});

describe("listGuestQuestions() / listPublicGuestQuestions()", () => {
  it("постороннему запрещена очередь организатора", async () => {
    await expect(listGuestQuestions("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("организатор видит все вопросы", async () => {
    questionFindMany.mockResolvedValue([baseQuestion]);
    const result = await listGuestQuestions("fest1", owner);
    expect(questionFindMany).toHaveBeenCalledWith({ where: { festivalId: "fest1" }, orderBy: { createdAt: "desc" } });
    expect(result).toHaveLength(1);
  });

  it("публичный список — только APPROVED, без RBAC", async () => {
    questionFindMany.mockResolvedValue([{ ...baseQuestion, moderationStatus: "APPROVED" }]);
    await listPublicGuestQuestions("fest1");
    expect(questionFindMany).toHaveBeenCalledWith({
      where: { festivalId: "fest1", moderationStatus: "APPROVED" },
      orderBy: { createdAt: "desc" },
    });
  });
});
