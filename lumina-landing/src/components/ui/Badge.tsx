import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-surface-line bg-white px-3.5 py-1.5 text-xs font-semibold tracking-wide text-graphite-500",
        className
      )}
      {...props}
    />
  );
}
