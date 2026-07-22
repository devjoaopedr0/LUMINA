import { Star } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

const TESTIMONIALS = [
  {
    name: "Marina A.",
    role: "Estudante · exemplo ilustrativo",
    quote:
      "Parei de pular entre 4 aplicativos diferentes. Hoje sei exatamente o que estudar assim que abro a Lumina de manhã.",
  },
  {
    name: "Rafael T.",
    role: "Professor de cursinho · exemplo ilustrativo",
    quote:
      "O scanner de gabaritos mudou minha rotina com as turmas. O que levava uma tarde inteira, agora é feito em minutos.",
  },
  {
    name: "Camila S.",
    role: "Coordenadora pedagógica · exemplo ilustrativo",
    quote:
      "Ter os dados de desempenho de todas as turmas em um painel só facilitou muito nossas decisões pedagógicas.",
  },
];

export function Testimonials() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-lumina">
        <SectionHeading
          kicker="Depoimentos"
          title="É assim que a Lumina muda a rotina de estudos"
          subtitle="Exemplos ilustrativos de como a experiência funciona na prática — não representam clientes reais da plataforma."
        />

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.1}>
              <Card className="h-full border-surface-line bg-white">
                <div className="flex gap-1 text-primary">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-primary" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-graphite-700">
                  “{t.quote}”
                </p>
                <div className="mt-6 flex items-center gap-3 border-t border-surface-line pt-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-graphite text-xs font-bold text-primary">
                    {t.name.charAt(0)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-graphite">{t.name}</p>
                    <p className="text-xs text-graphite-500">{t.role}</p>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
