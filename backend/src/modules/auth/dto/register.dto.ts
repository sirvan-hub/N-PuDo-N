import { IsString, IsEnum, IsOptional, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../common/interfaces/user-payload.interface';

export class RegisterDto {
  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,32}$/) username: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
  @IsString() @Matches(/^09[0-9]{9}$/) phone: string;
  @IsOptional() @IsString() @MaxLength(100) full_name?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() @Matches(/^[0-9]{10}$/) national_id?: string;
}
