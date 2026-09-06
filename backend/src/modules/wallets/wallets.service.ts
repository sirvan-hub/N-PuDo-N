import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from '../../database/entities/wallet.entity';

@Injectable()
export class WalletsService {
  constructor(@InjectRepository(WalletEntity) private repo: Repository<WalletEntity>) {}

  async getOrCreate(userId: string) {
    let w = await this.repo.findOne({ where: { user_id: userId } });
    if (!w) { w = this.repo.create({ user_id: userId }); w = await this.repo.save(w); }
    return w;
  }

  async credit(userId: string, amount: number) {
    const w = await this.getOrCreate(userId);
    w.balance += amount;
    w.total_earned += amount;
    return this.repo.save(w);
  }
}
