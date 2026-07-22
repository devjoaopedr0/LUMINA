import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  light?: boolean;
}

export function SectionHeading({
  kicker,
  title,
  subtitle,
  align = "center",
  light = false,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left"
      )}
    >
      {kicker && (
        <span
          className={cn(
            "mb-4 inline-block text-xs font-bold uppercase tracking-[0.18em]",
            light ? "text-primary" : "text-primary-600"
          )}
        >
          {kicker}
        </span>
      )}
      <h2
        className={cn(
          "text-3xl md:text-4xl lg:text-[2.75rem] font-semibold leading-[1.15] tracking-tight",
          light ? "text-white" : "text-graphite"
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            "mt-4 text-base md:text-lg leading-relaxed",
            light ? "text-white/70" : "text-graphite-500"
          )}
        >
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}
