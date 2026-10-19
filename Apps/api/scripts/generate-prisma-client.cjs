/**
 * Prisma Client generation for @finora/api.
 *
 * The canonical schema lives at the workspace root (`prisma/schema.prisma`) so
 * migrations and tooling stay in one place. However the Prisma CLI resolves the
 * `prisma-client-js` output from the *schema directory*: `resolvePkg('@prisma/client')`
 * walks up from `<repo>/prisma` and finds the workspace-root client copy. With
 * pnpm's isolated layout (and the workspace mixing TypeScript peer versions)
 * that copy is NOT the one this app imports at runtime/type-check time:
 * `Apps/api` resolves `@prisma/client` -> `<virtual-store>/node_modules/.prisma/client`.
 *
 * Generating only the workspace-root copy therefore leaves the API with a stale
 * client (no new columns/enums, e.g. `transactions.transfer_direction`), which
 * breaks both `tsc` and real-mode queries.
 *
 * This script keeps both copies current:
 *   1. generates from the canonical schema (previous behaviour), and
 *   2. generates from a schema copy placed inside this app's node_modules so the
 *      CLI resolves — and regenerates — the exact client copy this app consumes.
 */
const { copyFileSync, mkdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const appDir = resolve(__dirname, '..');
const canonicalSchema = resolve(appDir, '..', '..', 'prisma', 'schema.prisma');
const prismaCli = resolve(appDir, 'node_modules', 'prisma', 'build', 'index.js');

function generate(schemaPath) {
  const result = spawnSync(process.execPath, [prismaCli, 'generate', `--schema=${schemaPath}`], {
    cwd: appDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

generate(canonicalSchema);

// git-ignored (node_modules) but inside this app, so the CLI resolves the app's client copy.
const appSchemaDir = resolve(appDir, 'node_modules', '.prisma-schema');
const appSchema = resolve(appSchemaDir, 'schema.prisma');
mkdirSync(appSchemaDir, { recursive: true });
copyFileSync(canonicalSchema, appSchema);
generate(appSchema);
