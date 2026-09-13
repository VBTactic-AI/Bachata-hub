import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications } from "@/server/notifications/notification-center";

const querySchema = z.object({
  unread: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse({
    unread: req.nextUrl.searchParams.get("unread") ?? undefined,
    cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { notifications, nextCursor } = await listNotifications(user.id, {
    unreadOnly: parsed.data.unread === "true",
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  return NextResponse.json({ notifications, nextCursor });
}
