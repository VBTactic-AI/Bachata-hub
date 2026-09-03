import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  displayName: z.string().min(1).max(80),
  cityId: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
  danceRole: z.enum(["LEADER", "FOLLOWER", "BOTH"]).optional().or(z.literal("")),
  selfLevel: z.enum(["BEGINNER", "ALL_LEVELS", "ADVANCED"]).optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const data = parsed.data;

  const dancer = await prisma.dancer.update({
    where: { userId: user.id },
    data: {
      displayName: data.displayName,
      cityId: data.cityId || null,
      gender: data.gender || null,
      danceRole: data.danceRole || null,
      selfLevel: data.selfLevel || null,
      avatarUrl: data.avatarUrl || null,
    },
  });

  return NextResponse.json({ ok: true, dancer });
}
