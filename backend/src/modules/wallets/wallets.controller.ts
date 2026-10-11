import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { WalletsService } from './wallets.service';

@ApiTags('Wallets')
@Controller('wallets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RECIPIENT, UserRole.COURIER, UserRole.HUB_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Read the authenticated user wallet summary' })
  async getMine(@CurrentUser() user: UserPayload) {
    return this.walletsService.getOwnWallet(user.sub);
  }

  @Get('me/transactions')
  @ApiOperation({ summary: 'Read the authenticated user wallet ledger with bounded pagination' })
  async getMyTransactions(
    @CurrentUser() user: UserPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.walletsService.getOwnTransactions(
      user.sub,
      limit === undefined ? 50 : Number(limit),
      offset === undefined ? 0 : Number(offset),
    );
  }
}
