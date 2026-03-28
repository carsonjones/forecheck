/**
 * backfill.ts
 *
 * Fetches historical seasons from the NHL API and writes to D1.
 * Run locally: bun run src/ingest/backfill.ts
 *
 * Usage:
 *   bun run src/ingest/backfill.ts --seasons 20222023,20232024,20242025
 *   bun run src/ingest/backfill.ts --game 2025021115   (single game, for testing)
 */

import { NhlClient } from '../nhl/index.js';
import { ingestGame } from './ingestGame.js';

const args = process.argv.slice(2);
const seasonArg = args.find((a) => a.startsWith('--seasons='))?.split('=')[1];
const gameArg = args.find((a) => a.startsWith('--game='))?.split('=')[1];

const client = new NhlClient();

// TODO: replace with real D1 binding (via wrangler d1 or local SQLite for dev)
const db = null as unknown as D1Database;

if (gameArg) {
  console.log(`ingesting single game ${gameArg}`);
  await ingestGame(Number(gameArg), client, db);
  process.exit(0);
}

const seasons = seasonArg
  ? seasonArg.split(',').map(Number)
  : [20242025];

for (const season of seasons) {
  console.log(`\n=== season ${season} ===`);
  const gameIds = await client.getSeasonGameIds(season);
  console.log(`  ${gameIds.length} games found`);

  let done = 0;
  for (const gameId of gameIds) {
    try {
      await ingestGame(gameId, client, db);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${gameIds.length}`);
    } catch (err) {
      console.error(`  failed game ${gameId}:`, err);
    }
    // be polite to the API
    await Bun.sleep(300);
  }
  console.log(`  done: ${done}/${gameIds.length}`);
}
