import { Injectable, UnauthorizedException, ConflictException, BadRequestException, GoneException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { UserRole } from '../../common/interfaces/user-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  private readonly maxFailedAttempts = 5;
  private readonly lockDurationMs = 15 * 60 * 1000;

  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const role = dto.role ?? UserRole.RECIPIENT;
    if (role !== UserRole.RECIPIENT) {
      throw new BadRequestException('Only recipient accounts can be created through public registration');
    }

    const exists = await this.userRepo.findOne({
      where: [{ phone: dto.phone }, { username: dto.username }],
    });
    if (exists) throw new ConflictException('Username or phone already registered');

    const user = this.userRepo.create({
      username: dto.username,
      password_hash: await bcrypt.hash(dto.password, 12),
      phone: dto.phone,
      full_name: dto.full_name,
      role: UserRole.RECIPIENT,
      national_id: dto.national_id,
    });
    const saved = await this.userRepo.save(user);
    return {
      id: saved.id,
      username: saved.username,
      phone: saved.phone,
      full_name: saved.full_name,
      role: saved.role,
      is_verified: saved.is_verified,
      created_at: saved.created_at,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.username = :username', { username: dto.username })
      .getOne();

    if (!user || !user.password_hash || !user.is_active) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const now = new Date();
    if (user.locked_until && user.locked_until > now) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const validPassword = await bcrypt.compare(dto.password, user.password_hash);
    if (!validPassword) {
      user.failed_login_attempts = (user.failed_login_attempts ?? 0) + 1;
      if (user.failed_login_attempts >= this.maxFailedAttempts) {
        user.locked_until = new Date(Date.now() + this.lockDurationMs);
        user.failed_login_attempts = 0;
      }
      await this.userRepo.save(user);
      throw new UnauthorizedException('Invalid username or password');
    }

    user.failed_login_attempts = 0;
    user.locked_until = null;
    user.last_login_at = now;
    await this.userRepo.save(user);

    const payload = {
      sub: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role,
      is_verified: user.is_verified,
    };
    return { access_token: this.jwtService.sign(payload), user: payload };
  }

  async verifyOtp(_dto: VerifyOtpDto): Promise<never> {
    throw new GoneException('OTP login is temporarily disabled. Use username and password.');
  }
}
