import { validateProductionConfiguration } from "../src/config/production";

describe("production configuration", () => {
  it("rejects a production process that would fall back to memory mode", () => {
    expect(() =>
      validateProductionConfiguration({
        NODE_ENV: "production",
        CORS_ORIGINS: "https://app.example.com",
        TRUST_PROXY: "false",
      }),
    ).toThrow(/DATABASE_URL.*ENABLE_PRISMA/);
  });

  it("rejects Swagger and an implicit proxy policy in production", () => {
    expect(() =>
      validateProductionConfiguration({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://redacted.example/finora",
        ENABLE_PRISMA: "true",
        CORS_ORIGINS: "https://app.example.com",
        ENABLE_SWAGGER: "true",
      }),
    ).toThrow(/TRUST_PROXY.*ENABLE_SWAGGER/);
  });

  it("accepts an explicitly configured production process", () => {
    expect(() =>
      validateProductionConfiguration({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://redacted.example/finora",
        ENABLE_PRISMA: "true",
        CORS_ORIGINS: "https://app.example.com",
        TRUST_PROXY: "false",
        ENABLE_SWAGGER: "false",
      }),
    ).not.toThrow();
  });
});
