"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { InfoIcon } from "@/components/admin/icons";
import type { Band } from "@/lib/statistics/status-labels";

export type LegendEntry = {
  title: string;
  description: string;
  bands: Band[];
  /** Переводит границу диапазона (число из Band.max) в подпись для человека, например 0.4 -> "40%". */
  formatBoundary: (max: number) => string;
};

// Кнопка "Что означают эти показатели?" — раскрывает те же диапазоны, что
// реально применяет src/lib/statistics/status-labels.ts (один источник
// правды: числа в легенде и логика статусов не могут разойтись, легенда
// строится из тех же массивов Band). По прямому запросу пользователя
// (2026-09-11) — статусы понятны не всем, нужна расшифровка "какая цифра
// для какого статуса в каком диапазоне".
export function MetricLegend({ entries }: { entries: LegendEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-admin-border bg-admin-card2 px-3 py-1.5 text-xs font-semibold text-admin-muted transition-colors hover:text-night-text"
      >
        <InfoIcon />
        {open ? "Скрыть расшифровку показателей" : "Что означают эти показатели?"}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-4 rounded-app border border-admin-border bg-admin-card2 p-3">
          {entries.map((entry) => (
            <div key={entry.title} className="flex flex-col gap-1.5">
              <p className="m-0 text-sm font-semibold text-night-text">{entry.title}</p>
              <p className="m-0 text-xs text-admin-muted">{entry.description}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {entry.bands.map((band, i) => {
                  const prevMax = i > 0 ? entry.bands[i - 1].max : null;
                  const rangeText =
                    prevMax === null
                      ? `до ${entry.formatBoundary(band.max)}`
                      : band.max === Infinity
                        ? `от ${entry.formatBoundary(prevMax)}`
                        : `${entry.formatBoundary(prevMax)} – ${entry.formatBoundary(band.max)}`;
                  return (
                    <div key={band.label} className="flex items-center gap-1.5">
                      <StatusBadge label={band.label} variant={band.variant} />
                      <span className="text-[11px] text-admin-disabled">{rangeText}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
