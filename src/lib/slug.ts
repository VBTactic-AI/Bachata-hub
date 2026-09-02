import slugify from "slugify";
import { prisma } from "./prisma";

// Транслитерация кириллицы в человекочитаемый URL-slug (SEO-требование ТЗ).
const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => CYRILLIC_MAP[ch] ?? ch)
    .join("");
}

export function baseSlug(input: string): string {
  return slugify(transliterate(input), { lower: true, strict: true });
}

// Гарантирует уникальность slug'а в таблице `model` (school | event), добавляя
// числовой суффикс при коллизии.
export async function uniqueSlug(
  model: "school" | "event",
  input: string
): Promise<string> {
  const base = baseSlug(input) || "item";
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing =
      model === "school"
        ? await prisma.school.findUnique({ where: { slug: candidate } })
        : await prisma.event.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}
