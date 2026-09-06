import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HubsService } from './hubs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Hubs') @Controller('hubs')
export class HubsController {
  constructor(private readonly hubsService: HubsService) {}

  @Get('nearby')
  async findNearby(@Query('latitude') lat: number, @Query('longitude') lng: number, @Query('radius_km') radius?: number) {
    return this.hubsService.findNearby(lat, lng, radius);
  }

  @Get(':id') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  async getById(@Param('id') id: string) { return this.hubsService.getById(id); }
}
