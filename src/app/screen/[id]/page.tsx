import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicScreenBoard } from "@/components/screen/PublicScreenBoard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({ where: { id }, select: { name: true } });
  return { title: competition ? `Табло — ${competition.name}` : "Табло" };
}

// Большое табло (Этап 12) — публичная страница без логина, предназначена для
// проекции на экран в зале. Рендерится поверх всего сайта (fixed inset-0 в
// PublicScreenBoard) — переписывать корневой layout ради одной страницы
// не требуется (CLAUDE.md §54).
export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({ where: { id }, select: { status: true } });
  if (!competition || competition.status === "DRAFT") notFound();

  return <PublicScreenBoard competitionId={id} />;
}
