import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService, JWT_TTL_SECONDS } from './auth.service';
import { AuthSupabaseService } from './auth-supabase.service';
import { AuthController } from './auth.controller';
import { LoginRateLimiter } from './login-rate-limiter';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { EfetivoModule } from '../efetivo/efetivo.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: JWT_TTL_SECONDS },
      }),
    }),
    EfetivoModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSupabaseService,
    LoginRateLimiter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
