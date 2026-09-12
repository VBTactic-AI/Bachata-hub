import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(req: Request) {
  await destroySession();
  // 303, а не дефолтные 307: браузер должен переотправить запрос к "/" методом
  // GET, а не повторить POST — иначе страница (page.tsx, только GET) ответит 405.
  return NextResponse.redirect(new URL("/", req.url), 303);
}
