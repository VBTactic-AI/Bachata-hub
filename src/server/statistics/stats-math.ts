// Чистые статистические функции без обращения к БД (Этап 11) — переиспользуются
// в судейской/соревновательной статистике. Судейские формулы (согласие с
// панелью, доля выбросов) не описаны ни в CLAUDE.md, ни в docs/03 конкретными
// числами — реализованы по общепринятым в судейских системах бальных танцев/
// фигурного катания методикам (ранговая корреляция и z-score относительно
// панели), по прямому решению пользователя (2026-09-05) доверить выбор
// конкретных формул исполнителю.

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Стандартное отклонение по всей переданной выборке (population, не sample) —
// здесь это не оценка по случайной подвыборке, а разброс внутри конкретного,
// целиком известного набора оценок одного судьи/панели.
export function stdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = mean(values)!;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Ранги 1..N (1 — наибольшее значение), с усреднением при ничьих —
// стандартный приём для ранговой корреляции.
export function ranks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v);
  const result = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) result[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return result;
}

// Ранговая корреляция Спирмена двух ранжирований одних и тех же участников:
// 1 — полное согласие, -1 — полное противоречие, 0 — нет связи. Формула через
// сумму квадратов разностей рангов — приближение при наличии ничьих
// (усреднённые ранги), общепринятое на практике при небольшом их числе.
export function spearmanCorrelation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const sumD2 = ra.reduce((sum, r, idx) => sum + (r - rb[idx]) ** 2, 0);
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}
