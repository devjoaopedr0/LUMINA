import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Convite de entrada na instituição. Só aceita os 3 perfis que fazem
 * sentido convidar por aqui — promover alguém a Diretor (ex: co-direção)
 * fica fora deste fluxo de propósito: quem tem MEMBER_MANAGE (Diretor ou
 * Coordenador) não deveria conseguir criar outro Diretor só convidando. */
export class CreateInviteDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsIn(['STUDENT_INSTITUTION', 'TEACHER', 'COORDINATOR'])
  accountType: 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;
}

export class TransferClassMemberDto {
  @IsUUID()
  studentId: string;

  @IsUUID()
  fromClassId: string;

  @IsUUID()
  toClassId: string;
}
