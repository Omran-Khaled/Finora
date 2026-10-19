import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CATEGORY_STATUSES,
  CATEGORY_TYPES,
  GOAL_STATUSES,
  ERROR_CODES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  TRANSFER_DIRECTIONS,
} from '@finora/contracts';

// M-002 — canonical contracts drift guard.
// `packages/contracts` is the shared source of truth for Web/Mobile/API. These
// assertions fail as soon as the API's persisted enums (prisma/schema.prisma) or
// the error codes the API actually throws drift away from that package.
const repoRoot = resolve(__dirname, '..', '..', '..');
const schema = readFileSync(join(repoRoot, 'prisma', 'schema.prisma'), 'utf8');

function prismaEnum(name: string): string[] | null {
  const match = schema.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`));
  if (!match) return null;
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('contracts drift (M-002)', () => {
  it.each([
    ['AccountType', ACCOUNT_TYPES],
    ['AccountStatus', ACCOUNT_STATUSES],
    ['TransactionType', TRANSACTION_TYPES],
    ['TransactionStatus', TRANSACTION_STATUSES],
    ['CategoryStatus', CATEGORY_STATUSES],
    ['CategoryType', CATEGORY_TYPES],
    ['GoalStatus', GOAL_STATUSES],
    ['TransferDirection', TRANSFER_DIRECTIONS],
  ])('contracts enum matches the persisted Prisma enum %s', (name, contractValues) => {
    expect(prismaEnum(name as string)).toEqual([...(contractValues as readonly string[])]);
  });

  it('declares the canonical CategoryType contract (INCOME | EXPENSE)', () => {
    expect([...CATEGORY_TYPES]).toEqual(['INCOME', 'EXPENSE']);
  });

  it('every error code thrown by the API exists in the contracts ERROR_CODES', () => {
    const files = sourceFiles(join(__dirname, '..', 'src'));
    const thrown = new Set<string>();
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const match of contents.matchAll(/code:\s*[\"']([A-Z_]+)[\"']/g)) thrown.add(match[1]);
    }

    expect(thrown.size).toBeGreaterThan(0);
    expect([...thrown].filter((code) => !(ERROR_CODES as readonly string[]).includes(code))).toEqual([]);
  });
});
