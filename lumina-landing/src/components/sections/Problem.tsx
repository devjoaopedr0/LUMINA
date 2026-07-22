import { AlertTriangle, Wallet, LayoutGrid, TrendingDown } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

const PAIN_POINTS = [
  {
    icon: LayoutGrid,
    title: "Um app pra cada coisa",
    description:
      "Questões num app, simulado em outro, cronograma na planilha, flashcards em mais um. Você vira gerente de projetos só pra conseguir estudar.",
  },
  {
    icon: Wallet,
    title: "Pagando (caro) por isso",
    description:
      "Cada ferramenta cobra a sua mensalidade. Somadas, elas custam bem mais do que você imagina — por um resultado que continua incerto.",
  },
  {
    icon: TrendingDown,
    title: "E mesmo assim, no escuro",
    description:
      "Você estuda horas, mas não sabe se está evoluindo de verdade. Sem visão clara do progresso, toda hora de estudo vira uma aposta.",
  },
];

export function Problem() {
  return (
    <section id="problema" className="py-24 md:py-32">
      <div className="container-lumina">
        <SectionHeading
          kicker="O problema"
          title="Você não precisa estudar mais. Precisa estudar com direção"
          subtitle="Hoje, preparar-se pro vestibular virou um trabalho de organização — não de aprendizagem. E isso está custando seu tempo, seu dinheiro e sua confiança."
        />

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          {PAIN_POINTS.map((point, i) => (
            <Reveal key={point.title} delay={i * 0.1}>
              <Card className="h-full border-surface-line bg-white hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(31,41,55,0.15)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-alert/10 text-alert">
                  <point.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-graphite">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite-500">
                  {point.description}
                </p>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3}>
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-alert/20 bg-alert/5 p-5 md:items-center">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-alert md:mt-0" />
            <p className="text-sm leading-relaxed text-graphite-700 md:text-base">
              <strong className="font-semibold">No fim das contas:</strong> menos tempo
              estudando, mais dinheiro gasto, e a sensação de estar sempre um passo
              atrás — mesmo se esforçando todos os dias.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
