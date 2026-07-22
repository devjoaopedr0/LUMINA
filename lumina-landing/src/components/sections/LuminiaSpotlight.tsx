import { Sparkles, Check } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Badge } from "@/components/ui/Badge";

const KNOWLEDGE = [
  "Histórico de estudos",
  "Cronograma atual",
  "Metas definidas",
  "Desempenho por matéria",
  "Simulados realizados",
  "Revisões pendentes",
  "Flashcards",
  "Provas digitalizadas",
];

const CHAT = [
  { from: "luminia", text: "Vi que você errou 3 questões seguidas de Geometria. Quer revisar agora ou depois do simulado?" },
  { from: "user", text: "Depois do simulado. Mas ajusta meu cronograma?" },
  { from: "luminia", text: "Feito. Movi Geometria para amanhã de manhã, seu horário de melhor desempenho." },
];

export function LuminiaSpotlight() {
  return (
    <section id="luminia" className="py-24 md:py-32">
      <div className="container-lumina grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
        <Reveal>
          <Badge className="border-primary/30 bg-primary/10 text-primary-700">
            <Sparkles className="h-3.5 w-3.5" />
            A mentora inteligente
          </Badge>
          <h2 className="mt-5 text-3xl md:text-4xl lg:text-[2.75rem] font-semibold leading-[1.15] tracking-tight text-graphite">
            A LuminIA é o cérebro por trás da sua evolução
          </h2>
          <p className="mt-5 text-base leading-relaxed text-graphite-500 md:text-lg">
            Ela não é um chatbot genérico. A LuminIA atua como uma mentora
            personalizada durante toda a sua preparação — e aprende continuamente
            com cada interação. Quanto mais você usa a Lumina, mais inteligente
            ela se torna para você.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3">
            {KNOWLEDGE.map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10">
                  <Check className="h-3 w-3 text-success" />
                </span>
                <span className="text-sm text-graphite-700">{item}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-8 -z-10 rounded-full bg-primary/15 blur-[80px]"
            />
            <div className="rounded-[24px] border border-surface-line bg-white p-5 shadow-[0_40px_100px_-30px_rgba(31,41,55,0.35)] md:p-6">
              <div className="flex items-center gap-3 border-b border-surface-line pb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-graphite">
                  <Sparkles className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-graphite">LuminIA</p>
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> online agora
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                {CHAT.map((msg, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.from === "luminia"
                        ? "self-start rounded-tl-sm bg-surface-card text-graphite-700"
                        : "self-end rounded-tr-sm bg-primary text-graphite"
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
