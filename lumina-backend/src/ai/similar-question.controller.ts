import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { UserWithProfile } from '../users/users.repository';
import { GenerateSimilarQuestionDto } from './similar-question.dto';
import { SimilarQuestionService } from './similar-question.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/questions')
export class SimilarQuestionController {
  constructor(private readonly similarQuestionService: SimilarQuestionService) {}

  @Post('similar')
  @ApiOperation({
    summary: 'Cria uma questão semelhante com a LuminIA',
    description:
      'Gera uma variação inédita a partir de uma questão acessível, valida o formato e salva no workspace pessoal do usuário como questão gerada (não oficial).',
  })
  @ApiResponse({ status: 201, type: QuestionResponseDto })
  @ApiResponse({ status: 404, description: 'Questão de referência não encontrada.' })
  @ApiResponse({ status: 502, description: 'A IA devolveu uma questão inválida.' })
  @ApiResponse({ status: 503, description: 'Provedor de IA não configurado.' })
  generate(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: GenerateSimilarQuestionDto,
  ): Promise<QuestionResponseDto> {
    return this.similarQuestionService.generate(user.id, dto.questionId);
  }
}
