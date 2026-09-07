import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { ParcelsService } from './parcels.service';
import { CreateParcelDto } from './dto/create-parcel.dto';

@ApiTags('Parcels')
@Controller('parcels')  // ← مسیر: /v1/parcels (چون global prefix = 'v1')
export class ParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @Post()  // ← POST /v1/parcels
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new parcel' })
  @ApiBody({ type: CreateParcelDto })
  @ApiResponse({ status: 201, description: 'Parcel created' })
  async create(@Body() dto: CreateParcelDto) {
    return this.parcelsService.create(dto, 'test-courier-id');
  }

  @Get(':id')  // ← GET /v1/parcels/:id
  @ApiOperation({ summary: 'Get parcel by ID' })
  @ApiResponse({ status: 200, description: 'Parcel data' })
  async getById(@Param('id') id: string) {
    return this.parcelsService.getById(id);
  }
}