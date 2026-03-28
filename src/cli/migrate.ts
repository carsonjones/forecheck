/**
 * migrate.ts
 *
 * Runs pending migrations against D1 (remote) or a local SQLite file.
 * Tracks applied migrations in a schema_migrations table.
 *
 * Usage:
 *   bun run src/cli/migrate.ts               # remote D1 (needs CF env vars)
 *   bun run src/cli/migrate.ts --local       # local forecheck-dev.db
 *   bun run src/cli/migrate.ts --status      # show applied/pending without running
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { cloudD1FromEnv } from '../db/cloudD1.js';
import { createLocalD1 } from '../db/localD1.js';

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const statusOnly = args.includes('--status');

const db = isLocal
  ? createLocalD1('./forecheck-dev.db')
  : cloudD1FromEnv();

if (!db) {
  console.error('No DB: pass --local or set CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID');
  process.exit(1);
}

const migrationsDir = join(import.meta.dir, '../db/migrations');

// ensure tracking table exists
await db.prepare(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`).run();

// load applied
const { results: applied } = await db
  .prepare('SELECT version FROM schema_migrations ORDER BY version')
  .all<{ version: string }>();
const appliedSet = new Set(applied.map((r) => r.version));

// load available migration files
const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith('.sql'))
  .sort();

const pending = files.filter((f) => !appliedSet.has(f));

if (statusOnly) {
  console.log('Applied:');
  for (const v of appliedSet) console.log(`  ✓ ${v}`);
  console.log('Pending:');
  for (const f of pending) console.log(`  · ${f}`);
  process.exit(0);
}

if (pending.length === 0) {
  console.log('No pending migrations.');
  process.exit(0);
}

for (const file of pending) {
  const sql = await readFile(join(migrationsDir, file), 'utf8');
  console.log(`running ${file}...`);

  // D1 exec runs the full SQL (multiple statements)
  await db.exec(sql);
  await db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').bind(file).run();
  console.log(`  ✓ ${file}`);
}

console.log(`\n${pending.length} migration(s) applied.`);
