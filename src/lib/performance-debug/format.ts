import type { PerfRecord } from "./types";
import { classifyUiThreshold } from "./collector";

const LINE = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

function statusLabel(record: PerfRecord): string {
  if (!record.success) return "CRITICAL";
  const level = classifyUiThreshold(record.totalMs);
  if (level === "excellent" || level === "good") return "GOOD";
  if (level === "noticeable") return "WARNING";
  return "CRITICAL";
}

// Печатает ровно тот формат, который описан в задаче (§16) — консольный
// вывод для сессии ручного тестирования, а не постоянный лог продакшена.
export function formatDiagnosticBlock(record: PerfRecord): string {
  const lines: string[] = [LINE, "JNJ PERFORMANCE DIAGNOSTIC", LINE, `ACTION: ${record.action}`];

  if (record.source === "server") {
    if (record.queries.length > 0) {
      lines.push("Supabase (Prisma)");
      record.queries.forEach((q, i) => lines.push(`  query #${i + 1} ${q.label} — ${q.durationMs.toFixed(0)} ms`));
      lines.push(`  db total ${record.dbTotalMs?.toFixed(0) ?? "?"} ms (${record.queries.length} queries)`);
    }
    lines.push(`SERVER total ${record.totalMs.toFixed(0)} ms`);
  } else {
    if (record.frontendMs != null) lines.push(`Frontend  ${record.frontendMs.toFixed(0)} ms`);
    if (record.networkMs != null) lines.push(`Network   ${record.networkMs.toFixed(0)} ms`);
    if (record.serverMs != null) lines.push(`Server    ${record.serverMs.toFixed(0)} ms`);
    lines.push(`TOTAL click → complete: ${record.totalMs.toFixed(0)} ms`);
  }

  lines.push(`STATUS: ${statusLabel(record)}`);
  if (record.warnings.length > 0) {
    lines.push("REASONS:");
    for (const w of record.warnings) lines.push(`  - ${w}`);
  }
  if (record.bottleneck !== "UNKNOWN") lines.push(`BOTTLENECK: ${record.bottleneck}`);
  lines.push(LINE);
  return lines.join("\n");
}
