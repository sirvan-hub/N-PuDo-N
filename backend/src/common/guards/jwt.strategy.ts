import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { requireJwtSecret } from '../../config/runtime-config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(configService.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: any) {
    return {
      sub: payload.sub,
      phone: payload.phone,
      role: payload.role,
      is_verified: payload.is_verified,
    };
  }
}
