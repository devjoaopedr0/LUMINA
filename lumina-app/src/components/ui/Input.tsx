import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-xl border border-surface-line bg-white px-4 text-sm text-graphite outline-none transition-colors placeholder:text-graphite-400 focus:border-primary-600 focus:ring-2 focus:ring-primary/30",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
