import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-graphite shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_30px_-8px_rgba(255,193,7,0.55)] hover:-translate-y-0.5",
        secondary:
          "bg-graphite text-white hover:bg-graphite-700 hover:-translate-y-0.5",
        outline:
          "border border-surface-line bg-white text-graphite hover:border-graphite/30 hover:-translate-y-0.5",
        ghost: "text-graphite hover:bg-graphite/5",
      },
      size: {
        default: "h-12 px-6",
        lg: "h-14 px-8 text-base",
        sm: "h-10 px-4 text-xs",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}
