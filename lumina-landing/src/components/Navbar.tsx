import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/Logo";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { APP_URL } from "@/lib/config";

const LINKS = [
  { label: "Solução", href: "#solucao" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Funcionalidades", href: "#funcionalidades" },
  { label: "LuminIA", href: "#luminia" },
  { label: "Público", href: "#publico" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass border-b border-surface-line shadow-[0_1px_0_rgba(0,0,0,0.02)]" : "bg-transparent"
      )}
    >
      <nav className="container-lumina flex h-[72px] items-center justify-between">
        <a href="#top" aria-label="Lumina — página inicial">
          <Logo />
        </a>

        <div className="hidden lg:flex items-center gap-8">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-graphite-500 transition-colors hover:text-graphite"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <a href={`${APP_URL}/login`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Entrar
          </a>
          <a href={`${APP_URL}/signup`} className={buttonVariants({ variant: "primary", size: "sm" })}>
            Criar conta grátis
          </a>
        </div>

        <button
          className="lg:hidden text-graphite"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="lg:hidden overflow-hidden border-t border-surface-line bg-white"
          >
            <div className="container-lumina flex flex-col gap-1 py-4">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-graphite-500 hover:bg-surface-card hover:text-graphite"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2 px-3">
                <a
                  href={`${APP_URL}/login`}
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ variant: "outline", className: "w-full" })}
                >
                  Entrar
                </a>
                <a
                  href={`${APP_URL}/signup`}
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ variant: "primary", className: "w-full" })}
                >
                  Criar conta grátis
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
