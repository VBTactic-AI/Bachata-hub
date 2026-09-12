import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303, а не дефолтные 307: браузер должен переотправить запрос к "/" методом
  // GET, а не повторить POST — иначе страница (page.tsx, только GET) ответит 405.
  return NextResponse.redirect(new URL("/", req.url), 303);
}
