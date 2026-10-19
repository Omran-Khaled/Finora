export enum PersistencyMode {
  MEMORY = "memory",
  PRISMA = "prisma",
}

export function resolvePersistencyMode(
  env: NodeJS.ProcessEnv = process.env,
): PersistencyMode {
  const raw = env.ENABLE_PRISMA;

  if (raw === undefined) return PersistencyMode.MEMORY;

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return PersistencyMode.PRISMA;
  if (normalized === "false" || normalized === "") return PersistencyMode.MEMORY;

  throw new Error(
    `Invalid ENABLE_PRISMA value "${raw}". Expected "true" or "false".`,
  );
}

export function isPrismaPersistenceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolvePersistencyMode(env) === PersistencyMode.PRISMA;
}
