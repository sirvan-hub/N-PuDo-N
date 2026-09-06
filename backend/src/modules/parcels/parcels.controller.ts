import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ParcelsService } from './parcels.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/interfaces/user-payload.interface';

@ApiTags('Parcels') @Controller('parcels') @UseGuards(JwtAuthGuard, RolesGuard) @ApiBearerAuth()
export class ParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @Post() @Roles(UserRole.COURIER) @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: any, @CurrentUser('sub') courierId: string) {
    return this.parcelsService.create(dto, courierId);
  }

  @Get(':id')
  async getById(@Param('id') id: string) { return this.parcelsService.getById(id); }

  @Post(':id/approve') @Roles(UserRole.RECIPIENT)
  async approve(@Param('id') id: string, @Body() body: any, @CurrentUser('sub') recipientId: string) {
    return this.parcelsService.approve(id, recipientId, body.accepted);
  }

  @Post(':id/deliver-to-hub') @Roles(UserRole.COURIER, UserRole.HUB_OWNER)
  async deliverToHub(@Param('id') id: string, @Body() body: any) {
    return this.parcelsService.deliverToHub(id, body.hub_qr_code, body.courier_location?.latitude, body.courier_location?.longitude);
  }

  @Post(':id/pickup') @Roles(UserRole.HUB_OWNER)
  async pickup(@Param('id') id: string, @Body() body: any, @CurrentUser('sub') hubOwnerId: string) {
    return this.parcelsService.pickup(id, hubOwnerId, body.recipient_otp);
  }
}
