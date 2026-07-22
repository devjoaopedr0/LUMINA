import type { ReactNode } from "react";
import { Sparkles, ShieldCheck, Zap } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LANDING_URL } from "@/lib/config";

const HIGHLIGHTS = [
  { icon: Sparkles, text: "Plano de estudos personalizado pela LuminIA" },
  { icon: Zap, text: "Simulados, questões e scanner em um só lugar" },
  { icon: ShieldCheck, text: "Seus dados usados só para te ajudar a evoluir" },
];

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen bg-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#e5e7eb_1px,transparent_0)] [background-size:32px_32px] opacity-40"
      />

      {/* Left brand panel */}
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-graphite p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/20 blur-[120px]"
        />
        <a href={LANDING_URL} className="relative">
          <Logo dark />
        </a>

        <div className="relative">
          <h2 className="max-w-sm text-3xl font-semibold leading-[1.2] tracking-tight">
            Toda a sua aprovação, em um só lugar.
          </h2>
          <div className="mt-10 flex flex-col gap-5">
            {HIGHLIGHTS.map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <item.icon className="h-4 w-4 text-primary" />
                </span>
                <span className="text-sm text-white/70">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/40">
          © {new Date().getFullYear()} Lumina. Todos os direitos reservados.
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex w-full flex-1 flex-col items-center justify-center px-6 py-16 lg:w-[58%]">
        <div className="w-full max-w-sm">
          <a href={LANDING_URL} className="mb-10 flex justify-center lg:hidden">
            <Logo />
          </a>

          <h1 className="text-2xl font-semibold tracking-tight text-graphite">{title}</h1>
          <p className="mt-2 text-sm text-graphite-500">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
