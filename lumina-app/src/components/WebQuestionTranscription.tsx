import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { safeSourceLink } from "@/lib/source-link";
import type { QuestionDifficulty, WebSearchHit } from "@/lib/api";

/** Conteúdo transcrito pelo usuário a partir do resultado da busca. É o que
 * realmente vai para o banco — a Lumina não baixa nem guarda o texto da
 * página de origem, então o preenchimento é responsabilidade de quem está
 * usando a plataforma. */
export interface TranscribedQuestion {
  subject: string;
  topic: string;
  exam: string;
  year: string;
  difficulty: QuestionDifficulty;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const DIFFICULTIES: Array<{ value: QuestionDifficulty; label: string }> = [
  { value: "FACIL", label: "Fácil" },
  { value: "MEDIA", label: "Média" },
  { value: "DIFICIL", label: "Difícil" },
];

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const MIN_STEM = 5;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

/** Letra da alternativa a partir da POSIÇÃO (1-based): 1 = A, 2 = B...
 * Mesma convenção do banco de questões e da posição gravada no banco, para
 * a letra que o usuário vê aqui ser a mesma que aparece depois de salvar. */
function positionLetter(position: number): string {
  return LETTERS[position - 1] ?? String(position);
}

function fieldClass() {
  return "h-12 w-full rounded-xl border border-surface-line bg-white px-4 text-sm text-graphite outline-none transition-colors placeholder:text-graphite-400 focus:border-primary-600 focus:ring-2 focus:ring-primary/30";
}

function areaClass() {
  return "min-h-[110px] w-full rounded-xl border border-surface-line bg-white px-4 py-3 text-sm text-graphite outline-none transition-colors placeholder:text-graphite-400 focus:border-primary-600 focus:ring-2 focus:ring-primary/30";
}

function initialState(hit: WebSearchHit): TranscribedQuestion {
  const classification = hit.classification;
  // O trecho da busca é só um pedaço do enunciado: entra como ponto de
  // partida para o usuário completar, nunca como conteúdo final.
  const snippet = (hit.snippet ?? "").trim();
  return {
    subject: classification?.subject ?? "",
    topic: classification?.topic ?? "",
    exam: classification?.exam ?? "",
    year: classification?.year ? String(classification.year) : "",
    difficulty: classification?.difficulty ?? "MEDIA",
    stem: snippet.length >= MIN_STEM ? snippet : "",
    options: ["", ""],
    correctIndex: 0,
    explanation: "",
  };
}

export function WebQuestionTranscriptionForm({
  hit,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  hit: WebSearchHit;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: TranscribedQuestion) => void;
}) {
  const [form, setForm] = useState<TranscribedQuestion>(() => initialState(hit));
  const [localError, setLocalError] = useState<string | null>(null);

  const update = <K extends keyof TranscribedQuestion>(
    key: K,
    value: TranscribedQuestion[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateOption = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, i) => (i === index ? value : option)),
    }));
  };

  const addOption = () => {
    setForm((current) =>
      current.options.length >= MAX_OPTIONS
        ? current
        : { ...current, options: [...current.options, ""] },
    );
  };

  const removeOption = (index: number) => {
    setForm((current) => {
      const options = current.options.filter((_, i) => i !== index);
      const correctIndex =
        current.correctIndex === index
          ? 0
          : current.correctIndex > index
            ? current.correctIndex - 1
            : current.correctIndex;
      return { ...current, options, correctIndex };
    });
  };

  function validate(value: TranscribedQuestion): string | null {
    if (value.subject.trim().length < 2) {
      return "Informe a disciplina (mínimo 2 letras).";
    }
    if (value.stem.trim().length < MIN_STEM) {
      return `O enunciado precisa de pelo menos ${MIN_STEM} caracteres.`;
    }
    const filled = value.options.map((option) => option.trim()).filter(Boolean);
    if (filled.length < MIN_OPTIONS) {
      return `Transcreva pelo menos ${MIN_OPTIONS} alternativas.`;
    }
    if (!value.options[value.correctIndex]?.trim()) {
      return "Marque qual alternativa está correta.";
    }
    return null;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = validate(form);
    setLocalError(message);
    if (message) return;

    // Alternativas vazias no meio da lista são descartadas e o gabarito
    // é reposicionado para a alternativa correta survive à limpeza.
    const kept = form.options
      .map((option, index) => ({ option: option.trim(), index }))
      .filter(({ option }) => option.length > 0);

    onSubmit({
      ...form,
      options: kept.map(({ option }) => option),
      correctIndex: kept.findIndex(({ index }) => index === form.correctIndex),
    });
  }

  const message = localError ?? error;
  const sourceLink = safeSourceLink(hit.link);

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-primary/30 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-graphite">
            Transcrever para o banco interno
          </h4>
          <p className="mt-1 text-xs text-graphite-400">
            Confira o enunciado e as alternativas no site de origem e complete
            abaixo. A Lumina guarda apenas o que você transcrever, com{" "}
            <span className="font-medium text-graphite">fonte: {hit.sourceName ?? "—"}</span>{" "}
            e o link original preservados.
          </p>
        </div>
        {sourceLink && (
          <a
            href={sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-graphite"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir original
          </a>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="tr-subject" className="mb-1.5 block text-xs font-semibold text-graphite">
            Disciplina
          </label>
          <Input
            id="tr-subject"
            value={form.subject}
            onChange={(e) => update("subject", e.target.value)}
            placeholder="ex: Matemática"
            maxLength={120}
            required
          />
        </div>
        <div>
          <label htmlFor="tr-topic" className="mb-1.5 block text-xs font-semibold text-graphite">
            Assunto
          </label>
          <Input
            id="tr-topic"
            value={form.topic}
            onChange={(e) => update("topic", e.target.value)}
            placeholder="ex: Funções exponenciais"
            maxLength={120}
          />
        </div>
        <div>
          <label htmlFor="tr-exam" className="mb-1.5 block text-xs font-semibold text-graphite">
            Prova
          </label>
          <Input
            id="tr-exam"
            value={form.exam}
            onChange={(e) => update("exam", e.target.value)}
            placeholder="ex: ENEM"
            maxLength={60}
          />
        </div>
        <div>
          <label htmlFor="tr-year" className="mb-1.5 block text-xs font-semibold text-graphite">
            Ano
          </label>
          <Input
            id="tr-year"
            type="number"
            min={1970}
            max={2100}
            value={form.year}
            onChange={(e) => update("year", e.target.value)}
            placeholder="ex: 2023"
          />
        </div>
        <div>
          <label htmlFor="tr-difficulty" className="mb-1.5 block text-xs font-semibold text-graphite">
            Dificuldade
          </label>
          <select
            id="tr-difficulty"
            value={form.difficulty}
            onChange={(e) => update("difficulty", e.target.value as QuestionDifficulty)}
            className={fieldClass()}
          >
            {DIFFICULTIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="tr-stem" className="mb-1.5 block text-xs font-semibold text-graphite">
          Enunciado
        </label>
        <textarea
          id="tr-stem"
          value={form.stem}
          onChange={(e) => update("stem", e.target.value)}
          placeholder={
            hit.snippet
              ? "Pré-preenchido com o trecho da busca — corrija antes de salvar."
              : "Digite o enunciado exatamente como está na fonte."
          }
          maxLength={4000}
          rows={4}
          className={areaClass()}
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-graphite">Alternativas</span>
          {form.options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 transition-colors hover:text-graphite"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          {form.options.map((option, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded-xl border border-surface-line bg-white p-2.5"
            >
              <button
                type="button"
                onClick={() => update("correctIndex", index)}
                title="Marcar como correta"
                aria-label={`Marcar alternativa ${positionLetter(index + 1)} como correta`}
                aria-pressed={form.correctIndex === index}
                className={`mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  form.correctIndex === index
                    ? "border-success bg-success text-white"
                    : "border-surface-line text-transparent hover:border-graphite/40"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <span className="mt-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite/5 text-xs font-semibold text-graphite-500">
                {positionLetter(index + 1)}
              </span>
              <Input
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Texto da alternativa ${positionLetter(index + 1)}`}
                maxLength={1000}
                className="flex-1"
              />
              {form.options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="mt-3 text-graphite-400 transition-colors hover:text-alert"
                  title="Remover alternativa"
                  aria-label={`Remover alternativa ${positionLetter(index + 1)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="tr-explanation" className="mb-1.5 block text-xs font-semibold text-graphite">
          Gabarito comentado <span className="font-normal text-graphite-400">(opcional)</span>
        </label>
        <textarea
          id="tr-explanation"
          value={form.explanation}
          onChange={(e) => update("explanation", e.target.value)}
          placeholder="Explique a resposta correta para quem estuda..."
          maxLength={4000}
          rows={3}
          className="min-h-[84px] w-full rounded-xl border border-surface-line bg-white px-4 py-3 text-sm text-graphite outline-none transition-colors placeholder:text-graphite-400 focus:border-primary-600 focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {message && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar no banco"}
        </Button>
      </div>
    </form>
  );
}
