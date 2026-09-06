import { IsString, IsEnum, IsOptional, Matches, MaxLength } from 'class-validator';
import { UserRole } from '../../../common/interfaces/user-payload.interface';

export class RegisterDto {
  @IsString() @Matches(/^09[0-9]{9}$/) phone: string;
  @IsOptional() @IsString() @MaxLength(100) full_name?: string;
  @IsEnum(UserRole) role: UserRole;
  @IsOptional() @IsString() @Matches(/^[0-9]{10}$/) national_id?: string;
}
