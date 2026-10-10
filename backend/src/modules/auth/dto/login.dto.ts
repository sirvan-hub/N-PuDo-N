import { IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,32}$/) username: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
}
