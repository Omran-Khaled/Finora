import { PrismaService } from "../src/database/prisma.service";

type ReadinessClient = {
  $connect: () => Promise<void>;
  $queryRaw: unknown;
  user: {
    findFirst: (args: { select: { id: boolean } }) => Promise<unknown>;
  };
};

function serviceWithClient(client: ReadinessClient): PrismaService {
  const service = Object.create(PrismaService.prototype) as PrismaService;
  Object.defineProperty(service, "client", { value: client });
  return service;
}

describe("Prisma startup readiness", () => {
  it("connects, probes PostgreSQL, and initializes a generated model query", async () => {
    const client: ReadinessClient = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await serviceWithClient(client).assertReady();

    expect(client.$connect).toHaveBeenCalledTimes(1);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.user.findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it("fails with a generic error when the database or schema is not ready", async () => {
    const client: ReadinessClient = {
      $connect: jest.fn().mockRejectedValue(new Error("postgresql://secret@db")),
      $queryRaw: jest.fn(),
      user: {
        findFirst: jest.fn(),
      },
    };

    await expect(serviceWithClient(client).assertReady()).rejects.toThrow(
      "Production database readiness check failed.",
    );
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it("fails closed when the generated schema query is rejected", async () => {
    const client: ReadinessClient = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
      user: {
        findFirst: jest.fn().mockRejectedValue(new Error("schema details")),
      },
    };

    await expect(serviceWithClient(client).assertReady()).rejects.toThrow(
      "Production database readiness check failed.",
    );
  });
});
