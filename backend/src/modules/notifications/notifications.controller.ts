import { Controller, Get, Param, Post, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user, including in-app delivery codes' })
  async list(@CurrentUser('sub') userId: string, @Query('limit') limit?: string) {
    return this.notifications.listForUser(userId, Number(limit) || 50);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one of the authenticated user’s notifications as read' })
  async markRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.notifications.markRead(userId, id);
  }
}
