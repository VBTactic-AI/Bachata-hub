import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// cardVariants экспортируется отдельно, потому что часть карточек в проекте —
// это <Link> (например, плитки в /moderation), а не <div>.
export const cardVariants = cva(
  "block rounded-app border border-line bg-surface p-[18px] shadow-sm transition duration-200 ease-brand",
  {
    variants: {
      interactive: {
        true: "hover:-translate-y-[3px] hover:shadow-md hover:border-primary-soft active:translate-y-[-1px] active:scale-[0.995]",
        false: "",
      },
    },
    defaultVariants: { interactive: false },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ interactive }), className)} {...props} />;
}
