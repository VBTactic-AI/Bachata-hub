import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Стандартный хелпер shadcn/ui: объединяет классы и убирает конфликты
// Tailwind-утилит (например, если один вызов передаёт "p-2", а другой "p-4").
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
