import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { HubPayoutRequestsService } from './hub-payout-requests.service';

class CreateHubPayoutRequestDto {
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(1) @Max(2147483647) amount: number;
}

class ReviewHubPayoutRequestDto {
  @IsIn(['APPROVE', 'REJECT']) decision: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class RecordPayoutTransferResultDto {
  @IsIn(['COMPLETED', 'FAILED']) outcome: 'COMPLETED' | 'FAILED';
  @IsString() @MinLength(1) @MaxLength(160) transferReference: string;
  @IsOptional() @IsString() @MaxLength(500) failureReason?: string;
}

@ApiTags('Hub payout requests')
@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class HubPayoutRequestsController {
  constructor(private readonly payoutRequests: HubPayoutRequestsService) {}

  @Post('hubs/:hubId/payout-requests')
  @Roles(UserRole.HUB_OWNER)
  @ApiOperation({ summary: 'Request a hub payout; funds are reserved pending admin review' })
  request(
    @Param('hubId') hubId: string,
    @Body() body: CreateHubPayoutRequestDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() actor: UserPayload,
  ) {
    return this.payoutRequests.requestPayout(hubId, body.amount, key, actor);
  }

  @Get('hubs/:hubId/payout-requests')
  @Roles(UserRole.HUB_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Read payout request history for an owned hub or as an administrator' })
  list(@Param('hubId') hubId: string, @CurrentUser() actor: UserPayload) {
    return this.payoutRequests.listForHub(hubId, actor);
  }

  @Post('payout-requests/:requestId/transfer-result')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Record a manually confirmed external payout result; requires an external reference and never calls a bank/provider' })
  recordTransferResult(
    @Param('requestId') requestId: string,
    @Body() body: RecordPayoutTransferResultDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() actor: UserPayload,
  ) {
    return this.payoutRequests.recordTransferResult(
      requestId, body.outcome, body.transferReference, body.failureReason, key, actor,
    );
  }

  @Get('payout-requests')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List pending courier and hub payout requests for administrator review' })
  listQueue(@CurrentUser() actor: UserPayload) {
    return this.payoutRequests.listPendingPayouts(actor);
  }

  @Patch('payout-requests/:requestId/review')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or reject a hub payout request; approval does not execute a transfer' })
  review(
    @Param('requestId') requestId: string,
    @Body() body: ReviewHubPayoutRequestDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() actor: UserPayload,
  ) {
    return this.payoutRequests.reviewPayout(requestId, body.decision, body.note, key, actor);
  }
}
