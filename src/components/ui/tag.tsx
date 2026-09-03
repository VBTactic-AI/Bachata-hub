import { cn } from "@/lib/cn";

const TAG_CLASS =
  "inline-block rounded-full bg-primary-light px-[11px] py-[3px] text-[0.78rem] font-semibold text-primary-dark mr-1.5 mb-1.5 transition duration-150 ease-out";

// Тег как текст (список направлений/тегов события) и тег как кликабельная
// кнопка (переключатель города на главной) — разные HTML-элементы, но один
// и тот же внешний вид, поэтому это два маленьких компонента, а не один
// с полиморфным "as".
export function Tag({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(TAG_CLASS, className)} {...props} />;
}

export function TagButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(TAG_CLASS, "cursor-pointer border-none font-body hover:bg-primary-soft active:scale-95", className)}
      {...props}
    />
  );
}
