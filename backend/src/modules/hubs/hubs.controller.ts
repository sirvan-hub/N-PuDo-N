import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { HubsService } from './hubs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/interfaces/user-payload.interface';

@ApiTags('Hubs')
@Controller('hubs')
export class HubsController {
  constructor(private readonly hubsService: HubsService) {}

  @Post()
  @Roles(UserRole.HUB_OWNER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new hub' })
  async create(
    @Body() dto: any,
    @CurrentUser('sub') ownerId: string,
  ) {
    return this.hubsService.create(dto, ownerId);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Find nearby hubs' })
  async findNearby(
    @Query('latitude') lat: number,
    @Query('longitude') lng: number,
    @Query('radius_km') radius?: number,
  ) {
    return this.hubsService.findNearby(lat, lng, radius);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get hub by ID' })
  async getById(@Param('id') id: string) {
    return this.hubsService.getById(id);
  }
}