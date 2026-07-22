import {
  LayoutDashboard,
  Database,
  ScanLine,
  Layers,
  FileCheck2,
  CalendarRange,
  BarChart3,
  Trophy,
  Sparkles,
  Presentation,
  Building2,
} from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "Visão unificada de todo o seu progresso, em um único painel.",
  },
  {
    icon: Database,
    title: "Banco de questões",
    description: "Milhares de questões organizadas por habilidade e incidência em prova.",
  },
  {
    icon: ScanLine,
    title: "Scanner inteligente",
    description: "Digitalize provas físicas e receba a correção automaticamente.",
  },
  {
    icon: Layers,
    title: "Flashcards",
    description: "Revisão espaçada gerada automaticamente a partir dos seus erros.",
  },
  {
    icon: FileCheck2,
    title: "Simulados",
    description: "Simulados completos com correção instantânea e análise de desempenho.",
  },
  {
    icon: CalendarRange,
    title: "Cronograma",
    description: "Plano de estudos adaptativo, ajustado à sua rotina e às suas metas.",
  },
  {
    icon: BarChart3,
    title: "Estatísticas",
    description: "Estatísticas profundas por matéria, tema e evolução ao longo do tempo.",
  },
  {
    icon: Trophy,
    title: "Gamificação",
    description: "Metas, sequências e conquistas que tornam o hábito de estudar mais leve.",
  },
  {
    icon: Sparkles,
    title: "LuminIA",
    description: "Sua mentora de IA, presente em cada decisão da sua preparação.",
    accent: true,
  },
  {
    icon: Presentation,
    title: "Para professores",
    description: "Gestão de turmas, aplicação de simulados e correção em escala.",
  },
  {
    icon: Building2,
    title: "Para instituições",
    description: "Painel administrativo com indicadores estratégicos de toda a base.",
  },
];

export function Features() {
  return (
    <section id="funcionalidades" className="py-24 md:py-32">
      <div className="container-lumina">
        <SectionHeading
          kicker="Funcionalidades"
          title="Tudo que você precisava em 6 apps — agora dentro de 1"
          subtitle="E o melhor: cada módulo conversa com os outros, e todos conversam com a LuminIA."
        />

        <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 0.08}>
              <Card
                className={`group h-full cursor-default hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(31,41,55,0.15)] ${
                  feature.accent
                    ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent"
                    : "bg-white"
                }`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    feature.accent
                      ? "bg-primary text-graphite"
                      : "bg-graphite/5 text-graphite group-hover:bg-primary group-hover:text-graphite"
                  }`}
                >
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-graphite">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite-500">
                  {feature.description}
                </p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
