import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UserEntity) private repo: Repository<UserEntity>) {}

  async verifyUser(userId: string, adminId: string): Promise<UserEntity> {
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.is_verified = true;
    user.verified_by = adminId;
    user.verified_at = new Date();
    return this.repo.save(user);
  }

  async getPending() {
    return this.repo.find({ where: { is_verified: false }, order: { created_at: 'DESC' } });
  }
}
