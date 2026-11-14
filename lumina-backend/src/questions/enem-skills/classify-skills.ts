/**
 * Classifica as questões do banco central pela Matriz de Referência do ENEM.
 *
 *   npm run build && npm run questions:classify-skills -- --dry-run
 *   npm run questions:classify-skills -- --limit 40 --max-calls 10
 *
 * Opções:
 *   --dry-run        não chama a IA nem grava; mostra o que seria classificado
 *   --limit N        no máximo N questões nesta execução
 *   --batch N        questões por chamada (padrão 8; todas da mesma área)
 *   --max-calls N    teto de chamadas à IA (padrão 60), para a cota gratuita
 *   --area MT        só uma área (LC, CH, CN, MT)
 *   --redo           refaz as sugestões da IA ainda não validadas
 *   --models a,b     cadeia de modelos (padrão AI_ANSWER_KEY_MODELS → AI_ESSAY_MODELS)
 *
 * Nunca sobrescreve uma classificação MANUAL. O que a IA grava fica com
 * origem AI e não validado, até o professor ou a gestão confirmar.
 */
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service';
import { answerKeyModels } from '../../answer-keys/answer-key.questions';
import { PrismaService } from '../../database/prisma.service';
import { QUESTION_BANK_INSTITUTION_EMAIL } from '../question-access.service';
import { ENEM_AREAS, type EnemArea, areaForSubject, isEnemArea } from './enem-matrix';
import { SKILL_SYSTEM, parseSkillBatch, skillBatchPrompt, type SkillQuestionInput } from './skill-classifier';

const ROOT = join(__dirname, '..', '..', '..');
const flag = (name: string) => process.argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (name: string, fallback: number) => {
  const v = Number(opt(name));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

async function main() {
  process.loadEnvFile(join(ROOT, '.env'));
  const config = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const dryRun = flag('dry-run');
  const batchSize = Math.min(num('batch', 8), 15);
  const maxCalls = num('max-calls', 60);
  const limit = num('limit', Number.MAX_SAFE_INTEGER);
  const onlyArea = opt('area');
  if (onlyArea && !isEnemArea(onlyArea)) throw new Error(`Área inválida: ${onlyArea}. Use ${ENEM_AREAS.join(', ')}.`);
  const models = opt('models')?.split(',').map((m) => m.trim()).filter(Boolean) ?? answerKeyModels();

  try {
    const bank = (await prisma.institution.findUnique({ where: { email: QUESTION_BANK_INSTITUTION_EMAIL }, include: { workspace: true } }))?.workspace;
    if (!bank) throw new Error('Banco central de questões não encontrado.');
    const questions = await prisma.question.findMany({
      where: {
        workspaceId: bank.id,
        ...(flag('redo') ? { OR: [{ enemSkill: null }, { enemSkillOrigin: 'AI', enemSkillValidated: false }] } : { enemSkill: null }),
      },
      select: { id: true, subject: true, topic: true, stem: true, imageUrl: true, alternatives: { select: { text: true, position: true }, orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    const byArea = new Map<EnemArea, typeof questions>();
    const noArea: string[] = [];
    for (const q of questions) {
      const area = areaForSubject(q.subject);
      if (!area) { noArea.push(q.subject); continue; }
      if (onlyArea && area !== onlyArea) continue;
      byArea.set(area, [...(byArea.get(area) ?? []), q]);
    }
    const queue = [...byArea.entries()].flatMap(([area, list]) => list.map((q) => ({ area, q }))).slice(0, limit);
    console.log(`Banco: ${questions.length} questões a classificar · nesta execução: ${queue.length} · ${[...byArea].map(([a, l]) => `${a} ${l.length}`).join(' · ')}`);
    if (noArea.length) console.log(`Sem área do ENEM pela matéria (ficam para classificação manual): ${[...new Set(noArea)].join(', ')} (${noArea.length})`);
    if (dryRun) {
      const first = queue.slice(0, Math.min(2, queue.length));
      if (first.length) console.log(`\nExemplo de prompt (${first[0].area}, ${first.length} questões):\n${skillBatchPrompt(first[0].area, first.filter((f) => f.area === first[0].area).map(({ q }, i) => toInput(q, `Q${i + 1}`)))}`);
      console.log(`\n--dry-run: nenhuma chamada e nada gravado. Chamadas previstas: ${Math.ceil(queue.length / batchSize)}.`);
      return;
    }

    const ai = new AiService(config);
    let calls = 0;
    let saved = 0;
    let nulls = 0;
    for (const area of ENEM_AREAS) {
      const items = queue.filter((x) => x.area === area);
      for (let i = 0; i < items.length; i += batchSize) {
        if (calls >= maxCalls) {
          console.log(`Teto de ${maxCalls} chamadas atingido. Rode de novo para continuar (o que já foi gravado não é refeito).`);
          return report();
        }
        const batch = items.slice(i, i + batchSize);
        const refs = batch.map((_, k) => `Q${k + 1}`);
        calls += 1;
        const result = await ai.generateStructured({
          system: SKILL_SYSTEM,
          prompt: skillBatchPrompt(area, batch.map(({ q }, k) => toInput(q, refs[k]))),
          maxTokens: 400 + 120 * batch.length,
          timeoutMs: 90_000,
          temperature: 0.1,
          models,
        });
        if (!result?.text) {
          console.log(`  ${area} lote ${i / batchSize + 1}: sem resposta da IA (cota ou erro); parando.`);
          return report();
        }
        const parsed = parseSkillBatch(result.text, area, refs);
        for (const [k, c] of parsed.entries()) {
          const q = batch[k].q;
          if (!c.code) { nulls += 1; continue; }
          // Grava só se ninguém classificou à mão no meio do caminho.
          const updated = await prisma.question.updateMany({
            where: { id: q.id, OR: [{ enemSkillOrigin: null }, { enemSkillOrigin: 'AI', enemSkillValidated: false }] },
            data: { enemSkill: c.code, enemSkillOrigin: 'AI', enemSkillValidated: false, enemSkillNote: c.note || null },
          });
          saved += updated.count;
        }
        console.log(`  ${area} lote ${i / batchSize + 1}: ${parsed.filter((p) => p.code).map((p) => p.code).join(' ')}${parsed.some((p) => !p.code) ? ` · ${parsed.filter((p) => !p.code).length} sem habilidade` : ''} (${result.model})`);
      }
    }
    report();

    function report() {
      console.log(`\nChamadas: ${calls} · classificadas: ${saved} · sem habilidade segura: ${nulls}. Tudo como sugestão da IA (pendente de validação).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function toInput(q: { subject: string; topic: string; stem: string; imageUrl: string | null; alternatives: { text: string }[] }, ref: string): SkillQuestionInput {
  const stem = q.imageUrl ? `${q.stem}\n[A questão tem uma imagem que não está neste texto.]` : q.stem;
  return { ref, subject: q.subject, topic: q.topic, stem, alternatives: q.alternatives.map((a) => a.text) };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
