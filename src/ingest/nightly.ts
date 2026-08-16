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
import { ingestHighlights } from './ingestHighlights.js';
import { upsertTranscriptEmbeddings, type TranscriptEmbeddingRow } from '../embeddings.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runNightly(
  db: D1Database,
  r2?: R2Bucket,
  ai?: Ai,
  vectorize?: Vectorize,
): Promise<void> {
  const client = new NhlClient();
  const yesterday = formatDate(addDays(new Date(), -1));

  console.log(`nightly ingest for ${yesterday}`);

  const schedule = await client.getScheduleByDate(yesterday);

  let ingested = 0;
  for (const game of schedule.games) {
    if (game.gameState !== 'OFF') continue;
    try {
      await ingestGame(game.id, client, db);
      await ingestHighlights(game.id, client, db, r2);
      ingested++;
    } catch (err) {
      console.error(`  failed game ${game.id}:`, err);
    }
    await sleep(300);
  }

  let embedded = 0;
  if (ai && vectorize) {
    // Upserts are idempotent. The lookback retries transcripts created near a cron boundary.
    const { results } = await db.prepare(`
      SELECT
        t.game_id,
        t.event_id,
        t.transcript,
        h.season,
        h.scorer_id,
        h.team_id
      FROM transcripts t
      JOIN highlights h ON h.game_id = t.game_id AND h.event_id = t.event_id
      WHERE t.ingested_at >= datetime('now', '-2 days')
      ORDER BY t.id
    `).all<TranscriptEmbeddingRow>();
    embedded = await upsertTranscriptEmbeddings(ai, vectorize, results);
  }

  console.log(`nightly done: ${ingested} games ingested, ${embedded} transcripts embedded`);
}

