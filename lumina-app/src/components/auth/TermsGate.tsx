import { useState } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { PRIVACY_POLICY, TERMS_OF_USE } from "@/content/legal";
import { LegalDocumentBody } from "@/pages/LegalPage";

/**
 * Bloqueia o app até o usuário aceitar a versão vigente dos Termos — cobre o
 * cadastro pelo Google, contas criadas antes do aceite e termos atualizados.
 */
export function TermsGate() {
  const { user, acceptTerms, logout } = useAuth();
  const [tab, setTab] = useState<"termos" | "privacidade">("termos");
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUpdate = Boolean(user?.termsVersion);
  const doc = tab === "termos" ? TERMS_OF_USE : PRIVACY_POLICY;

  async function handleAccept() {
    setError(null);
    setSubmitting(true);
    try {
      await acceptTerms();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível registrar o aceite. Tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      <div className="flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col rounded-2xl border border-surface-line bg-white">
        <header className="border-b border-surface-line p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-graphite">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-graphite">
                {isUpdate ? "Atualizamos nossos Termos" : "Antes de continuar"}
              </h1>
              <p className="text-sm text-graphite-500">
                Leia os Termos de Uso e a Política de Privacidade da Lumina.
              </p>
            </div>
          </div>
          <div role="tablist" className="mt-5 flex gap-2">
            {[TERMS_OF_USE, PRIVACY_POLICY].map((item) => (
              <button
                key={item.slug}
                type="button"
                role="tab"
                aria-selected={tab === item.slug}
                onClick={() => setTab(item.slug)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === item.slug ? "bg-graphite text-white" : "bg-graphite/5 text-graphite-500 hover:text-graphite"
                }`}
              >
                {item.title}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6" role="tabpanel" aria-label={doc.title}>
          <LegalDocumentBody doc={doc} />
        </div>

        <footer className="space-y-4 border-t border-surface-line p-6">
          <label className="flex items-start gap-3 text-sm text-graphite">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-graphite"
            />
            <span>
              Li e aceito os Termos de Uso e a Política de Privacidade. Se tenho menos de 18 anos, tenho a
              autorização de um dos meus pais ou do meu responsável legal.
            </span>
          </label>
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={logout}>
              Sair
            </Button>
            <Button type="button" onClick={handleAccept} disabled={!checked || submitting}>
              {submitting ? "Registrando..." : "Aceitar e continuar"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
