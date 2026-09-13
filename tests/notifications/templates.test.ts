import { describe, it, expect, vi, beforeEach } from "vitest";

const notificationTemplateFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { notificationTemplate: { findUnique: (...a: unknown[]) => notificationTemplateFindUnique(...a) } },
}));

const { renderTemplate, getActiveTemplate, TemplateNotFoundError } = await import("@/server/notifications/templates");

beforeEach(() => {
  notificationTemplateFindUnique.mockReset();
});

describe("renderTemplate() — простая {{var}}-подстановка, без библиотеки шаблонизации", () => {
  it("подставляет несколько переменных", () => {
    expect(renderTemplate("{{title}} — {{date}}", { title: "Bachata Night", date: "20 сентября" })).toBe(
      "Bachata Night — 20 сентября"
    );
  });

  it("отсутствующая переменная — пустая строка, не 'undefined'/'null'", () => {
    expect(renderTemplate("«{{title}}» отменено", {})).toBe("«» отменено");
  });

  it("num/boolean значения приводятся к строке", () => {
    expect(renderTemplate("Мест: {{count}}", { count: 5 })).toBe("Мест: 5");
  });
});

describe("getActiveTemplate()", () => {
  it("возвращает активный шаблон по ключу", async () => {
    notificationTemplateFindUnique.mockResolvedValue({ key: "EVENT_PUBLISHED", isActive: true, titleTemplate: "x" });

    const template = await getActiveTemplate("EVENT_PUBLISHED");

    expect(template.key).toBe("EVENT_PUBLISHED");
    expect(notificationTemplateFindUnique).toHaveBeenCalledWith({ where: { key: "EVENT_PUBLISHED" } });
  });

  it("несуществующий ключ — TemplateNotFoundError", async () => {
    notificationTemplateFindUnique.mockResolvedValue(null);

    await expect(getActiveTemplate("GHOST")).rejects.toThrow(TemplateNotFoundError);
  });

  it("isActive=false — тоже TemplateNotFoundError (выключенный шаблон не используется)", async () => {
    notificationTemplateFindUnique.mockResolvedValue({ key: "EVENT_PUBLISHED", isActive: false });

    await expect(getActiveTemplate("EVENT_PUBLISHED")).rejects.toThrow(TemplateNotFoundError);
  });
});
