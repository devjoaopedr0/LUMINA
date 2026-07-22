import { cn } from "@/lib/utils";

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-[9px] bg-graphite">
        <span className="h-3 w-3 rounded-full bg-primary" />
      </span>
      <span
        className={cn(
          "font-display text-lg font-bold tracking-tight",
          dark ? "text-white" : "text-graphite"
        )}
      >
        Lumina
      </span>
    </div>
  );
}
