import { Controller, Get, INestApplication, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createHash, randomUUID } from "node:crypto";
import request = require("supertest");
import { AuthService } from "../src/auth/auth.service";
import { PrismaAuthRepository } from "../src/auth/auth.repository";
import { InMemoryStore } from "../src/core/store";
import { PrismaService } from "../src/database/prisma.service";
import { AuthGuard } from "../src/auth/auth.guard";

class MemoryAuthRepository extends PrismaAuthRepository {
  constructor() {
    const prismaEnabled = process.env.ENABLE_PRISMA;
    delete process.env.ENABLE_PRISMA;
    super(new PrismaService());
    if (prismaEnabled !== undefined) process.env.ENABLE_PRISMA = prismaEnabled;
  }

  override async findUserById() {
    return { id: "user-1", email: "user@example.com", passwordHash: "unused", baseCurrency: "USD" };
  }
}

class RevocableAuthRepository extends MemoryAuthRepository {
  session: { userId: string; expiresAt: Date } | null = {
    userId: "user-1",
    expiresAt: new Date(Date.now() + 60_000),
  };

  override async findSession(): Promise<{ userId: string; expiresAt: Date } | null> {
    return this.session;
  }
}

@Controller("protected-test")
class ProtectedTestController {
  @Get()
  @UseGuards(AuthGuard)
  get() {
    return { data: "ok" };
  }
}

describe("auth hardening", () => {
  afterEach(() => {
    delete process.env.ENABLE_PRISMA;
  });

  it("serializes concurrent in-memory refresh replay to one replacement", async () => {
    const store = new InMemoryStore();
    const repository = new MemoryAuthRepository();
    const service = new AuthService(store, repository);
    const user = {
      id: "user-1",
      email: "user@example.com",
      passwordHash: "unused",
      baseCurrency: "USD",
    };
    store.users.set(user.id, user);
    const original = "original-token";
    store.sessions.set(
      createHash("sha256").update(original).digest("hex"),
      { userId: user.id, expiresAt: Date.now() + 60_000 },
    );

    const results = await Promise.allSettled([
      service.refresh(original),
      service.refresh(original),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(UnauthorizedException);
    expect(store.sessions.size).toBe(1);
  });

  it("does not trust a cached Prisma session after durable revocation", async () => {
    process.env.ENABLE_PRISMA = "true";
    const store = new InMemoryStore();
    const repository = new RevocableAuthRepository();
    const module = await Test.createTestingModule({
      controllers: [ProtectedTestController],
      providers: [
        AuthGuard,
        { provide: InMemoryStore, useValue: store },
        { provide: PrismaAuthRepository, useValue: repository },
      ],
    }).compile();
    const app: INestApplication = module.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get("/protected-test")
      .set("authorization", "Bearer cached-token")
      .expect(200);
    repository.session = null;
    await request(app.getHttpServer())
      .get("/protected-test")
      .set("authorization", "Bearer cached-token")
      .expect(401);

    await app.close();
  });

  const databaseSuite = process.env.DATABASE_URL ? describe : describe.skip;
  databaseSuite("Prisma refresh rotation", () => {
    it("allows exactly one concurrent refresh and creates one replacement", async () => {
      process.env.ENABLE_PRISMA = "true";
      const prisma = new PrismaService();
      const repository = new PrismaAuthRepository(prisma);
      const store = new InMemoryStore();
      const service = new AuthService(store, repository);
      const userId = randomUUID();
      const token = `rotation-${userId}`;
      await prisma.db.user.create({
        data: {
          id: userId,
          email: `${userId}@finora.test`,
          passwordHash: "fixture",
          baseCurrency: "USD",
        },
      });
      await repository.createSession(token, userId, new Date(Date.now() + 60_000));

      const results = await Promise.allSettled([
        service.refresh(token),
        service.refresh(token),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(
        await prisma.db.session.count({ where: { userId, revokedAt: null } }),
      ).toBe(1);

      await prisma.db.session.deleteMany({ where: { userId } });
      await prisma.db.user.delete({ where: { id: userId } });
      await prisma.onModuleDestroy();
    });
  });
});
