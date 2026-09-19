import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

/**
 * Formato público de um usuário. @Exclude() na classe + @Expose() por campo
 * é uma allowlist: qualquer campo novo adicionado no futuro (ex: um dado
 * sensível vindo do Prisma) fica oculto por padrão, a menos que seja
 * explicitamente exposto aqui. Nunca expõe password_hash.
 * Usado junto com o ClassSerializerInterceptor global (ver main.ts).
 */
@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({ nullable: true })
  teacherSubject: string | null;
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  email: string;

  @Expose()
  @ApiProperty()
  emailVerified: boolean;

  @Expose()
  @ApiProperty()
  status: string;

  @Expose()
  @ApiProperty({ nullable: true })
  lastLogin: Date | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty({
    description:
      'false quando a conta foi criada via login social (Google) e ainda não tem uma senha local definida.',
  })
  hasPassword: boolean;

  @Expose()
  @ApiProperty({ nullable: true })
  firstName: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  lastName: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  username: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  phone: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  birthDate: Date | null;

  @Expose()
  @ApiProperty({ nullable: true })
  bio: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  educationLevel: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  schoolYear: number | null;

  @Expose()
  @ApiProperty({ nullable: true })
  schoolName: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  desiredCourse: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  targetUniversity: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  preferredStudyPeriod: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  studySessionMinutes: number | null;

  @Expose()
  @ApiProperty({ nullable: true })
  weeklyStudyDays: number | null;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
