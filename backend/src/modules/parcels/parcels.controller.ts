import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, IsBoolean, Length } from 'class-validator';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ParcelsService } from './parcels.service';
import { CreateParcelDto } from './dto/create-parcel.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';

class CreateParcelInvitationDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/)
  recipient_phone: string;
}

class RespondParcelInvitationDto {
  @IsBoolean()
  accepted: boolean;
}

class CustodyEvidenceDto {
  @IsString()
  @Length(8, 512)
  @Matches(/^(?!https?:\\/\\/)(?!.*\\.\\.).+$/i)
  evidence_ref: string;
}

class ConfirmCustomerReleaseDto {
  @IsString()
  @Matches(/^\d{4,6}$/)
  deliveryCode: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/)
  nationalId?: string;
}

@ApiTags('Parcels')
@Controller('parcels')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @Post('invitations')
  @Roles(UserRole.COURIER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a registered recipient to use Pudo-N before parcel registration' })
  async createInvitation(@Body() body: CreateParcelInvitationDto, @CurrentUser() user: UserPayload) {
    return this.parcelsService.createInvitation(body.recipient_phone, user);
  }

  @Post('invitations/:id/respond')
  @Roles(UserRole.RECIPIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recipient accepts or rejects a Pudo-N invitation' })
  async respondToInvitation(@Param('id') id: string, @Body() body: RespondParcelInvitationDto, @CurrentUser() user: UserPayload) {
    return this.parcelsService.respondToInvitation(id, body.accepted, user);
  }

  @Post()
  @Roles(UserRole.COURIER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new parcel' })
  @ApiBody({ type: CreateParcelDto })
  @ApiResponse({ status: 201, description: 'Parcel created' })
  async create(@Body() dto: CreateParcelDto, @CurrentUser('sub') courierId: string) {
    return this.parcelsService.create(dto, courierId);
  }

  @Post(':id/request-pudo')
  @Roles(UserRole.RECIPIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recipient requests PUDO and selects an accepting hub' })
  @ApiResponse({ status: 200, description: 'PUDO request accepted and hub selected' })
  async requestPudo(@Param('id') id: string, @Body('hub_id') hubId: string, @CurrentUser() user: UserPayload) {
    return this.parcelsService.requestPudo(id, hubId, user);
  }

  @Post(':id/request-collection')
  @Roles(UserRole.RECIPIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recipient requests collection; issue storage invoice using elapsed hub custody time' })
  @ApiResponse({ status: 200, description: 'Invoice issued or existing invoice returned; parcel is not physically released' })
  async requestCustomerCollection(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.parcelsService.requestCustomerCollection(id, user);
  }

  @Post(':id/confirm-courier-handover')
  @Roles(UserRole.COURIER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit courier handover photo evidence; custody waits for the hub owner confirmation' })
  async confirmCourierHandover(@Param('id') id: string, @Body() body: CustodyEvidenceDto, @CurrentUser() user: UserPayload) {
    return this.parcelsService.confirmCourierHandover(id, body.evidence_ref, user);
  }

  @Post(':id/confirm-hub-receipt')
  @Roles(UserRole.HUB_OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit hub receipt photo evidence; custody is finalized only after courier and hub confirmations' })
  @ApiResponse({ status: 200, description: 'Evidence recorded; custody is confirmed only after both parties submit evidence' })
  async confirmHubReceipt(@Param('id') id: string, @Body() body: CustodyEvidenceDto, @CurrentUser() user: UserPayload) {
    return this.parcelsService.confirmHubReceipt(id, user, body.evidence_ref);
  }

  @Post(':id/request-delivery-code')
  @Roles(UserRole.RECIPIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Place a short-lived delivery code in the registered recipient’s in-app notification inbox' })
  async requestDeliveryCode(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.parcelsService.requestDeliveryCode(id, user);
  }

  @Post(':id/confirm-customer-release')
  @Roles(UserRole.HUB_OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release a ready parcel only after payment and one-time delivery-code verification' })
  @ApiResponse({ status: 200, description: 'Parcel marked collected after code verification and audit logging' })
  async confirmCustomerRelease(
    @Param('id') id: string,
    @Body() body: ConfirmCustomerReleaseDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.parcelsService.confirmCustomerRelease(id, user, body.deliveryCode, body.nationalId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get parcel by ID (owner, recipient, or administrator)' })
  @ApiResponse({ status: 200, description: 'Parcel data' })
  async getById(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.parcelsService.getById(id, user);
  }
}
