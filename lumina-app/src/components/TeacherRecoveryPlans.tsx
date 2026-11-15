import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { apiTeacherRecoveryPlans } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PLAN_STATUS_LABEL, masteryDelta, planProgress, type RecoveryPlan } from '@/lib/recovery-plans';

/** Planos de recuperação dos alunos das turmas do professor (item 42). */
export function TeacherRecoveryPlans() {
  const [plans, setPlans] = useState<RecoveryPlan[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiTeacherRecoveryPlans(getAccessToken() ?? '')
      .then(setPlans)
      .catch(() => setError('Não foi possível carregar os planos de recuperação.'));
  }, []);

  return (
    <section className="mt-8" aria-labelledby="planos-titulo">
      <h2 id="planos-titulo" className="text-xl font-bold">Planos de recuperação</h2>
      <p className="text-sm text-graphite-500">Criados por você (a partir de um alerta) ou pelos próprios alunos das suas turmas.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {plans && plans.length === 0 ? (
        <Card className="mt-4 bg-white"><p className="text-sm text-graphite-500">Nenhum plano ainda. Nos alertas de desempenho, use "Criar plano de recuperação".</p></Card>
      ) : null}
      {plans && plans.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-surface-line bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-graphite-400">
              <tr><th className="px-3 py-2">Aluno</th><th className="px-3 py-2">Assunto</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2 text-right">Progresso</th><th className="px-3 py-2 text-right">Domínio</th></tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const delta = masteryDelta(p);
                return (
                  <tr key={p.id} className="border-t border-surface-line">
                    <td className="px-3 py-2 font-semibold">{p.studentName}</td>
                    <td className="px-3 py-2">{p.topicName} <span className="text-graphite-400">· {p.subjectName}</span></td>
                    <td className="px-3 py-2">{PLAN_STATUS_LABEL[p.status]}{p.createdBySelf ? ' (criado pelo aluno)' : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{planProgress(p)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.baselineMastery ?? '—'} → {p.currentMastery ?? '—'}{delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta})` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
