import {
  CalendarClock,
  HelpCircle,
  ScanLine,
  Sparkles,
  LineChart,
  ListChecks,
  Rocket,
  ArrowRight,
  ArrowDown,
} from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/utils";

const FLOW = [
  { icon: CalendarClock, label: "Planejamento" },
  { icon: HelpCircle, label: "Questões" },
  { icon: ScanLine, label: "Scanner" },
  { icon: Sparkles, label: "LuminIA", highlight: true },
  { icon: LineChart, label: "Análise" },
  { icon: ListChecks, label: "Cronograma" },
  { icon: Rocket, label: "Evolução" },
];

export function Solution() {
  return (
    <section id="solucao" className="relative overflow-hidden bg-graphite py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]"
      />
      <div className="container-lumina relative">
        <SectionHeading
          light
          kicker="A solução"
          title="Uma plataforma. Um fluxo. Nenhuma desculpa pra não saber o que estudar"
          subtitle="A Lumina junta tudo que você usava espalhado — e ainda aprende com cada questão que você resolve, ficando mais precisa a cada dia."
        />

        <Reveal delay={0.15}>
          <div className="mt-16 flex flex-col items-center gap-2 md:flex-row md:justify-between md:gap-0">
            {FLOW.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center md:flex-row">
                <div className="flex flex-col items-center gap-3">
                  <div
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-2xl border transition-transform duration-300 hover:-translate-y-1 md:h-20 md:w-20",
                      step.highlight
                        ? "border-primary bg-primary shadow-[0_0_0_6px_rgba(255,193,7,0.15)]"
                        : "border-white/10 bg-white/5"
                    )}
                  >
                    <step.icon
                      className={cn(
                        "h-7 w-7 md:h-8 md:w-8",
                        step.highlight ? "text-graphite" : "text-primary"
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-xs font-semibold md:text-sm",
                      step.highlight ? "text-primary" : "text-white/80"
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {i < FLOW.length - 1 && (
                  <>
                    <ArrowDown className="my-2 h-5 w-5 text-white/20 md:hidden" />
                    <ArrowRight className="mx-3 hidden h-5 w-5 shrink-0 text-white/20 md:block" />
                  </>
                )}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.25}>
          <p className="mx-auto mt-14 max-w-2xl text-center text-sm leading-relaxed text-white/50 md:text-base">
            Cada simulado que você faz, cada prova que escaneia, cada revisão que
            conclui — tudo vira combustível pra LuminIA te dizer, todo santo dia,
            exatamente o que estudar agora.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
