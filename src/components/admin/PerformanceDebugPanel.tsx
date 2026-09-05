"use client";

import { useEffect, useState } from "react";
import type { PerfReport } from "@/lib/performance-debug/types";

// Временная debug-панель (задача §21). Рендерится в layout.tsx только когда
// NEXT_PUBLIC_PERFORMANCE_DEBUG=true — при выключенном флаге компонент даже
// не монтируется, на обычный UI никак не влияет.
export function PerformanceDebugPanel() {
  const [report, setReport] = useState<PerfReport | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/perf-debug");
        const data = (await res.json()) as PerfReport;
        if (!cancelled) setReport(data);
      } catch {
        // диагностика не должна ронять страницу при недоступности роута
      }
    }
    void poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!report || !report.enabled) return null;

  const worst = [...report.stats].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 5);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 9999,
        fontFamily: "monospace",
        fontSize: 12,
        background: "#111",
        color: "#0f0",
        border: "1px solid #333",
        borderRadius: 6,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        maxWidth: open ? 360 : 160,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", color: "#0f0", border: "none", cursor: "pointer" }}
      >
        ⏱ Perf: {report.totalRequests} · avg {avgAll(report).toFixed(0)}ms {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px", maxHeight: 300, overflowY: "auto" }}>
          <div>Requests: {report.totalRequests}</div>
          <div>Duplicate: {report.duplicateRequestCount}</div>
          <div>Potential N+1: {report.potentialNPlusOneCount}</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>Slowest actions (P95):</div>
          {worst.map((s) => (
            <div key={s.action} style={{ color: s.status === "CRITICAL" ? "#f55" : s.status === "WARNING" ? "#fd0" : "#0f0" }}>
              {s.action} — {s.p95Ms.toFixed(0)}ms ({s.count}×) [{s.status}]
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function avgAll(report: PerfReport): number {
  if (report.stats.length === 0) return 0;
  return report.stats.reduce((s, a) => s + a.avgMs * a.count, 0) / report.totalRequests;
}
