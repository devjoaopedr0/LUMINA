import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersRepository, UserWithProfile } from './users.repository';

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
    if (dto.birthDate) data.birthDate = new Date(`${dto.birthDate}T00:00:00.000Z`);

    try {
      const updated = await this.usersRepository.updateProfile(userId, data);
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

  /** Achata User + UserProfile num único objeto público, sem password_hash. */
  toPublicUser(user: UserWithProfile): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      teacherSubject: user.teacherProfile?.subject ?? null,
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
    });
  }
}
