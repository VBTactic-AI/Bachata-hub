import { NextRequest, NextResponse } from "next/server";
import { calculateResults } from "@/server/results/results";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await calculateResults(id);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return respondToDomainError(e);
  }
}
