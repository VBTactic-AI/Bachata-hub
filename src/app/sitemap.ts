import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const [events, schools] = await Promise.all([
    prisma.event.findMany({
      where: { moderationStatus: "APPROVED", isArchived: false },
      select: { slug: true, updatedAt: true },
    }),
    prisma.school.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/events`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${siteUrl}/schools`, changeFrequency: "daily", priority: 0.8 },
    ...events.map((e) => ({
      url: `${siteUrl}/events/${e.slug}`,
      lastModified: e.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...schools.map((s) => ({
      url: `${siteUrl}/schools/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
