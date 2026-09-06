import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private otpStore = new Map<string, { otp: string; expiresAt: Date }>();

  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<UserEntity> {
    const exists = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('Phone already registered');
    const user = this.userRepo.create({ phone: dto.phone, full_name: dto.full_name, role: dto.role, national_id: dto.national_id });
    return this.userRepo.save(user);
  }

  async login(dto: LoginDto): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.is_active) throw new UnauthorizedException('Account disabled');
    const otp = Math.floor(10000 + Math.random() * 90000).toString();
    this.otpStore.set(dto.phone, { otp, expiresAt: new Date(Date.now() + 300000) });
    this.logger.log('OTP sent to ' + dto.phone + ': ' + otp);
    return { message: 'OTP sent' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const stored = this.otpStore.get(dto.phone);
    if (!stored) throw new BadRequestException('OTP not found');
    if (stored.expiresAt < new Date()) { this.otpStore.delete(dto.phone); throw new BadRequestException('OTP expired'); }
    if (stored.otp !== dto.otp) throw new UnauthorizedException('Invalid OTP');
    this.otpStore.delete(dto.phone);
    const user = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (!user) throw new UnauthorizedException('User not found');
    user.last_login_at = new Date();
    if (!user.is_verified) { user.is_verified = true; }
    await this.userRepo.save(user);
    const payload = { sub: user.id, phone: user.phone, role: user.role, is_verified: user.is_verified };
    return { access_token: this.jwtService.sign(payload), user: payload };
  }
}
