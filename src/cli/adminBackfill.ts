/**
 * adminBackfill.ts
 *
 * Fetches game IDs for a season and POSTs each to the worker's admin backfill
 * route, which runs ingestGame + ingestHighlights with native D1/R2 bindings.
 *
 * Usage:
 *   WORKER_URL=https://forecheck.your-subdomain.workers.dev \
 *   ADMIN_SECRET=your_secret \
 *   bun run src/cli/adminBackfill.ts --seasons=20242025
 *
 *   # single game test:
 *   bun run src/cli/adminBackfill.ts --game=2025021115
 *
 *   # local worker (wrangler dev --remote):
 *   WORKER_URL=http://localhost:8787 bun run src/cli/adminBackfill.ts --game=2025021115
 */

import { NhlClient } from '../nhl/index.js';
import { cloudD1FromEnv } from '../db/cloudD1.js';

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8787';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) { console.error('ADMIN_SECRET env var required'); process.exit(1); }

const args = process.argv.slice(2);
const seasonArg = args.find((a) => a.startsWith('--seasons='))?.split('=')[1];
const gameArg = args.find((a) => a.startsWith('--game='))?.split('=')[1];
const CONCURRENCY = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '2');
const DELAY_MS = Number(args.find((a) => a.startsWith('--delay='))?.split('=')[1] ?? '1000');

async function backfillGame(gameId: number): Promise<void> {
  const res = await fetch(`${WORKER_URL}/admin/backfill/game`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({ gameId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

if (gameArg) {
  console.log(`backfilling game ${gameArg} via ${WORKER_URL}`);
  await backfillGame(Number(gameArg));
  console.log('done');
  process.exit(0);
}

const client = new NhlClient();
const seasons = seasonArg ? seasonArg.split(',').map(Number) : [20242025];

const db = cloudD1FromEnv();

for (const season of seasons) {
  console.log(`\n=== season ${season} ===`);
  const gameIds = await client.getSeasonGameIds(season);

  let toIngest = gameIds;
  if (db) {
    const { results } = await db.prepare(
      `SELECT id FROM games WHERE season = ?`
    ).bind(season).all<{ id: number }>();
    const done = new Set(results.map((r) => r.id));
    toIngest = gameIds.filter((id) => !done.has(id));
    console.log(`  ${gameIds.length} total, ${done.size} already ingested, ${toIngest.length} remaining`);
  } else {
    console.log(`  ${gameIds.length} games — ${CONCURRENCY} concurrent (no D1 credentials, skipping manifest check)`);
  }

  const gameIds2 = toIngest;
  console.log(`  ${CONCURRENCY} concurrent`);

  let ingested = 0;
  let failed = 0;

  for (let i = 0; i < gameIds2.length; i += CONCURRENCY) {
    const chunk = gameIds2.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (gameId) => {
        try {
          await backfillGame(gameId);
          ingested++;
          console.log(`  ✓ ${gameId}  [${ingested}/${gameIds2.length}]`);
        } catch (err) {
          failed++;
          console.error(`  ✗ ${gameId}  [${ingested}/${gameIds2.length}] ${err}`);
        }
      }),
    );
    if (i + CONCURRENCY < gameIds2.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`  season ${season} complete: ${ingested} ok, ${failed} failed`);
}
