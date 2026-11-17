import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { CURRENT_TERMS_VERSION, LEGAL_DOCUMENTS, type LegalDocument } from "@/content/legal";

/** Corpo de um documento legal; reaproveitado na página pública e na tela de aceite. */
export function LegalDocumentBody({ doc }: { doc: LegalDocument }) {
  return (
    <div className="space-y-6">
      {doc.sections.map((section) => (
        <section key={section.title}>
          <h2 className="text-base font-semibold text-graphite">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="mt-2 text-sm leading-relaxed text-graphite-500">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

function formatVersion(version: string) {
  const [year, month, day] = version.split("-");
  return `${day}/${month}/${year}`;
}

export function LegalPage({ slug }: { slug: keyof typeof LEGAL_DOCUMENTS }) {
  const doc = LEGAL_DOCUMENTS[slug];
  const other = slug === "termos" ? LEGAL_DOCUMENTS.privacidade : LEGAL_DOCUMENTS.termos;

  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-surface-line bg-white p-6 sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Logo />
          <Link to="/" className="flex items-center gap-1.5 text-sm font-medium text-graphite-500 hover:text-graphite">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">{doc.title}</h1>
        <p className="mt-1 text-xs text-graphite-400">Versão de {formatVersion(CURRENT_TERMS_VERSION)}</p>
        <div className="mt-8">
          <LegalDocumentBody doc={doc} />
        </div>
        <p className="mt-10 border-t border-surface-line pt-6 text-sm text-graphite-500">
          Veja também: <Link to={`/${other.slug}`} className="font-semibold text-graphite hover:text-primary-600">{other.title}</Link>
        </p>
      </article>
    </div>
  );
}
