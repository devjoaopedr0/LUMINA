import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal } from "@/components/ui/Reveal";
import { buttonVariants } from "@/components/ui/Button";

export function FinalCta() {
  return (
    <section className="px-4 py-4 md:px-6">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-graphite px-8 py-16 text-center md:px-16 md:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/25 blur-[120px]"
          />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Sua próxima aprovação começa aqui
            </span>

            <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold leading-[1.15] tracking-tight text-white md:text-5xl">
              Pare de estudar sem direção. Comece a evoluir com a Lumina.
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/60 md:text-lg">
              Crie sua conta gratuita agora e deixe a LuminIA montar seu primeiro
              plano de estudos personalizado.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/signup" className={buttonVariants({ size: "lg" })}>
                Criar minha conta grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#faq"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className: "border-white/15 bg-transparent text-white hover:border-white/30",
                })}
              >
                Falar com a equipe
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
