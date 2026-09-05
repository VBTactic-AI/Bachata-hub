import { NextRequest, NextResponse } from "next/server";
import { PERF_DEBUG_SERVER } from "@/lib/performance-debug/flag";
import { clearRecords, getReport, recordEntry } from "@/lib/performance-debug/collector";
import { formatDiagnosticBlock } from "@/lib/performance-debug/format";

// Служебный роут ТОЛЬКО для временного Performance Diagnostic Mode
// (docs/PROGRESS.md). При выключенном PERFORMANCE_DEBUG ничего не делает —
// ни принимает, ни отдаёт данные (задача §3/§26: поведение при выключенном
// флаге не должно отличаться от обычного). Никакой персональной информации
// здесь не бывает: клиент (client.ts) шлёт только action/длительности/статус.
export async function GET() {
  if (!PERF_DEBUG_SERVER) return NextResponse.json({ enabled: false });
  return NextResponse.json(getReport());
}

export async function POST(req: NextRequest) {
  if (!PERF_DEBUG_SERVER) return NextResponse.json({ ok: false });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string" || typeof body.totalMs !== "number") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const record = recordEntry({
    action: body.action,
    source: "client",
    success: body.success !== false,
    totalMs: body.totalMs,
    networkMs: typeof body.networkMs === "number" ? body.networkMs : null,
    serverMs: typeof body.serverMs === "number" ? body.serverMs : null,
    frontendMs: typeof body.frontendMs === "number" ? body.frontendMs : null,
    requestCount: typeof body.requestCount === "number" ? body.requestCount : null,
    dedupeKey: typeof body.dedupeKey === "string" ? body.dedupeKey : null,
  });
  console.log(formatDiagnosticBlock(record));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!PERF_DEBUG_SERVER) return NextResponse.json({ ok: false });
  clearRecords();
  return NextResponse.json({ ok: true });
}
