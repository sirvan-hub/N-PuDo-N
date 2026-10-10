import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { PayoutFrequency } from '../../database/entities/payout-preference.entity';
import { PayoutPreferencesService } from './payout-preferences.service';

class UpdatePayoutPreferenceDto {
  @IsOptional() @IsIn([PayoutFrequency.WEEKLY, PayoutFrequency.MONTHLY]) frequency?: PayoutFrequency;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(160) destinationToken?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(4) destinationLast4?: string;
}

class VerifyPayoutDestinationDto {
  @IsString() @MinLength(1) @MaxLength(160) verificationReference: string;
}

@ApiTags('Payout preferences')
@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PayoutPreferencesController {
  constructor(private readonly preferences: PayoutPreferencesService) {}

  @Get('me/payout-preference')
  @Roles(UserRole.COURIER, UserRole.HUB_OWNER)
  @ApiOperation({ summary: 'Read the authenticated courier/hub payout cadence and masked destination status' })
  getMine(@CurrentUser() actor: UserPayload) {
    return this.preferences.getMine(actor);
  }

  @Patch('me/payout-preference')
  @Roles(UserRole.COURIER, UserRole.HUB_OWNER)
  @ApiOperation({ summary: 'Set weekly/monthly payout preference and an opaque destination token/reference' })
  updateMine(@Body() body: UpdatePayoutPreferenceDto, @CurrentUser() actor: UserPayload) {
    return this.preferences.updateMine(body, actor);
  }

  @Post('payout-profiles/:userId/verify-destination')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Record an administrator attestation after an out-of-band payout-destination check' })
  verifyDestination(
    @Param('userId') userId: string,
    @Body() body: VerifyPayoutDestinationDto,
    @CurrentUser() actor: UserPayload,
  ) {
    return this.preferences.verifyDestination(userId, body.verificationReference, actor);
  }
}
