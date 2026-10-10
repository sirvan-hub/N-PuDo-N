import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { NotificationEntity } from '../../database/entities/notification.entity';

const EXPIRED_CODE_TITLE = 'کد تحویل منقضی شد';
const EXPIRED_CODE_BODY = 'این کد منقضی شده و دیگر قابل استفاده نیست.';
const CLEANUP_INTERVAL_MS = 60_000;

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
  ) {}

  onModuleInit(): void {
    // Scrub immediately, then periodically so expiry cleanup does not depend on a
    // recipient opening their inbox. The update is idempotent and safe across replicas.
    void this.scrubExpiredDeliveryCodes().catch(() => {
      this.logger.error('Initial expired delivery-code notification cleanup failed');
    });
    this.cleanupTimer = setInterval(() => {
      void this.scrubExpiredDeliveryCodes().catch(() => {
        this.logger.error('Scheduled expired delivery-code notification cleanup failed');
      });
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async scrubExpiredDeliveryCodes(now = new Date()): Promise<void> {
    await this.notifications.update(
      { category: 'DELIVERY_CODE', expires_at: LessThanOrEqual(now) },
      { title: EXPIRED_CODE_TITLE, body: EXPIRED_CODE_BODY },
    );
  }

  async createForUser(input: Partial<NotificationEntity>): Promise<NotificationEntity> {
    return this.notifications.save(this.notifications.create(input));
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationEntity[]> {
    const now = new Date();
    await this.scrubExpiredDeliveryCodes(now);
    const rows = await this.notifications.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.filter((row) => !row.expires_at || row.expires_at.getTime() > now.getTime());
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationEntity> {
    const item = await this.notifications.findOne({ where: { id: notificationId, user_id: userId } });
    if (!item) throw new NotFoundException('Notification not found');
    if (!item.read_at) {
      item.read_at = new Date();
      await this.notifications.save(item);
    }
    return item;
  }
}
