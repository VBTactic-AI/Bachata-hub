import { describe, it, expect } from "vitest";
import type { HeatStatus, RoundStatus } from "@prisma/client";
import { defaultCategoryId, defaultHeatId, defaultRoundId, hasActiveRound, resolveSelected } from "@/components/admin/monitor/selection";

// "Что монитор открывает сам" — правило прогона соревнования, а не деталь
// вёрстки: организатор, открывший вкладку посреди живого этапа, обязан
// увидеть именно текущий этап и текущий заход, а не первый по порядку.

const round = (id: string, status: RoundStatus) => ({ id, status });
const heat = (id: string, status: HeatStatus) => ({ id, status });

describe("defaultRoundId", () => {
  it("выбирает идущий раунд, а не первый по порядку", () => {
    expect(
      defaultRoundId([round("prelim", "COMPLETED"), round("quarter", "RUNNING"), round("final", "DRAFT")])
    ).toBe("quarter");
  });

  it("считает активными все рабочие состояния, включая паузу и подсчёт", () => {
    for (const status of ["DRAWING", "DRAW_LOCKED", "RUNNING", "PAUSED", "SCORING"] as RoundStatus[]) {
      expect(defaultRoundId([round("done", "COMPLETED"), round("live", status)])).toBe("live");
    }
  });

  it("при отсутствии активного берёт первый незакрытый", () => {
    expect(defaultRoundId([round("prelim", "COMPLETED"), round("semi", "READY"), round("final", "DRAFT")])).toBe("semi");
  });

  it("когда всё завершено — показывает последний, а не первый", () => {
    expect(defaultRoundId([round("prelim", "COMPLETED"), round("final", "COMPLETED")])).toBe("final");
  });

  it("на пустом списке ничего не выбирает", () => {
    expect(defaultRoundId([])).toBeNull();
  });
});

describe("defaultCategoryId", () => {
  it("открывает категорию, у которой прямо сейчас идёт этап", () => {
    expect(
      defaultCategoryId([
        { id: "beginner", rounds: [round("b1", "COMPLETED")] },
        { id: "advanced", rounds: [round("a1", "COMPLETED"), round("a2", "RUNNING")] },
      ])
    ).toBe("advanced");
  });

  it("если нигде не идёт — берёт первую незакрытую", () => {
    expect(
      defaultCategoryId([
        { id: "beginner", rounds: [round("b1", "COMPLETED")] },
        { id: "advanced", rounds: [round("a1", "READY")] },
      ])
    ).toBe("advanced");
  });

  it("когда соревнование отработано целиком — первую", () => {
    expect(
      defaultCategoryId([
        { id: "beginner", rounds: [round("b1", "COMPLETED")] },
        { id: "advanced", rounds: [round("a1", "COMPLETED")] },
      ])
    ).toBe("beginner");
  });

  it("категорию без раундов не считает активной", () => {
    expect(hasActiveRound([])).toBe(false);
    expect(defaultCategoryId([{ id: "empty", rounds: [] }, { id: "live", rounds: [round("r", "RUNNING")] }])).toBe("live");
  });
});

describe("defaultHeatId", () => {
  it("показывает заход, который сейчас на паркете", () => {
    expect(defaultHeatId([heat("h1", "FINISHED"), heat("h2", "RUNNING"), heat("h3", "PENDING")])).toBe("h2");
  });

  it("пауза на паркете — тоже текущий заход", () => {
    expect(defaultHeatId([heat("h1", "FINISHED"), heat("h2", "PAUSED"), heat("h3", "PENDING")])).toBe("h2");
  });

  it("если никто не танцует — следующий ожидающий", () => {
    expect(defaultHeatId([heat("h1", "FINISHED"), heat("h2", "FINISHED"), heat("h3", "PENDING")])).toBe("h3");
  });

  it("когда все заходы отработаны — последний", () => {
    expect(defaultHeatId([heat("h1", "FINISHED"), heat("h2", "FINISHED")])).toBe("h2");
  });
});

describe("resolveSelected", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("держит выбор организатора, пока сущность существует", () => {
    expect(resolveSelected(items, "b", "a")).toEqual({ id: "b" });
  });

  it("возвращается к правилу по умолчанию, если выбранное исчезло (заход унесли в разбивку)", () => {
    expect(resolveSelected(items, "removed", "c")).toEqual({ id: "c" });
  });

  it("не падает, когда исчезло и выбранное, и запасное", () => {
    expect(resolveSelected(items, "removed", "also-removed")).toEqual({ id: "a" });
  });

  it("на пустом списке возвращает null, а не первый элемент", () => {
    expect(resolveSelected([], "a", "a")).toBeNull();
  });
});
