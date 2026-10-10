import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { NotificationEntity } from '../../database/entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
  ) {}

  async createForUser(input: Partial<NotificationEntity>): Promise<NotificationEntity> {
    return this.notifications.save(this.notifications.create(input));
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationEntity[]> {
    const now = new Date();
    return this.notifications.find({
      where: [
        { user_id: userId, expires_at: IsNull() },
        { user_id: userId, expires_at: LessThan(new Date(now.getTime() + 1)) },
      ],
      order: { created_at: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    }).then((rows) => rows.filter((row) => !row.expires_at || row.expires_at.getTime() > now.getTime()));
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
