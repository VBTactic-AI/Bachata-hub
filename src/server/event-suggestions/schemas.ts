import { z } from "zod";

// §7 ТЗ (Event Suggestions) — форма сознательно лёгкая: обычный пользователь
// часто не знает точных деталей (адрес площадки, точный формат) — он просто
// слышал/увидел анонс. cityId/proposedDate/link — необязательны.
export const suggestEventSchema = z.object({
  title: z.string().min(3, "Слишком короткое название").max(160),
  description: z.string().min(10, "Опишите подробнее — что за событие, где и когда").max(2000),
  cityId: z.string().optional(),
  proposedDate: z.string().optional(),
  link: z.string().url("Похоже, это не ссылка").optional().or(z.literal("")),
});
export type SuggestEventInput = z.infer<typeof suggestEventSchema>;
