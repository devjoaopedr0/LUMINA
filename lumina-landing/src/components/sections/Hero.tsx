import { ArrowRight, Sparkles, Star, TrendingUp, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-40 pb-24 md:pt-48 md:pb-32">
      {/* background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-180px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/25 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#e5e7eb_1px,transparent_0)] [background-size:32px_32px] opacity-40"
      />

      <div className="container-lumina relative">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center"
        >
          <Badge className="bg-white/80">
            <Sparkles className="h-3.5 w-3.5 text-primary-600" />
            Conheça a LuminIA, sua mentora de IA
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-7 max-w-4xl text-center text-[2.6rem] leading-[1.08] font-bold tracking-tight text-graphite md:text-6xl lg:text-[4.2rem]"
        >
          Toda a sua aprovação,{" "}
          <span className="relative inline-block">
            <span className="relative z-10">em um só lugar.</span>
            <span className="absolute inset-x-0 bottom-1 h-4 -rotate-1 bg-primary/50 md:bottom-2 md:h-5" />
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-graphite-500 md:text-xl"
        >
          A plataforma inteligente que acompanha toda a jornada de aprendizagem.
          Planejamento, questões, simulados e uma mentora de IA que aprende com
          você — para você parar de estudar sem direção.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link to="/signup" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
            Criar minha conta grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#como-funciona"
            className={buttonVariants({ size: "lg", variant: "outline", className: "w-full sm:w-auto" })}
          >
            Ver como funciona
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-graphite-500"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" /> Grátis para começar
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" /> Sem cartão de crédito
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" /> Cancele quando quiser
          </span>
        </motion.div>

        {/* Product mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto mt-20 max-w-5xl"
        >
          <DashboardMockup />

          <motion.div
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -left-6 top-16 hidden w-56 rounded-2xl border border-surface-line bg-white p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] md:block"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-graphite">
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              <div>
                <p className="text-xs font-semibold text-graphite">LuminIA</p>
                <p className="text-[11px] text-graphite-500">agora</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-graphite-500">
              "Você está 23% mais forte em Matemática. Hoje, foco em Redação?"
            </p>
          </motion.div>

          <motion.div
            animate={{ y: [0, 14, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute -right-4 bottom-10 hidden w-48 rounded-2xl border border-surface-line bg-white p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] md:block"
          >
            <div className="flex items-center gap-2 text-success">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-bold">+18% este mês</span>
            </div>
            <p className="mt-1 text-[11px] text-graphite-500">Desempenho em simulados</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function DashboardMockup() {
  return (
    <div className="rounded-[24px] border border-surface-line bg-white p-3 shadow-[0_40px_100px_-30px_rgba(31,41,55,0.35)] md:p-4">
      <div className="flex items-center gap-1.5 px-2 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffc107]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]/70" />
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-[16px] bg-surface-card p-4 md:grid-cols-3 md:p-6">
        <div className="rounded-2xl bg-graphite p-5 text-white md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/60">Progresso semanal</p>
              <p className="mt-1 text-2xl font-bold">87% da meta</p>
            </div>
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-graphite">
              Em ritmo ótimo
            </span>
          </div>
          <div className="mt-6 flex items-end gap-2">
            {[40, 65, 50, 80, 60, 95, 75].map((h, i) => (
              <div key={i} className="flex-1 rounded-md bg-white/10">
                <div
                  className="rounded-md bg-primary"
                  style={{ height: `${h}px` }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-surface-line bg-white p-4">
            <p className="text-xs font-semibold text-graphite-500">Simulado de hoje</p>
            <p className="mt-1 text-lg font-bold text-graphite">720 pts</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-surface-line">
              <div className="h-1.5 w-[72%] rounded-full bg-success" />
            </div>
          </div>
          <div className="flex-1 rounded-2xl border border-surface-line bg-white p-4">
            <p className="text-xs font-semibold text-graphite-500">Próxima revisão</p>
            <p className="mt-1 text-sm font-bold text-graphite">Funções · Química</p>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary-600">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              Recomendado pela LuminIA
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
