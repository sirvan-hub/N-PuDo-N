import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Pricing') @Controller('pricing') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('calculate')
  async calculate(@Body() body: any) {
    return this.pricingService.calculate({ base_post_cost: body.base_post_cost, delivered_to_hub_at: body.delivered_to_hub_at });
  }
}
