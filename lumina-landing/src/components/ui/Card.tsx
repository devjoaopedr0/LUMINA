import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-line bg-surface-card p-6 transition-all duration-300",
        className
      )}
      {...props}
    />
  );
}
