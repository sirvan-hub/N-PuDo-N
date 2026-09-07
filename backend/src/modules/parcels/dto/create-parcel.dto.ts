import { IsString, IsInt, Min, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateParcelDto {
  @ApiProperty({ example: 'IR1405000001' })
  @IsString()
  tracking_code: string;

  @ApiProperty({ example: '09120000001' })
  @IsString()
  recipient_phone: string;

  @ApiProperty({ example: 'علی محمدی' })
  @IsString()
  recipient_name: string;

  @ApiProperty({ example: 'تهران، خیابان ولیعصر، پلاک ۱۲۳' })
  @IsString()
  recipient_address: string;

  @ApiProperty({ example: 50000, description: 'هزینه پایه پست به ریال' })
  @IsInt()
  @Min(0)
  base_post_cost: number;

  @ApiProperty({ example: 'hub-001' })
  @IsString()
  proposed_hub_id: string;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  weight_kg?: number;

  @ApiPropertyOptional({ example: 'بسته تستی' })
  @IsOptional()
  @IsString()
  description?: string;
}