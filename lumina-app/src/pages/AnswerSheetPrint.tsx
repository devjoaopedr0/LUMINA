import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getAccessToken } from '@/lib/auth';
import { apiAnswerSheetPrepare, apiAnswerSheetSaveOptions, ApiError, type PrintableSheets, type SheetLayout, type SheetOptions, type SheetSection } from '@/lib/api';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const FONT = 'Arial, Helvetica, sans-serif';
const BAR = '#e4e4e4';
const LINE = '#555';

interface SheetProps { layout: SheetLayout; title: string; className: string | null; studentName: string | null; code: number; bits: boolean[] }

/** Letras do nome, uma por quadrado (quebra para a linha de baixo). */
function boxLetters(section: Extract<SheetSection, { kind: 'boxes' }>, text: string | null) {
  if (!text) return null;
  const letters = text.toUpperCase().slice(0, section.columns * section.rows).split('');
  return letters.map((ch, i) => {
    const row = Math.floor(i / section.columns);
    const col = i % section.columns;
    return <text key={i} x={section.x + col * section.cell + section.cell / 2} y={section.y + 4.5 + row * section.cell + section.cell * 0.72} fontSize={3.4} textAnchor="middle" fontFamily={FONT}>{ch}</text>;
  });
}

function Section({ s, studentName }: { s: SheetSection; studentName: string | null }) {
  if (s.kind === 'boxes') {
    return (
      <g>
        <text x={s.x} y={s.y + 3.2} fontSize={2.9} fontWeight={700} fontFamily={FONT}>{s.label}</text>
        {Array.from({ length: s.rows * s.columns }, (_, i) => (
          <rect key={i} x={s.x + (i % s.columns) * s.cell} y={s.y + 4.5 + Math.floor(i / s.columns) * s.cell} width={s.cell} height={s.cell} fill="white" stroke={LINE} strokeWidth={0.2} />
        ))}
        {s.key === 'student' ? boxLetters(s, studentName) : null}
      </g>
    );
  }
  if (s.kind === 'text') {
    return (
      <g>
        <text x={s.x} y={s.y + 3.2} fontSize={2.9} fontWeight={700} fontFamily={FONT}>{s.label}</text>
        <text x={s.x + 32} y={s.y + 3.2} fontSize={3.4} fontFamily={FONT}>{s.text}</text>
        <line x1={s.x + 31} x2={s.x + s.width} y1={s.y + 4.6} y2={s.y + 4.6} stroke={LINE} strokeWidth={0.2} />
      </g>
    );
  }
  const frame = (
    <>
      <rect x={s.x} y={s.y} width={s.width} height={s.height} rx={1.5} fill="white" stroke={LINE} strokeWidth={0.3} />
      <path d={`M${s.x + 0.15},${s.y + 5} V${s.y + 1.5} Q${s.x + 0.15},${s.y + 0.15} ${s.x + 1.5},${s.y + 0.15} H${s.x + s.width - 1.5} Q${s.x + s.width - 0.15},${s.y + 0.15} ${s.x + s.width - 0.15},${s.y + 1.5} V${s.y + 5} Z`} fill={BAR} />
      <text x={s.x + s.width / 2} y={s.y + 3.6} fontSize={s.kind === 'instructions' ? 3.3 : 2.7} fontWeight={700} textAnchor="middle" fontFamily={FONT} fill="#333">{s.title}</text>
    </>
  );
  if (s.kind === 'instructions') {
    return (
      <g>
        {frame}
        {s.lines.map((line, i) => <text key={i} x={s.x + 3} y={s.y + 6 + (i + 1) * s.lineHeight - 0.7} fontSize={2.45} fontFamily={FONT} xmlSpace="preserve">{line}</text>)}
      </g>
    );
  }
  if (s.kind === 'phrase') {
    return (
      <g>
        {frame}
        <text x={s.x + s.width / 2} y={s.y + 8.6} fontSize={2.9} fontStyle="italic" textAnchor="middle" fontFamily={FONT} fill="#333">"{s.text}"</text>
        <line x1={s.x + 4} x2={s.x + s.width - 4} y1={s.y + 13.2} y2={s.y + 13.2} stroke={LINE} strokeWidth={0.2} />
      </g>
    );
  }
  return (
    <g>
      {frame}
      {s.choices.map((c, i) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r={c.r} fill="white" stroke="#333" strokeWidth={0.28} />
          <text x={c.x} y={c.y + 0.9} fontSize={2.3} textAnchor="middle" fill="#9a9a9a" fontFamily={FONT}>{i + 1}</text>
          <text x={c.x + c.r + 1.6} y={c.y + 1.1} fontSize={3} fontFamily={FONT}>{c.label}</text>
        </g>
      ))}
    </g>
  );
}

/**
 * Uma folha A4 em SVG, em milímetros — o mesmo layout que o servidor usa para
 * ler. Não mude escala nem margens: a impressão precisa sair em "tamanho real".
 */
function Sheet({ layout, title, className, studentName, code, bits }: SheetProps) {
  const s = layout.fiducialSize;
  const sections = layout.sections;
  const subtitle = `${title}${className ? ` · Turma ${className}` : ''}`;
  const groupSections = sections?.filter((x) => x.kind === 'boxes' || x.kind === 'text') ?? [];
  const group = groupSections.length
    ? { top: groupSections[0].y - 1.5, bottom: (() => { const last = groupSections[groupSections.length - 1]; return last.kind === 'boxes' ? last.y + 4.5 + last.rows * last.cell + 1.2 : last.y + last.height + 1.2; })() }
    : null;
  return (
    <svg className="sheet" viewBox={`0 0 ${layout.page.width} ${layout.page.height}`} width={`${layout.page.width}mm`} height={`${layout.page.height}mm`} role="img" aria-label={`Cartão-resposta ${studentName ?? 'genérico'}`}>
      <rect x={0} y={0} width={layout.page.width} height={layout.page.height} fill="white" />
      {layout.fiducials.map((f, i) => <rect key={i} x={f.x - s / 2} y={f.y - s / 2} width={s} height={s} fill="black" />)}
      {layout.codeCells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.size} height={c.size} fill={bits[i] ? 'black' : 'white'} stroke="black" strokeWidth={0.3} />)}
      {sections ? (
        <>
          <text x={22} y={17} fontSize={6.6} fontWeight={700} letterSpacing={1.2} fontFamily={FONT}>CARTÃO-RESPOSTA</text>
          <text x={22} y={22.6} fontSize={3.3} fontFamily={FONT} fill="#333">{subtitle.length > 78 ? `${subtitle.slice(0, 75)}…` : subtitle.toUpperCase()}</text>
          <text x={188} y={15.5} fontSize={4.6} fontWeight={700} textAnchor="end" fontFamily={FONT}>Lumina</text>
          <text x={188} y={22.6} fontSize={2.7} textAnchor="end" fontFamily={FONT} fill="#555">Folha nº {code}</text>
          {group ? <rect x={20} y={group.top} width={170} height={group.bottom - group.top} rx={1.5} fill="none" stroke={LINE} strokeWidth={0.3} /> : null}
          {sections.map((section, i) => <Section key={i} s={section} studentName={studentName} />)}
          {layout.gridColumns?.map((c, i) => (
            <g key={i}>
              <rect x={c.x} y={c.y} width={c.width} height={c.height} fill="white" stroke={LINE} strokeWidth={0.3} />
              <rect x={c.x + 0.15} y={c.y + 0.15} width={c.width - 0.3} height={5.2} fill={BAR} />
              <text x={c.x + c.width / 2} y={c.y + 3.7} fontSize={2.8} fontWeight={700} textAnchor="middle" fontFamily={FONT}>Questão / Resposta</text>
              {c.rowLines.map((y) => <line key={y} x1={c.x} x2={c.x + c.width} y1={y} y2={y} stroke="#c8c8c8" strokeWidth={0.2} />)}
            </g>
          ))}
        </>
      ) : (
        // Cartão antigo (sem cabeçalho configurável): desenho original.
        <>
          <text x={layout.header.x} y={layout.header.y + 4} fontSize={5} fontWeight={700} fontFamily={FONT}>{title.length > 60 ? `${title.slice(0, 57)}…` : title}</text>
          <text x={layout.header.x} y={layout.header.y + 10} fontSize={3.4} fontFamily={FONT}>{className ? `Turma: ${className}` : 'Lumina · cartão-resposta'}   ·   Folha nº {code}</text>
          <text x={layout.header.x} y={layout.header.y + 18} fontSize={3.8} fontFamily={FONT}>Nome: {studentName ?? '________________________________________________'}</text>
          <text x={layout.header.x} y={layout.header.y + 25} fontSize={2.9} fill="#444" fontFamily={FONT}>Preencha a bolha inteira com caneta preta ou azul escura. Não rasure nem dobre a folha, e não escreva perto dos quadrados pretos.</text>
        </>
      )}
      {layout.questions.map((q) => (
        <g key={q.number}>
          <text x={q.label.x} y={q.label.y + 1.3} fontSize={3.4} fontWeight={700} fontFamily={FONT}>{String(q.displayNumber ?? q.number).padStart(2, '0')}</text>
          {q.bubbles.map((b) => (
            <g key={b.position}>
              <circle cx={b.x} cy={b.y} r={b.r} fill="white" stroke="#333" strokeWidth={0.28} />
              <text x={b.x} y={b.y + 0.9} fontSize={2.4} textAnchor="middle" fill="#9a9a9a" fontFamily={FONT}>{LETTERS[b.position - 1]}</text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Painel do gestor: o que o cartão traz. Muda a posição das bolhas, então trava depois da 1ª leitura. */
function OptionsPanel({ initial, locked, legacy, notes, busy, onSave }: { initial: SheetOptions; locked: boolean; legacy: boolean; notes: string[]; busy: boolean; onSave: (o: SheetOptions) => void }) {
  const [o, setO] = useState(initial);
  const [instructions, setInstructions] = useState(initial.instructions.join('\n'));
  const [colors, setColors] = useState(initial.bookletColors.join(', '));
  useEffect(() => { setO(initial); setInstructions(initial.instructions.join('\n')); setColors(initial.bookletColors.join(', ')); }, [initial]);
  const field = 'mt-1 w-full rounded-lg border border-surface-line px-3 py-2 text-sm disabled:bg-surface-card';
  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value} disabled={locked} onChange={(e) => set(e.target.checked)} />{label}</label>
  );
  return (
    <form
      className="mt-5 rounded-2xl border border-surface-line bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...o, instructions: instructions.split('\n').map((l) => l.trim()).filter(Boolean), bookletColors: colors.split(',').map((c) => c.trim()).filter(Boolean) });
      }}
    >
      <h2 className="flex items-center gap-2 font-semibold"><Settings2 size={18} />Personalizar o cartão</h2>
      <p className="mt-1 text-xs text-graphite-400">O cartão se adapta ao que você escolher. Se as questões não couberem com folga, as seções menos importantes saem sozinhas.</p>
      {locked ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Este cartão já tem folhas lidas. Mudar o layout agora deixaria as folhas impressas ilegíveis, então ele está travado.</p> : null}
      {legacy && !locked ? <p className="mt-3 rounded-lg bg-primary-50 p-3 text-sm">Este cartão está no modelo antigo. Aplicar passa para o modelo novo: reimprima as folhas que já saíram.</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          {check('Campo da instituição de ensino', o.showInstitution, (v) => setO({ ...o, showInstitution: v }))}
          <input aria-label="Nome da instituição" className={field} disabled={locked || !o.showInstitution} maxLength={90} placeholder="Nome impresso (vazio = quadrados para escrever)" value={o.institutionName ?? ''} onChange={(e) => setO({ ...o, institutionName: e.target.value || null })} />
          {check('Quadro da língua estrangeira (inglês/espanhol)', o.foreignLanguage, (v) => setO({ ...o, foreignLanguage: v }))}
          <label className="block text-sm">Cores do caderno (separadas por vírgula; vazio = sem o quadro)
            <input className={field} disabled={locked} value={colors} placeholder="Azul, Amarelo, Branco, Rosa" onChange={(e) => setColors(e.target.value)} />
          </label>
          <label className="block text-sm">Número da primeira questão
            <input type="number" min={1} max={999} className={field} disabled={locked} value={o.firstQuestionNumber} onChange={(e) => setO({ ...o, firstQuestionNumber: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Frase para transcrever (vazio = sem o quadro)
            <input className={field} disabled={locked} maxLength={120} value={o.phrase ?? ''} onChange={(e) => setO({ ...o, phrase: e.target.value || null })} />
          </label>
          <label className="block text-sm">Instruções (uma por linha; vazio = sem o quadro)
            <textarea className={`${field} h-36`} disabled={locked} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
        </div>
      </div>
      {notes.length ? <ul className="mt-3 list-disc pl-5 text-xs text-amber-700">{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      <Button className="mt-4" size="sm" disabled={locked || busy}>{busy ? 'Salvando…' : 'Aplicar ao cartão'}</Button>
    </form>
  );
}

export function AnswerSheetPrint() {
  const { simulationId } = useParams();
  const [data, setData] = useState<PrintableSheets | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!simulationId) return;
    let active = true;
    apiAnswerSheetPrepare(getAccessToken() ?? '', simulationId)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : 'Não foi possível gerar os cartões.'); });
    return () => { active = false; };
  }, [simulationId]);

  async function save(options: SheetOptions) {
    if (!simulationId) return;
    setBusy(true); setError('');
    try { setData(await apiAnswerSheetSaveOptions(getAccessToken() ?? '', simulationId, options)); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Não foi possível salvar o cartão.'); }
    finally { setBusy(false); }
  }

  const custom = data?.customization;
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
        {custom?.canCustomize ? <OptionsPanel initial={custom.options} locked={custom.locked} legacy={custom.legacy} notes={custom.notes} busy={busy} onSave={(o) => void save(o)} /> : null}
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
