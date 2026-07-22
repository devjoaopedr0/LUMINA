import { ClipboardList, ScanText, BrainCircuit, CalendarCheck2, TrendingUp } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

const STEPS = [
  {
    number: "01",
    icon: ClipboardList,
    title: "Faça um simulado",
    description: "Comece pelo banco de questões ou por um simulado completo, no seu ritmo.",
  },
  {
    number: "02",
    icon: ScanText,
    title: "Escaneie a prova",
    description: "Fotografou uma prova física? O scanner inteligente lê e corrige automaticamente.",
  },
  {
    number: "03",
    icon: BrainCircuit,
    title: "A LuminIA analisa",
    description: "Ela entende onde você mandou bem, onde travou e por quê — em segundos.",
  },
  {
    number: "04",
    icon: CalendarCheck2,
    title: "Receba um plano personalizado",
    description: "Um cronograma adaptado às suas metas, seus pontos fracos e o tempo que você tem.",
  },
  {
    number: "05",
    icon: TrendingUp,
    title: "Continue evoluindo",
    description: "O plano se reajusta sozinho. Quanto mais você usa a Lumina, mais ela acerta por você.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-24 md:py-32">
      <div className="container-lumina">
        <SectionHeading
          kicker="Como funciona"
          title="Da primeira questão até o dia da prova, sem perder o rumo"
          subtitle="5 passos simples. A LuminIA no seu lado em cada um deles."
        />

        <div className="relative mt-16">
          <div
            aria-hidden
            className="absolute left-[27px] top-4 hidden h-[calc(100%-2rem)] w-px bg-surface-line md:block lg:left-1/2"
          />

          <div className="flex flex-col gap-10 md:gap-14">
            {STEPS.map((step, i) => (
              <Reveal key={step.number} delay={i * 0.08}>
                <div
                  className={`flex items-start gap-6 lg:items-center ${
                    i % 2 === 1 ? "lg:flex-row-reverse lg:text-right" : ""
                  }`}
                >
                  <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-surface-line bg-white shadow-sm lg:absolute lg:left-1/2 lg:-translate-x-1/2">
                    <step.icon className="h-6 w-6 text-primary-600" />
                  </div>

                  <div className={`lg:w-[calc(50%-3rem)] ${i % 2 === 1 ? "lg:ml-auto" : ""}`}>
                    <span className="text-xs font-bold tracking-widest text-primary-600">
                      PASSO {step.number}
                    </span>
                    <h3 className="mt-1.5 text-xl font-semibold text-graphite md:text-2xl">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite-500 md:text-base lg:max-w-none">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
