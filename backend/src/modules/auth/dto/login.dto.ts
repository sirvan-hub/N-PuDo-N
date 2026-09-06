import { IsString, Matches } from 'class-validator';
export class LoginDto {
  @IsString() @Matches(/^09[0-9]{9}$/) phone: string;
}
