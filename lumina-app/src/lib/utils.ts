import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Padrão padrão de e-mail: local@dominio.tld (ex: nome@gmail.com). Usado
 * para dar feedback imediato no formulário, além da validação do backend. */
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Dia de calendário do ALUNO (fuso do navegador) como "AAAA-MM-DD" — é o
 * que o backend espera em `?date=`. `toISOString()` daria o dia em UTC, que
 * à noite no Brasil já é o dia seguinte. */
export function localDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Formata uma data-calendário (sem hora) vinda do backend, tipicamente um
 * `@db.Date` do Prisma serializado como meia-noite UTC
 * (ex: "2026-09-08T00:00:00.000Z"). Passar isso por `new Date(...)` e depois
 * `toLocaleDateString` converte para o fuso do navegador — em fusos atrás de
 * UTC (ex: America/Sao_Paulo, UTC-3, o público-alvo da Lumina) isso exibe o
 * dia ANTERIOR ao selecionado. Lendo o ano/mês/dia direto da string evita
 * essa conversão de fuso.
 *
 * Use isto para datas-calendário (vencimento, período letivo, cronograma).
 * Para timestamps de verdade (quando algo aconteceu, ex: submittedAt de uma
 * entrega), `new Date(iso).toLocaleDateString("pt-BR")` já está correto —
 * ali o fuso do navegador é exatamente o que se quer. */
export function formatCalendarDate(date: Date | string): string {
  if (typeof date === "string") {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
  }
  return new Date(date).toLocaleDateString("pt-BR");
}
