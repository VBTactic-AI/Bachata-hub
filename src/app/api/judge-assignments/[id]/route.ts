import { NextRequest, NextResponse } from "next/server";
import { removeJudgeAssignment } from "@/server/judging/judge-assignment";
import { respondToDomainError } from "@/server/http";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await removeJudgeAssignment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
