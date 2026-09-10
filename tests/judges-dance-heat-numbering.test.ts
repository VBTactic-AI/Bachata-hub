import { describe, it, expect } from "vitest";
import { computeJudgesDanceHeatNumbering } from "@/lib/judges-dance-heat-numbering";

describe("computeJudgesDanceHeatNumbering()", () => {
  it("нумерует заходы заново с 1 для каждой роли — не сквозным Heat.number", () => {
    const result = computeJudgesDanceHeatNumbering([
      { id: "h1", number: 1, dancerRole: "LEADER" },
      { id: "h2", number: 2, dancerRole: "LEADER" },
      { id: "h3", number: 3, dancerRole: "FOLLOWER" },
      { id: "h4", number: 4, dancerRole: "FOLLOWER" },
    ]);

    expect(result.get("h1")).toEqual({ number: 1, total: 2 });
    expect(result.get("h2")).toEqual({ number: 2, total: 2 });
    // Ключевая проверка запроса пользователя: заход №3 в БД (сквозной
    // Heat.number) должен показываться как "Заход 1" своей роли, а не "3".
    expect(result.get("h3")).toEqual({ number: 1, total: 2 });
    expect(result.get("h4")).toEqual({ number: 2, total: 2 });
  });

  it("одна стадия, один заход — «1 из 1» для каждой роли отдельно", () => {
    const result = computeJudgesDanceHeatNumbering([
      { id: "h1", number: 1, dancerRole: "LEADER" },
      { id: "h2", number: 2, dancerRole: "FOLLOWER" },
    ]);

    expect(result.get("h1")).toEqual({ number: 1, total: 1 });
    expect(result.get("h2")).toEqual({ number: 1, total: 1 });
  });

  it("не зависит от порядка на входе — сортирует по Heat.number сама", () => {
    const result = computeJudgesDanceHeatNumbering([
      { id: "h2", number: 2, dancerRole: "LEADER" },
      { id: "h1", number: 1, dancerRole: "LEADER" },
    ]);

    expect(result.get("h1")).toEqual({ number: 1, total: 2 });
    expect(result.get("h2")).toEqual({ number: 2, total: 2 });
  });

  it("заход без вызванных участников (dancerRole=null) не путает счётчик настоящих стадий", () => {
    const result = computeJudgesDanceHeatNumbering([
      { id: "h1", number: 1, dancerRole: "LEADER" },
      { id: "h2", number: 2, dancerRole: null },
      { id: "h3", number: 3, dancerRole: "LEADER" },
    ]);

    expect(result.get("h1")).toEqual({ number: 1, total: 2 });
    expect(result.get("h3")).toEqual({ number: 2, total: 2 });
    expect(result.get("h2")).toEqual({ number: 1, total: 1 });
  });
});
