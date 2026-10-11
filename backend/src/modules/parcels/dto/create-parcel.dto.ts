import { IsString, IsInt, Min, IsOptional, IsNumber, IsIn, IsUUID, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateParcelDto {
  @ApiProperty({ description: 'ID of the recipient invitation that was explicitly accepted' })
  @IsUUID()
  invitation_id: string;

  @ApiProperty({ example: 'BC1234567890', description: 'Barcode printed on the postal label' })
  @IsString()
  barcode: string;

  @ApiProperty({ example: 18000, description: 'Actual postage amount printed/recorded by the postal service; not recalculated by Pudo-N' })
  @IsInt()
  @Min(0)
  postal_postage_amount: number;

  @ApiProperty({ example: 'فرستنده نمونه' })
  @IsString()
  sender_name: string;

  @ApiProperty({ example: '09120000002' })
  @IsString()
  sender_phone: string;

  @ApiPropertyOptional({ description: 'Optional during draft creation; attach a private LABEL_IMAGE reference before hub selection. Public URLs are not accepted.' })
  @IsOptional()
  @IsString()
  @Length(8, 512)
  label_image_ref?: string;

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

  @ApiPropertyOptional({ example: 'hub-001', description: 'Legacy compatibility only; recipient selects the hub after entry-fee verification' })
  @IsOptional()
  @IsString()
  proposed_hub_id?: string;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  weight_kg?: number;

  @ApiPropertyOptional({ example: 'بسته تستی' })
  @IsOptional()
  @IsString()
  description?: string;
}