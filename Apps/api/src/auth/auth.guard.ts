import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { createHash } from "node:crypto";
import { InMemoryStore } from "../core/store";
import { PrismaAuthRepository } from "./auth.repository";
import { PersistencyMode, resolvePersistencyMode } from "../config/persistence";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly store: InMemoryStore,
    private readonly persistent: PrismaAuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header("authorization");
    const token = header?.startsWith("Bearer ")
      ? header.slice(7)
      : request.header("x-session-token");
    const session = token ? this.store.sessions.get(this.hash(token)) : undefined;
    const mode = resolvePersistencyMode();
    const prismaEnabled = mode === PersistencyMode.PRISMA;
    const persistentSession = prismaEnabled && token
      ? await this.persistent.findSession(token)
      : null;
    const userId =
      prismaEnabled
        ? persistentSession &&
            persistentSession.expiresAt.getTime() > Date.now()
          ? persistentSession.userId
          : undefined
        : session && session.expiresAt > Date.now()
          ? session.userId
          : undefined;
    if (session && !userId && token)
      this.store.sessions.delete(this.hash(token));
    if (!userId)
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    if (prismaEnabled && token && userId)
      this.store.sessions.set(this.hash(token), {
        userId,
        expiresAt: persistentSession?.expiresAt.getTime() ?? Date.now(),
      });
    request.userId = userId;
    return true;
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
