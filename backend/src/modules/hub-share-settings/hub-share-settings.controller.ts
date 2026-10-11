import { Body, Controller, Get, Query, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { HubShareSettingsService } from './hub-share-settings.service';

class UpdateHubSharePercentageDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) percentage: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@ApiTags('Hub share settings')
@Controller('admin/hub-share')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class HubShareSettingsController {
  constructor(private readonly settings: HubShareSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Read the current hub share percentage (default 30%)' })
  getCurrent() {
    return this.settings.getCurrent();
  }

  @Get('history')
  @ApiOperation({ summary: 'Read the audit history of hub share percentage changes' })
  getHistory(@Query('limit') limit?: string) {
    return this.settings.getHistory(limit === undefined ? 50 : Number(limit));
  }

  @Put()
  @ApiOperation({ summary: 'Update the configurable hub share percentage' })
  update(@Body() body: UpdateHubSharePercentageDto, @CurrentUser() actor: UserPayload) {
    return this.settings.updatePercentage(body.percentage, body.reason, actor);
  }
}
