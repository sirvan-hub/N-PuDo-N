import { IsString, IsInt, Min, IsOptional, IsNumber, IsIn, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateParcelDto {
  @ApiProperty({ description: 'ID of the recipient invitation that was explicitly accepted' })
  @IsUUID()
  invitation_id: string;

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

  @ApiProperty({ enum: ['SMALL', 'MEDIUM', 'LARGE'], example: 'MEDIUM', description: 'اندازه بسته؛ مبلغ پایه از نسخه تعرفه فعال در سرور تعیین می‌شود' })
  @IsIn(['SMALL', 'MEDIUM', 'LARGE'])
  package_size: 'SMALL' | 'MEDIUM' | 'LARGE';

  @ApiPropertyOptional({ example: 25000, description: 'برای سازگاری کلاینت قدیمی؛ سرور مقدار ارسالی را نادیده می‌گیرد' })
  @IsOptional()
  @IsInt()
  @Min(0)
  base_post_cost?: number;

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