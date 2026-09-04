import { describe, it, expect } from "vitest";
import { mean, stdDev, ranks, spearmanCorrelation } from "@/server/statistics/stats-math";

describe("mean()", () => {
  it("возвращает null для пустого массива", () => {
    expect(mean([])).toBeNull();
  });
  it("считает среднее арифметическое", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });
});

describe("stdDev()", () => {
  it("возвращает null для пустого массива", () => {
    expect(stdDev([])).toBeNull();
  });
  it("равно 0, если все значения одинаковые", () => {
    expect(stdDev([5, 5, 5])).toBe(0);
  });
  it("считает стандартное отклонение по всей выборке (population)", () => {
    // [2,4,4,4,5,5,7,9] — классический пример, population stdDev = 2
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });
});

describe("ranks()", () => {
  it("наибольшему значению присваивает ранг 1", () => {
    expect(ranks([10, 30, 20])).toEqual([3, 1, 2]);
  });
  it("усредняет ранги при ничьих", () => {
    // [10,10,5] -> два первых места делят ранги 1 и 2 -> по 1.5, третий получает 3
    expect(ranks([10, 10, 5])).toEqual([1.5, 1.5, 3]);
  });
});

describe("spearmanCorrelation()", () => {
  it("null, если длины не совпадают или меньше 2 элементов", () => {
    expect(spearmanCorrelation([1], [1])).toBeNull();
    expect(spearmanCorrelation([1, 2], [1])).toBeNull();
  });
  it("1, если ранжирования полностью совпадают", () => {
    expect(spearmanCorrelation([10, 20, 30], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it("-1, если ранжирования полностью противоположны", () => {
    expect(spearmanCorrelation([10, 20, 30], [3, 2, 1])).toBeCloseTo(-1, 5);
  });
  it("0, если связи нет (сбалансированная перестановка)", () => {
    expect(spearmanCorrelation([4, 3, 2, 1], [3, 1, 4, 2])).toBeCloseTo(0, 5);
  });
});
