import { Reveal } from "@/components/ui/Reveal";
import { Accordion } from "@/components/ui/Accordion";
import { SectionHeading } from "@/components/ui/SectionHeading";

const FAQ_ITEMS = [
  {
    question: "A Lumina é gratuita?",
    answer:
      "Sim. O plano Gratuito inclui cronograma, banco de questões, caderno de erros e revisão, com limites: 2 correções de redação e 2 simulados por mês e 10 mensagens por dia para a LuminIA, sem cartão de crédito. O Premium amplia esses limites (30 correções por mês, simulados ilimitados, 200 mensagens por dia e flashcards gerados por IA), no plano anual em até 12x no cartão ou no mensal. Os primeiros 100 alunos independentes ganham 4 meses de Premium sem cobrança.",
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
      "Sim. Professores usam a gestão de turmas, o cartão-resposta e a correção sem custo, e cursinhos e escolas podem contratar uma licença institucional que estende o Premium a todos os alunos. Fale com a gente para montar a licença.",
  },
  {
    question: "Meus dados de estudo estão seguros?",
    answer:
      "Sim. Usamos seus dados de desempenho só pra deixar sua experiência mais personalizada — nunca compartilhamos nada com terceiros sem sua autorização.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Pode. O mensal você cancela em \"Meu plano\" quando quiser, sem multa, e o que já foi pago vale até o fim do período. O anual não renova sozinho e tem reembolso integral se você cancelar nos 7 primeiros dias.",
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
