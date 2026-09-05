import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// buttonVariants экспортируется отдельно от <Button>, чтобы этот же набор
// классов можно было навесить на <Link> (у нас много ссылок, которые
// визуально выглядят кнопкой — раньше это было className="btn").
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold font-body cursor-pointer transition duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-white shadow-sm hover:brightness-[1.06] hover:shadow-md hover:-translate-y-px active:scale-[0.96] active:brightness-[0.98] active:shadow-sm",
        secondary:
          "border border-primary-soft bg-transparent text-primary hover:bg-primary-light",
        outline:
          "border border-line bg-surface text-ink hover:border-primary hover:text-primary hover:-translate-y-px",
        ghost:
          "border-none bg-transparent p-0 shadow-none text-ink hover:text-primary",
      },
      size: {
        default: "px-[22px] py-2.5 text-[0.95rem]",
        sm: "px-4 py-1.5 text-[0.85rem]",
        // UX-006: для кнопок, по которым судья часто тапает на телефоне во
        // время живого конкурса (JudgeScoreButtons, FinalJudgingScreen,
        // ConfirmJudgingButton) — "sm" даёт ~30-34px, ниже комфортного
        // минимума для частого тапа; min-h гарантирует высоту независимо от
        // содержимого (одна цифра или "Да"/"Нет").
        touch: "min-h-[44px] px-4 py-3 text-[0.85rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
