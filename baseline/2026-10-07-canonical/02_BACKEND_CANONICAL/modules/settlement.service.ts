import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettlementTransactionEntity } from '../../database/entities/settlement-transaction.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { SettlementTransactionType, SettlementTransactionStatus } from '../../database/entities/settlement-transaction.entity';
import { ParcelStatus } from '../../modules/parcels/parcel.state-machine';
import { ParcelStateMachineService } from '../parcels/parcel-state-machine.service';

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(SettlementTransactionEntity)
    private repo: Repository<SettlementTransactionEntity>,
    @InjectRepository(ParcelEntity)
    private parcelRepo: Repository<ParcelEntity>,
    @InjectRepository(HubEntity)
    private hubRepo: Repository<HubEntity>,
    @InjectRepository(WalletEntity)
    private walletRepo: Repository<WalletEntity>,
    private stateMachine: ParcelStateMachineService,
  ) {}

  async processPayment(parcelId: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.COLLECTED);

    const wallet = await this.walletRepo.findOne({ where: { user_id: parcel.courier_id ?? '' } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const amount = parcel.base_post_cost;
    const hubShare = Math.round(amount * 0.7);
    const platformFee = amount - hubShare;

    const transaction = this.repo.create({
      parcel_id: parcelId,
      transaction_type: SettlementTransactionType.PAYMENT,
      status: SettlementTransactionStatus.COMPLETED,
      amount,
      balance_after: wallet.balance + amount,
      hub_owner_share: hubShare,
      platform_fee: platformFee,
      completed_at: new Date(),
    });

    wallet.balance += amount;
    parcel.status = ParcelStatus.SETTLEMENT;
    await this.parcelRepo.save(parcel);
    await this.walletRepo.save(wallet);
    return this.repo.save(transaction);
  }

  async processRefund(parcelId: string, reason: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.FAILED_DELIVERY);

    const wallet = await this.walletRepo.findOne({ where: { user_id: parcel.courier_id ?? '' } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const amount = parcel.base_post_cost;

    const transaction = this.repo.create({
      parcel_id: parcelId,
      transaction_type: SettlementTransactionType.REFUND,
      status: SettlementTransactionStatus.COMPLETED,
      amount,
      balance_after: wallet.balance + amount,
      completed_at: new Date(),
    });

    wallet.balance += amount;
    parcel.status = ParcelStatus.SETTLEMENT;
    await this.parcelRepo.save(parcel);
    await this.walletRepo.save(wallet);
    return this.repo.save(transaction);
  }

  async payoutToHubOwner(ownerId: string, parcelId: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');

    const hub = await this.hubRepo.findOne({ where: { owner_id: ownerId } });
    if (!hub) throw new NotFoundException('Hub not found for this owner');

    const wallet = await this.walletRepo.findOne({ where: { user_id: ownerId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const hubShare = Math.round(parcel.base_post_cost * 0.7);

    const transaction = this.repo.create({
      parcel_id: parcelId,
      hub_id: hub.id,
      transaction_type: SettlementTransactionType.HUB_OWNER_PAYOUT,
      status: SettlementTransactionStatus.COMPLETED,
      amount: hubShare,
      balance_after: wallet.balance + hubShare,
      hub_owner_share: hubShare,
      completed_at: new Date(),
    });

    wallet.balance += hubShare;
    await this.walletRepo.save(wallet);
    return this.repo.save(transaction);
  }

  async getByParcel(parcelId: string) {
    return this.repo.find({ where: { parcel_id: parcelId }, order: { created_at: 'DESC' } });
  }
}
