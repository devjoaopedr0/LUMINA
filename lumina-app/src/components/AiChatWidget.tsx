import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Brain, ChevronDown, MessageCircle, Send, Sparkles } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ASK_AI_EVENT, AiChatNotConfiguredError, sendAiChatMessage, type AiChatMessage, type AiChatMode, type AskAiDetail } from "@/lib/ai-chat";

const INITIAL_MESSAGE: AiChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Olá! Eu sou a LuminIA. Pergunte sobre suas dúvidas de matéria, sobre redação, sobre o cronograma ou sobre qualquer questão que você errou.",
};

type ChatContextOptions = {
  scheduleTaskId?: string;
  questionId?: string;
  mode?: AiChatMode;
};

export function AiChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [socraticMode, setSocraticMode] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([INITIAL_MESSAGE]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  // A última versão de `send` fica numa ref: o ouvinte do evento é
  // registrado uma vez só e mesmo assim enxerga o histórico atual.
  const sendRef = useRef<(content: string, options?: ChatContextOptions) => void>(() => undefined);

  // Quando a ajuda vem de uma questão, mantém o id nas mensagens seguintes:
  // o aluno costuma continuar perguntando sobre a mesma questão. Ao trocar de
  // tela, o contexto some para não contaminar uma conversa nova.
  const activeQuestionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    activeQuestionIdRef.current = undefined;
  }, [location.pathname]);

  // Outras telas abrem a conversa já com uma pergunta (ex.: o cronograma
  // pergunta "por que essa tarefa está no meu dia?" passando o id da tarefa).
  useEffect(() => {
    function onAsk(event: Event) {
      const detail = (event as CustomEvent<AskAiDetail>).detail;
      if (!detail?.message) return;
      activeQuestionIdRef.current = detail.questionId;
      setSocraticMode(Boolean(detail.socratic));
      setOpen(true);
      sendRef.current(detail.message, {
        scheduleTaskId: detail.scheduleTaskId,
        questionId: detail.questionId,
        mode: detail.socratic ? "SOCRATIC" : undefined,
      });
    }
    window.addEventListener(ASK_AI_EVENT, onAsk);
    return () => window.removeEventListener(ASK_AI_EVENT, onAsk);
  }, []);

  async function send(content: string, options: ChatContextOptions = {}) {
    if (!content || sending) return;
    const userMessage: AiChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
    setSending(true);
    try {
      const response = await sendAiChatMessage(content, nextHistory, {
        ...options,
        questionId: options.questionId ?? activeQuestionIdRef.current,
        mode: options.mode ?? (socraticMode ? "SOCRATIC" : undefined),
      });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof AiChatNotConfiguredError
            ? "A conexão com a IA ainda não está ativa. A interface já está pronta para receber a integração."
            : "Não consegui responder agora. Tente novamente em instantes.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }
  useEffect(() => {
    sendRef.current = (content, options) => void send(content, options);
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    void send(content);
  }

  if (!user || !location.pathname.startsWith("/app")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 sm:bottom-6 sm:right-6 print:hidden">
      {open ? (
        <section aria-label="Conversa com a LuminIA" className="flex h-[min(620px,calc(100vh-48px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-surface-line bg-white shadow-2xl shadow-graphite/20">
          <header className="flex items-center gap-3 bg-graphite px-4 py-4 text-white">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-graphite"><Bot className="h-5 w-5" /><span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-graphite bg-success" /></span>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h2 className="font-semibold">LuminIA</h2><Sparkles className="h-3.5 w-3.5 text-primary" /></div><p className="text-xs text-white/45">{socraticMode ? "Modo socrático · online" : "Assistente de estudos · online"}</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimizar conversa" className="rounded-lg p-2 text-white/55 transition hover:bg-white/10 hover:text-white"><ChevronDown className="h-5 w-5" /></button>
          </header>

          <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-4 overflow-y-auto bg-surface-card p-4">
            <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary-700"><Sparkles className="h-3 w-3" />Conectada</div>
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "rounded-br-md bg-graphite text-white" : "rounded-bl-md border border-surface-line bg-white text-graphite"}`}>{message.content}</div>
              </div>
            ))}
            {sending && <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md border border-surface-line bg-white px-4 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-graphite-400" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-graphite-400 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-graphite-400 [animation-delay:240ms]" /></div>}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-surface-line bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSocraticMode((current) => !current)}
                aria-pressed={socraticMode}
                title="A LuminIA pergunta e conduz você até a solução, em vez de entregar a resposta."
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${socraticMode ? "border-primary bg-primary/15 text-primary-700" : "border-surface-line bg-white text-graphite-500 hover:border-graphite/30"}`}
              >
                <Brain className="h-3.5 w-3.5" />
                Modo socrático
              </button>
              <span className="text-[10px] text-graphite-400">
                {socraticMode ? "Uma pergunta por vez" : "Explicação direta"}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-surface-line bg-surface-card p-1.5 pl-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} aria-label="Mensagem para a LuminIA" placeholder={socraticMode ? "Responda ou diga onde travou..." : "Pergunte sobre seus estudos..."} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-graphite-400" />
              <button type="submit" disabled={!input.trim() || sending} aria-label="Enviar mensagem" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-graphite transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-center text-[10px] text-graphite-400">A IA pode cometer erros. Revise informações importantes.</p>
          </form>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir conversa com a LuminIA" className="group flex items-center gap-3 rounded-full bg-graphite p-2.5 pr-4 text-white shadow-xl shadow-graphite/25 transition hover:-translate-y-0.5 hover:shadow-2xl">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary text-graphite"><MessageCircle className="h-5 w-5" /><span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-graphite bg-success" /></span>
          <span className="text-left"><span className="block text-sm font-semibold">Fale com a LuminIA</span><span className="block text-[10px] text-white/45">Assistente de estudos</span></span>
        </button>
      )}
    </div>
  );
}
