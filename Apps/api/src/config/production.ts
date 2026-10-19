import { isPrismaPersistenceEnabled } from "./persistence";

export function validateProductionConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.NODE_ENV !== "production") return;

  const invalid: string[] = [];
  if (!environment.DATABASE_URL?.trim()) invalid.push("DATABASE_URL");
  if (!isPrismaPersistenceEnabled(environment)) invalid.push("ENABLE_PRISMA=true");
  if (!environment.CORS_ORIGINS?.split(",").some((origin) => origin.trim())) {
    invalid.push("CORS_ORIGINS");
  }
  if (
    environment.TRUST_PROXY !== "true" &&
    environment.TRUST_PROXY !== "false"
  ) {
    invalid.push("TRUST_PROXY=true|false");
  }
  if (environment.ENABLE_SWAGGER === "true")
    invalid.push("ENABLE_SWAGGER must not be true");

  if (invalid.length > 0) {
    throw new Error(`Invalid production configuration: ${invalid.join(", ")}`);
  }
}
