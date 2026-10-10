import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/interfaces/user-payload.interface';
import { EvidenceCategory, EvidenceStorageService, MAX_EVIDENCE_BYTES } from './evidence-storage.service';

class UploadEvidenceDto {
  @IsEnum(EvidenceCategory)
  category: EvidenceCategory;
}

@ApiTags('Private parcel evidence')
@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class EvidenceStorageController {
  constructor(private readonly storage: EvidenceStorageService) {}

  @Post('parcels/:parcelId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 },
    fileFilter: (_request, file, callback) => {
      const accepted = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
      callback(accepted ? null : new BadRequestException('Only JPEG, PNG, and WebP images are accepted'), accepted);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload private evidence for a parcel step; returns an opaque reference, never a public URL' })
  async upload(
    @Param('parcelId') parcelId: string,
    @Body() body: UploadEvidenceDto,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @CurrentUser() user: UserPayload,
  ) {
    if (!file) throw new BadRequestException('An image file is required');
    return this.storage.upload(parcelId, body?.category, file, user);
  }

  @Get('parcels/:parcelId/signed-url')
  @ApiOperation({ summary: 'Create a short-lived signed URL for evidence attached to a parcel the caller may access' })
  async signedUrl(
    @Param('parcelId') parcelId: string,
    @Query('ref') evidenceRef: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.storage.createSignedUrl(parcelId, evidenceRef, user);
  }
}
