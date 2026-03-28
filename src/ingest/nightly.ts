/**
 * nightly.ts
 *
 * Ingests yesterday's completed games. Called by the Cloudflare cron at 6am UTC
 * (after North American overnight games finish) and can also be run locally.
 *
 * Usage:
 *   bun run src/ingest/nightly.ts
 */

import { NhlClient } from '../nhl/index.js';
import { addDays, formatDate } from '../nhl/formatters.js';
import { ingestGame } from './ingestGame.js';

export async function runNightly(db: D1Database): Promise<void> {
  const client = new NhlClient();
  const yesterday = formatDate(addDays(new Date(), -1));

  console.log(`nightly ingest for ${yesterday}`);

  const schedule = await client.getScheduleByDate(yesterday);

  let ingested = 0;
  for (const game of schedule.games) {
    if (game.gameState !== 'OFF') continue; // skip games not yet final
    try {
      await ingestGame(game.id, client, db);
      ingested++;
    } catch (err) {
      console.error(`  failed game ${game.id}:`, err);
    }
    await Bun.sleep(300);
  }

  console.log(`nightly done: ${ingested} games ingested`);
}

// allow direct execution
if (import.meta.main) {
  const db = null as unknown as D1Database;
  await runNightly(db);
}
