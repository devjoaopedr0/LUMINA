/**
 * Cache de leitura para a previsão do calendário. O gerador consulta, a cada
 * dia, tópicos, domínio, banco de questões e matérias, que não mudam entre os
 * dias de uma mesma consulta. Este proxy memoriza só essas leituras (pelos
 * argumentos) durante UMA requisição; o resto (tarefas por perto, sessões)
 * passa direto, porque muda com a data.
 */
const CACHED: Record<string, string[]> = {
  topic: ['findMany'],
  topicMastery: ['findMany'],
  question: ['findMany'],
  subject: ['findUnique', 'findMany'],
  // Sessões da semana (redação semanal): iguais para os dias da mesma semana.
  studySession: ['findMany'],
};

export function withReadCache<T extends object>(db: T): T {
  const memo = new Map<string, Promise<unknown>>();
  return new Proxy(db, {
    get(target, model: string | symbol, receiver) {
      const delegate = Reflect.get(target, model, receiver) as Record<string, unknown> | undefined;
      const methods = typeof model === 'string' ? CACHED[model] : undefined;
      if (!methods || !delegate) return delegate;
      return new Proxy(delegate, {
        get(inner, method: string | symbol, innerReceiver) {
          const fn = Reflect.get(inner, method, innerReceiver);
          if (typeof method !== 'string' || !methods.includes(method) || typeof fn !== 'function') return fn;
          return (args: unknown) => {
            const key = `${String(model)}.${method}:${JSON.stringify(args)}`;
            if (!memo.has(key)) memo.set(key, (fn as (a: unknown) => Promise<unknown>).call(inner, args));
            return memo.get(key);
          };
        },
      });
    },
  });
}
