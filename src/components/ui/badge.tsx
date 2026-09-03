import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-[11px] py-[3px] text-[0.78rem] font-bold",
  {
    variants: {
      variant: {
        verified: "bg-success-light text-success",
        community: "bg-primary-light text-primary-dark",
        pending: "bg-accent-light text-accent",
      },
    },
    defaultVariants: { variant: "community" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
