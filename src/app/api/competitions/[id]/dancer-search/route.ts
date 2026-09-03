import { NextRequest, NextResponse } from "next/server";
import { searchDancersByName } from "@/server/competition/search-dancers";
import { respondToDomainError } from "@/server/http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchDancersByName(id, q);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return respondToDomainError(e);
  }
}
