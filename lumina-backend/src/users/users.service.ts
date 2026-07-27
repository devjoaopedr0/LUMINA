import { Injectable } from '@nestjs/common';
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

  /** Achata User + UserProfile num único objeto público, sem password_hash. */
  toPublicUser(user: UserWithProfile): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      username: user.profile?.username ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      phone: user.profile?.phone ?? null,
      bio: user.profile?.bio ?? null,
    });
  }
}
