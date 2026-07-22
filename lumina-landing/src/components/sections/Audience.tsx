import { GraduationCap, Presentation, Building2, ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

const AUDIENCES = [
  {
    icon: GraduationCap,
    title: "Aluno",
    description: "Vestibulandos e estudantes independentes que querem parar de estudar no escuro.",
    benefits: [
      "Plano de estudos personalizado pela LuminIA",
      "Banco de questões e simulados ilimitados no plano completo",
      "Visão clara da própria evolução",
    ],
  },
  {
    icon: Presentation,
    title: "Professor",
    description: "Professores particulares e de cursinho que aplicam simulados e acompanham turmas.",
    benefits: [
      "Aplicação e correção de simulados em escala",
      "Scanner de gabaritos com resultado automático",
      "Dashboard de desempenho por turma e por aluno",
    ],
  },
  {
    icon: Building2,
    title: "Instituição",
    description: "Cursinhos e escolas que querem licenciar a plataforma para toda a base de alunos.",
    benefits: [
      "Painel administrativo com indicadores estratégicos",
      "Licenciamento simples para toda a instituição",
      "Dados de coorte por turma e por período",
    ],
  },
];

export function Audience() {
  return (
    <section id="publico" className="bg-surface-card py-24 md:py-32">
      <div className="container-lumina">
        <SectionHeading
          kicker="Feito para cada perfil"
          title="Não importa seu papel na aprovação. A Lumina se adapta a você"
          subtitle="Um único ecossistema, pensado pra quem estuda, pra quem ensina e pra quem gerencia a preparação de centenas de alunos."
        />

        <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {AUDIENCES.map((audience, i) => (
            <Reveal key={audience.title} delay={i * 0.1}>
              <Card className="h-full border-surface-line bg-white">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite text-primary">
                  <audience.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-xl font-semibold text-graphite">{audience.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite-500">
                  {audience.description}
                </p>
                <ul className="mt-5 flex flex-col gap-2.5 border-t border-surface-line pt-5">
                  {audience.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-sm text-graphite-700">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
