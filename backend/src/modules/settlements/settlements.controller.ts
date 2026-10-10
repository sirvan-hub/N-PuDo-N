import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { SettlementsService } from './settlements.service';

class ConfirmInvoicePaymentDto {
  @IsString() @MinLength(1) @MaxLength(160) providerReference: string;
}

@ApiTags('Settlements')
@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post('invoices/:invoiceId/confirm-payment')
  @ApiOperation({ summary: 'Reconcile a payment that has already been verified with the payment provider' })
  async confirmInvoicePayment(
    @Param('invoiceId') invoiceId: string,
    @Body() body: ConfirmInvoicePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() actor: UserPayload,
  ) {
    return this.settlementsService.recordVerifiedInvoicePayment(
      invoiceId, body.providerReference, idempotencyKey, actor,
    );
  }
}
