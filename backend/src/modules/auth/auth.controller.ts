import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register') @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Register' })
  async register(@Body() dto: RegisterDto) { return this.authService.register(dto); }

  @Post('login') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Login' })
  async login(@Body() dto: LoginDto) { return this.authService.login(dto); }

  @Post('verify-otp') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Verify OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto) { return this.authService.verifyOtp(dto); }
}
