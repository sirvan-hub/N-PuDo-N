import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { CourierPayoutRequestsService } from './courier-payout-requests.service';

class CreateCourierPayoutRequestDto {
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(1) @Max(2147483647) amount: number;
}

@ApiTags('Courier payout requests')
@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CourierPayoutRequestsController {
  constructor(private readonly payoutRequests: CourierPayoutRequestsService) {}

  @Post('couriers/me/payout-requests')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Request a courier payout; funds are reserved pending administrator review' })
  request(
    @Body() body: CreateCourierPayoutRequestDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() actor: UserPayload,
  ) {
    return this.payoutRequests.requestPayout(body.amount, key, actor);
  }

  @Get('couriers/me/payout-requests')
  @Roles(UserRole.COURIER)
  @ApiOperation({ summary: 'Read the authenticated courier payout request history' })
  list(@CurrentUser() actor: UserPayload) {
    return this.payoutRequests.listForCourier(actor);
  }
}
