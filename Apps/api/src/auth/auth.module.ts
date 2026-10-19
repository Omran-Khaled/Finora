import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PrismaAuthRepository } from './auth.repository';

@Module({ controllers: [AuthController], providers: [AuthService, AuthGuard, PrismaAuthRepository], exports: [AuthGuard, PrismaAuthRepository] })
export class AuthModule {}
