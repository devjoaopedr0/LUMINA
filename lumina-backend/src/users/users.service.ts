import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersRepository, UserWithProfile } from './users.repository';
import { assertBirthDate } from '../common/date-rules';
import { CURRENT_TERMS_VERSION } from '../common/legal';
import { goalFromProfile } from '../schedules/schedule-goal';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  findByUsername(username: string) {
    return this.usersRepository.findByUsername(username);
  }

  findById(id: string) {
    return this.usersRepository.findById(id);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    const data: Prisma.UserProfileUpdateInput = { ...dto };
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName) data.lastName = dto.lastName.trim();
    if (dto.username) data.username = dto.username.trim().toLowerCase();
    if (dto.bio) data.bio = dto.bio.trim();
    if (dto.schoolName) data.schoolName = dto.schoolName.trim();
    if (dto.desiredCourse) data.desiredCourse = dto.desiredCourse.trim();
    if (dto.targetUniversity) data.targetUniversity = dto.targetUniversity.trim();
    if (dto.birthDate) data.birthDate = assertBirthDate(dto.birthDate);

    try {
      const updated = await this.usersRepository.updateProfile(userId, data);
      if (dto.desiredCourse !== undefined || dto.targetUniversity !== undefined) {
        await this.usersRepository.syncScheduleGoal(userId, goalFromProfile(updated.profile));
      }
      return this.toPublicUser(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este username já está em uso.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Perfil não encontrado.');
      }
      throw error;
    }
  }

  /** Aceite da versão vigente dos Termos (cadastro pelo Google, conta antiga ou termos atualizados). */
  async acceptTerms(userId: string, version: string): Promise<UserResponseDto> {
    if (version !== CURRENT_TERMS_VERSION) {
      throw new BadRequestException('Os Termos foram atualizados. Recarregue a página e leia a versão vigente.');
    }
    const updated = await this.usersRepository.acceptTerms(userId, version);
    return this.toPublicUser(updated);
  }

  /** Achata User + UserProfile num único objeto público, sem password_hash. */
  toPublicUser(user: UserWithProfile): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      accountType: user.accountType,
      teacherSubject: user.teacherProfile?.subject ?? null,
      termsVersion: user.termsVersion ?? null,
      termsAcceptedAt: user.termsAcceptedAt ?? null,
      termsCurrent: user.termsVersion === CURRENT_TERMS_VERSION,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      hasPassword: user.passwordHash !== null,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      username: user.profile?.username ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      phone: user.profile?.phone ?? null,
      birthDate: user.profile?.birthDate ?? null,
      bio: user.profile?.bio ?? null,
      educationLevel: user.profile?.educationLevel ?? null,
      schoolYear: user.profile?.schoolYear ?? null,
      schoolName: user.profile?.schoolName ?? null,
      desiredCourse: user.profile?.desiredCourse ?? null,
      targetUniversity: user.profile?.targetUniversity ?? null,
      sisuModality: user.profile?.sisuModality ?? null,
      preferredStudyPeriod: user.profile?.preferredStudyPeriod ?? null,
      studySessionMinutes: user.profile?.studySessionMinutes ?? null,
      weeklyStudyDays: user.profile?.weeklyStudyDays ?? null,
    });
  }
}
