import { Body, Controller, Get, Headers, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedRequest, AuthGuard } from './auth.guard';
import { LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { AuthService } from './auth.service';
import {
  apiError,
  EmptyResponse,
  SessionResponse,
  UserProfileResponse,
  validationApiError,
} from '../swagger/schemas';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a user with the given email, password and base currency, then returns an active session.\n\n' +
      'The email is normalized (trimmed + lowercased). Rate limited to **10 attempts per minute** per IP.',
    operationId: 'authRegister',
  })
  @ApiCreatedResponse({
    description: 'User registered and signed in. Returns a bearer session token and the user profile.',
    type: SessionResponse,
    example: {
      data: {
        token: '3f1c9a2e-b4d5-4e6f-8a7b-9c0d1e2f3a4b',
        user: { id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', email: 'sarah@example.com', baseCurrency: 'USD' },
      },
    },
  })
  @ApiResponse(validationApiError("email: must be a valid email; password: must be at least 8 characters; baseCurrency: must be 3 characters"))
  @ApiResponse(apiError(409, 'An account with this email already exists.', 'DUPLICATE_REQUEST', 'The provided email is already registered.'))
  @ApiResponse(apiError(429, 'Too many registration attempts from this IP.', 'RATE_LIMITED', 'Too many authentication attempts. Please try again later.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() request: Request) { this.service.enforceRateLimit('register', request.ip ?? 'unknown'); return { data: await this.service.register(dto.email, dto.password, dto.baseCurrency) }; }

  @ApiOperation({
    summary: 'Sign in',
    description:
      'Authenticates an existing user and returns a fresh bearer session token.\n\n' +
      'Rate limited to **10 attempts per minute** per IP.',
    operationId: 'authLogin',
  })
  @ApiOkResponse({
    description: 'Authentication succeeded. Returns a bearer session token and the user profile.',
    type: SessionResponse,
    example: {
      data: {
        token: '3f1c9a2e-b4d5-4e6f-8a7b-9c0d1e2f3a4b',
        user: { id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', email: 'sarah@example.com', baseCurrency: 'USD' },
      },
    },
  })
  @ApiResponse(validationApiError("email: must be a valid email; password: must be a string"))
  @ApiResponse(apiError(401, 'Invalid email or password.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(429, 'Too many login attempts from this IP.', 'RATE_LIMITED', 'Too many authentication attempts. Please try again later.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  // The Swagger contract for login/logout/refresh is `@ApiOkResponse` (200).
  // Nest defaults POST handlers to 201, so pin the documented status explicitly
  // instead of letting the framework drift from the published contract.
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: Request) { this.service.enforceRateLimit('login', request.ip ?? 'unknown'); return { data: await this.service.login(dto.email, dto.password) }; }

  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the current session. Accepts the token either in the `Authorization: Bearer <token>` header or in the `x-session-token` header.\n\n' +
      'Requires an active authenticated session and revokes it; repeated or missing tokens are rejected by the authentication guard.',
    operationId: 'authLogout',
  })
  @ApiBearerAuth()
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer session token (alternative to `x-session-token`).',
    schema: { type: 'string', example: 'Bearer 3f1c9a2e-b4d5-4e6f-8a7b-9c0d1e2f3a4b' },
  })
  @ApiHeader({
    name: 'x-session-token',
    required: false,
    description: 'Raw session token (alternative to the `Authorization` header).',
    schema: { type: 'string', example: '3f1c9a2e-b4d5-4e6f-8a7b-9c0d1e2f3a4b' },
  })
  @ApiOkResponse({ description: 'Session revoked.', type: EmptyResponse, example: { data: {} } })
  @ApiResponse(apiError(401, 'The provided token is invalid or expired.', 'UNAUTHORIZED', 'Authentication required.'))
  @Post('logout')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@Headers('authorization') authorization: string | undefined, @Headers('x-session-token') sessionToken: string | undefined) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : sessionToken;
    await this.service.logout(token);
    return { data: {} };
  }

  @ApiOperation({
    summary: 'Refresh a session',
    description:
      'Verifies the presented token and issues a new, fresh session token in exchange. The old token is revoked.\n\n' +
      'Rate limited to **30 attempts per minute** per IP. The token may be sent in the `Authorization` header or in the `x-session-token` header.',
    operationId: 'authRefresh',
  })
  @ApiBearerAuth()
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer session token (alternative to `x-session-token`).',
    schema: { type: 'string', example: 'Bearer 3f1c9a2e-b4d5-4e6f-8a7b-9c0d1e2f3a4b' },
  })
  @ApiHeader({
    name: 'x-session-token',
    required: false,
    description: 'Raw session token (alternative to the `Authorization` header).',
    schema: { type: 'string', example: '3f1c9a2e-b4d5-4e6f-8a7b-9c0d1e2f3a4b' },
  })
  @ApiOkResponse({
    description: 'New session issued; the previous token is revoked.',
    type: SessionResponse,
    example: {
      data: {
        token: '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
        user: { id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', email: 'sarah@example.com', baseCurrency: 'USD' },
      },
    },
  })
  @ApiResponse(apiError(401, 'The provided token is invalid or expired.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(429, 'Too many refresh attempts from this IP.', 'RATE_LIMITED', 'Too many authentication attempts. Please try again later.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Headers('authorization') authorization: string | undefined, @Headers('x-session-token') sessionToken: string | undefined, @Req() request: Request) {
    this.service.enforceRateLimit('refresh', request.ip ?? 'unknown');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : sessionToken;
    return { data: await this.service.refresh(token) };
  }

  @ApiOperation({
    summary: 'Get the current user',
    description: 'Returns the profile of the authenticated user.',
    operationId: 'authMe',
  })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: 'The authenticated user profile.',
    type: UserProfileResponse,
    example: { data: { id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', email: 'sarah@example.com', baseCurrency: 'USD' } },
  })
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: AuthenticatedRequest) { return { data: await this.service.me(request.userId) }; }

  @ApiOperation({
    summary: 'Update the current user profile',
    description: 'Updates the authenticated user profile fields supported by the API.',
    operationId: 'authUpdateMe',
  })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: 'Updated user profile.',
    type: UserProfileResponse,
    example: { data: { id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', email: 'sarah@example.com', baseCurrency: 'SAR' } },
  })
  @ApiResponse(apiError(400, 'Invalid profile payload.', 'VALIDATION_ERROR', 'Invalid request.'))
  @ApiResponse(apiError(409, 'Base currency cannot change after an account exists.', 'BASE_CURRENCY_LOCKED', 'The base currency is locked once an account exists.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Patch('me')
  @UseGuards(AuthGuard)
  async updateMe(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) { return { data: await this.service.updateProfile(request.userId, dto.baseCurrency) }; }
}
