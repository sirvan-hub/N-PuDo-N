import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/interfaces/user-payload.interface';

@ApiTags('Users') @Controller('users') @UseGuards(JwtAuthGuard, RolesGuard) @ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('pending') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getPending() { return this.usersService.getPending(); }

  @Post(':id/verify') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async verify(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.usersService.verifyUser(id, adminId);
  }
}
