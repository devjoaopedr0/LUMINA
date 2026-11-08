import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { QuestionsService } from '../questions/questions.service';
import { AiService } from './ai.service';
import {
  buildSimilarQuestionPrompt,
  GeneratedSimilarQuestion,
  parseSimilarQuestion,
  SIMILAR_QUESTION_PROMPT_VERSION,
  SIMILAR_QUESTION_SYSTEM,
} from './similar-question';

/**
 * Orquestra a criação de uma variação: lê a questão de referência no servidor,
 * pede a geração à IA, valida o formato e persiste no workspace pessoal. O
 * cliente manda apenas o id — nunca enuncia o gabarito, o assunto ou o formato.
 */
@Injectable()
export class SimilarQuestionService {
  private readonly logger = new Logger(SimilarQuestionService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly questionsService: QuestionsService,
  ) {}

  async generate(userId: string, questionId: string): Promise<QuestionResponseDto> {
    const source = await this.questionsService.similarQuestionSource(userId, questionId);

    let result: Awaited<ReturnType<AiService['generateStructured']>>;
    try {
      result = await this.aiService.generateStructured({
        system: SIMILAR_QUESTION_SYSTEM,
        prompt: buildSimilarQuestionPrompt(source),
        maxTokens: 2500,
        timeoutMs: 60_000,
        // Criatividade suficiente para mudar o contexto, sem perder o formato
        // JSON nem inventar uma questão fora do assunto.
        temperature: 0.55,
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao gerar questão parecida: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException(
        'A LuminIA não conseguiu gerar a questão agora. Tente novamente em instantes.',
      );
    }

    if (!result) {
      throw new ServiceUnavailableException(
        'A criação de questão parecida precisa de um provedor de IA configurado.',
      );
    }

    let generated: GeneratedSimilarQuestion;
    try {
      generated = parseSimilarQuestion(result.text, {
        alternativeCount: source.alternatives.length,
        sourceStem: source.stem,
      });
    } catch (error) {
      this.logger.warn(
        `Resposta inválida ao gerar questão parecida: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException(
        'A LuminIA devolveu uma questão inválida. Tente gerar novamente.',
      );
    }

    return this.questionsService.createGeneratedQuestion(userId, {
      sourceQuestionId: source.id,
      subject: source.subject,
      topic: source.topic,
      subjectId: source.subjectId,
      topicId: source.topicId,
      difficulty: source.difficulty,
      stem: generated.stem,
      explanation: generated.explanation,
      alternatives: generated.alternatives,
      metadata: {
        generator: 'LUMINIA',
        generatedFromQuestionId: source.id,
        promptVersion: SIMILAR_QUESTION_PROMPT_VERSION,
        model: result.model,
        generatedAt: new Date().toISOString(),
        reviewStatus: 'UNREVIEWED',
      },
    });
  }
}
