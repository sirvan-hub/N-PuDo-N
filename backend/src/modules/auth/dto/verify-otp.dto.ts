import { IsString, Matches } from 'class-validator';
export class VerifyOtpDto {
  @IsString() @Matches(/^09[0-9]{9}$/) phone: string;
  @IsString() @Matches(/^[0-9]{5}$/) otp: string;
}
