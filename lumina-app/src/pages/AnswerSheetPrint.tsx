import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getAccessToken } from '@/lib/auth';
import { apiAnswerSheetPrepare, ApiError, type PrintableSheets, type SheetLayout } from '@/lib/api';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Uma folha A4 em SVG, em milímetros — o mesmo layout que o servidor usa para
 * ler. Não mude escala nem margens: a impressão precisa sair em "tamanho real".
 */
function Sheet({ layout, title, className, studentName, code, bits }: { layout: SheetLayout; title: string; className: string | null; studentName: string | null; code: number; bits: boolean[] }) {
  const s = layout.fiducialSize;
  const h = layout.header;
  return (
    <svg className="sheet" viewBox={`0 0 ${layout.page.width} ${layout.page.height}`} width={`${layout.page.width}mm`} height={`${layout.page.height}mm`} role="img" aria-label={`Cartão-resposta ${studentName ?? 'genérico'}`}>
      <rect x={0} y={0} width={layout.page.width} height={layout.page.height} fill="white" />
      {layout.fiducials.map((f, i) => <rect key={i} x={f.x - s / 2} y={f.y - s / 2} width={s} height={s} fill="black" />)}
      {layout.codeCells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.size} height={c.size} fill={bits[i] ? 'black' : 'white'} stroke="black" strokeWidth={0.3} />)}
      <text x={h.x} y={h.y + 4} fontSize={5} fontWeight={700} fontFamily="Arial, sans-serif">{title.length > 60 ? `${title.slice(0, 57)}…` : title}</text>
      <text x={h.x} y={h.y + 10} fontSize={3.4} fontFamily="Arial, sans-serif">{className ? `Turma: ${className}` : 'Lumina · cartão-resposta'}   ·   Folha nº {code}</text>
      <text x={h.x} y={h.y + 18} fontSize={3.8} fontFamily="Arial, sans-serif">Nome: {studentName ?? '________________________________________________'}</text>
      <text x={h.x} y={h.y + 25} fontSize={2.9} fill="#444" fontFamily="Arial, sans-serif">Preencha a bolha inteira com caneta preta ou azul escura. Não rasure nem dobre a folha, e não escreva perto dos quadrados pretos.</text>
      {layout.questions.map((q) => (
        <g key={q.number}>
          <text x={q.label.x} y={q.label.y + 1.3} fontSize={3.4} fontWeight={700} fontFamily="Arial, sans-serif">{String(q.number).padStart(2, '0')}</text>
          {q.bubbles.map((b) => (
            <g key={b.position}>
              <circle cx={b.x} cy={b.y} r={b.r} fill="white" stroke="#333" strokeWidth={0.28} />
              <text x={b.x} y={b.y + 0.9} fontSize={2.4} textAnchor="middle" fill="#9a9a9a" fontFamily="Arial, sans-serif">{LETTERS[b.position - 1]}</text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function AnswerSheetPrint() {
  const { simulationId } = useParams();
  const [data, setData] = useState<PrintableSheets | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!simulationId) return;
    let active = true;
    apiAnswerSheetPrepare(getAccessToken() ?? '', simulationId)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : 'Não foi possível gerar os cartões.'); });
    return () => { active = false; };
  }, [simulationId]);

  return (
    <main className="min-h-screen bg-surface-card px-4 py-6 text-graphite print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .sheet { display: block; page-break-after: always; break-after: page; } }`}</style>
      <div className="no-print mx-auto mb-6 max-w-3xl">
        <Link to="/app/gabarito-scanner" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Scanner de gabarito</Link>
        <h1 className="mt-4 text-2xl font-bold">Cartões-resposta para imprimir</h1>
        {data ? (
          <p className="mt-2 text-graphite-500">
            {data.simulation.title} · {data.simulation.questionCount} questões · {data.sheets.length} {data.sheets.length === 1 ? 'folha' : 'folhas'}
            {data.sheets.some((s) => s.studentId) ? ' (uma por aluno, e uma genérica no fim)' : ''}.
          </p>
        ) : null}
        <p className="mt-2 text-sm text-graphite-500">Imprima em A4, em <strong>tamanho real (100%)</strong>, sem "ajustar à página". Cada folha tem um código que identifica o simulado e o aluno: o professor pode escanear a folha de qualquer aluno.</p>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p> : null}
        {data ? <Button className="mt-4" onClick={() => window.print()}><Printer size={18} />Imprimir</Button> : !error ? <p role="status" className="mt-4">Gerando cartões…</p> : null}
      </div>
      {data ? (
        <div className="mx-auto flex max-w-[210mm] flex-col gap-6 print:gap-0">
          {data.sheets.map((sheet) => (
            <div key={sheet.code} className="bg-white shadow print:shadow-none">
              <Sheet layout={data.layout} title={data.simulation.title} className={data.simulation.className} studentName={sheet.studentName} code={sheet.code} bits={sheet.bits} />
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
