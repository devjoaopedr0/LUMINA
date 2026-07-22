import { Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import { InstagramIcon, YoutubeIcon, LinkedinIcon } from "@/components/SocialIcons";

const COLUMNS = [
  {
    title: "Produto",
    links: ["Solução", "Como funciona", "Funcionalidades", "LuminIA", "Planos"],
  },
  {
    title: "Institucional",
    links: ["Sobre a Lumina", "Carreiras", "Imprensa", "Parcerias"],
  },
  {
    title: "Suporte",
    links: ["Central de ajuda", "FAQ", "Contato", "Status da plataforma"],
  },
  {
    title: "Legal",
    links: ["Termos de uso", "Privacidade", "Cookies"],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-surface-line bg-white pt-16">
      <div className="container-lumina">
        <div className="grid grid-cols-2 gap-10 pb-12 md:grid-cols-6">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-graphite-500">
              A plataforma inteligente que acompanha toda a jornada de aprendizagem.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {[InstagramIcon, YoutubeIcon, LinkedinIcon, Mail].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="Rede social da Lumina"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-line text-graphite-500 transition-colors hover:border-graphite/30 hover:text-graphite"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-graphite">{col.title}</h4>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-graphite-500 transition-colors hover:text-graphite"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-surface-line py-6 text-xs text-graphite-400 md:flex-row">
          <p>© {new Date().getFullYear()} Lumina. Todos os direitos reservados.</p>
          <p>Feito para quem quer estudar com direção.</p>
        </div>
      </div>
    </footer>
  );
}
