import { Reveal } from "@/components/ui/Reveal";
import { Accordion } from "@/components/ui/Accordion";
import { SectionHeading } from "@/components/ui/SectionHeading";

const FAQ_ITEMS = [
  {
    question: "A Lumina é gratuita?",
    answer:
      "Sim. O plano Free dá acesso ao dashboard, cronograma básico e uso limitado da LuminIA — sem precisar de cartão de crédito. O plano Premium libera simulados ilimitados, correção de redação e a LuminIA sem restrições.",
  },
  {
    question: "Como funciona o scanner inteligente?",
    answer:
      "Você fotografa a prova ou o gabarito preenchido e a Lumina identifica as respostas automaticamente, corrige e já integra o resultado ao seu histórico de desempenho — sem digitação manual.",
  },
  {
    question: "A LuminIA substitui um professor?",
    answer:
      "Não, e ela não tenta. A LuminIA organiza e direciona seus estudos com base no seu próprio desempenho — quem ensina o conteúdo continua sendo seu professor ou cursinho.",
  },
  {
    question: "Professores e escolas podem usar a Lumina?",
    answer:
      "Sim. Há um plano específico para professores, com gestão de turmas e correção em escala, e licenciamento institucional para cursinhos e escolas que querem oferecer a plataforma a todos os alunos.",
  },
  {
    question: "Meus dados de estudo estão seguros?",
    answer:
      "Sim. Usamos seus dados de desempenho só pra deixar sua experiência mais personalizada — nunca compartilhamos nada com terceiros sem sua autorização.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Pode. Cancela direto no seu painel, quando quiser, sem burocracia, sem ligação e sem multa.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="container-lumina">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
          <SectionHeading
            align="left"
            kicker="FAQ"
            title="Perguntas frequentes"
            subtitle="Não encontrou o que procurava? Fale com a gente pelo nosso suporte."
          />

          <Reveal delay={0.15}>
            <Accordion items={FAQ_ITEMS} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
