import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InMemoryStore, UserRecord } from "../core/store";
import { hashPassword, verifyPassword } from "./password";
import { createHash } from "node:crypto";
import { PrismaAuthRepository } from "./auth.repository";
import { isSupportedCurrency } from "@finora/contracts";
import { isPrismaPersistenceEnabled } from "../config/persistence";

@Injectable()
export class AuthService {
  /**
   * Per-process rate-limit window. Bounded on purpose: entries are swept once the
   * map grows past MAX_TRACKED_SUBJECTS so an attacker cannot exhaust memory by
   * rotating emails/IPs. Multi-instance deployments need a shared store (Redis)
   * — explicitly out of scope here (no Redis/queues are added).
   */
  private readonly attempts = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private static readonly MAX_TRACKED_SUBJECTS = 10_000;
  private static readonly WINDOW_MS = 60_000;

  constructor(
    private readonly store: InMemoryStore,
    private readonly persistent: PrismaAuthRepository,
  ) {}

  async register(email: string, password: string, baseCurrency: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCurrency = baseCurrency.trim().toUpperCase();
    if (!isSupportedCurrency(normalizedCurrency))
      throw new HttpException(
        { code: "INVALID_CURRENCY" },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (
      this.store.usersByEmail.has(normalizedEmail) ||
      (await this.persistentUserExists(normalizedEmail))
    ) {
      throw new ConflictException({
        code: "DUPLICATE_REQUEST",
        message: "An account with this email already exists.",
      });
    }
    const user: UserRecord = {
      id: this.store.id(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      baseCurrency: normalizedCurrency,
    };
    if (this.persistenceEnabled()) await this.persistent.createUser(user);
    this.store.users.set(user.id, user);
    this.store.usersByEmail.set(user.email, user);
    return await this.issueSession(user);
  }

  enforceRateLimit(
    action: "register" | "login" | "refresh",
    subject: string,
  ): void {
    const now = Date.now();
    const key = `${action}:${subject}`;
    const current = this.attempts.get(key);
    const windowMs = AuthService.WINDOW_MS;
    const limit = action === "refresh" ? 30 : 10;
    this.sweepExpired(now);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      // 429 (not 403): clients map 403 to "no permission", which is misleading for
      // throttling. The envelope/code stays in the documented error contract.
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Too many authentication attempts. Please try again later.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  /** Drops expired windows, then the oldest entries, keeping the map bounded. */
  private sweepExpired(now: number): void {
    if (this.attempts.size < AuthService.MAX_TRACKED_SUBJECTS) return;
    for (const [key, window] of this.attempts) {
      if (window.resetAt <= now) this.attempts.delete(key);
    }
    while (this.attempts.size >= AuthService.MAX_TRACKED_SUBJECTS) {
      const oldest = this.attempts.keys().next().value;
      if (oldest === undefined) break;
      this.attempts.delete(oldest);
    }
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.persistenceEnabled()
      ? await this.persistent.findUserByEmail(normalizedEmail)
      : (this.store.usersByEmail.get(normalizedEmail) ?? null);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Invalid email or password.",
      });
    }
    this.store.users.set(user.id, user);
    this.store.usersByEmail.set(user.email, user);
    return await this.issueSession(user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) {
      this.store.sessions.delete(this.hash(token));
      if (this.persistenceEnabled()) await this.persistent.revokeSession(token);
    }
  }

  async refresh(token: string | undefined) {
    if (!token) throw new UnauthorizedException({ code: "UNAUTHORIZED" });

    if (this.persistenceEnabled()) {
      const newToken = this.store.id();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      const rotated = await this.persistent.rotateSessionAndCreate(
        token,
        newToken,
        expiresAt,
      );
      if (!rotated || rotated.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException({ code: "UNAUTHORIZED" });
      }
      const user =
        this.store.users.get(rotated.userId) ??
        (await this.persistent.findUserById(rotated.userId));
      if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
      this.store.sessions.delete(this.hash(token));
      this.store.users.set(user.id, user);
      this.store.usersByEmail.set(user.email, user);
      this.store.sessions.set(this.hash(newToken), {
        userId: user.id,
        expiresAt: expiresAt.getTime(),
      });
      return {
        token: newToken,
        user: {
          id: user.id,
          email: user.email,
          baseCurrency: user.baseCurrency,
        },
      };
    }

    const session = this.store.sessions.get(this.hash(token));
    if (!session || session.expiresAt <= Date.now())
      throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    this.store.sessions.delete(this.hash(token));
    const user = this.store.users.get(session.userId);
    if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    return await this.issueSession(user);
  }

  async me(
    userId: string,
  ): Promise<{ id: string; email: string; baseCurrency: string }> {
    const user = this.persistenceEnabled()
      ? await this.persistent.findUserById(userId)
      : (this.store.users.get(userId) ?? null);
    if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    this.store.users.set(user.id, user);
    this.store.usersByEmail.set(user.email, user);
    return { id: user.id, email: user.email, baseCurrency: user.baseCurrency };
  }

  async updateProfile(userId: string, baseCurrency: string) {
    const normalized = baseCurrency.trim().toUpperCase();
    if (!isSupportedCurrency(normalized))
      throw new HttpException(
        { code: "INVALID_CURRENCY" },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const user =
      this.store.users.get(userId) ??
      (this.persistenceEnabled()
        ? await this.persistent.findUserById(userId)
        : null);
    if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    const hasAccounts = this.persistenceEnabled()
      ? await this.persistent.hasAccounts(userId)
      : [...this.store.accounts.values()].some(
          (account) => account.userId === userId,
        );
    if (hasAccounts && normalized !== user.baseCurrency.toUpperCase())
      throw new ConflictException({ code: "BASE_CURRENCY_LOCKED" });

    const updated = this.persistenceEnabled()
      ? await this.persistent.updateBaseCurrency(userId, normalized)
      : { ...user, baseCurrency: normalized };

    if (!updated) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    this.store.users.set(updated.id, updated);
    this.store.usersByEmail.set(updated.email, updated);
    return {
      id: updated.id,
      email: updated.email,
      baseCurrency: updated.baseCurrency,
    };
  }

  private async issueSession(user: UserRecord) {
    const token = this.store.id();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    if (this.persistenceEnabled())
      await this.persistent.createSession(token, user.id, expiresAt);
    this.store.sessions.set(this.hash(token), {
      userId: user.id,
      expiresAt: expiresAt.getTime(),
    });
    return {
      token,
      user: { id: user.id, email: user.email, baseCurrency: user.baseCurrency },
    };
  }

  private persistenceEnabled(): boolean {
    return isPrismaPersistenceEnabled();
  }

  private async persistentUserExists(email: string): Promise<boolean> {
    return (
      this.persistenceEnabled() &&
      (await this.persistent.findUserByEmail(email)) !== null
    );
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
