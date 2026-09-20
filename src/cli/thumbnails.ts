/**
 * thumbnails.ts
 *
 * Backfill: for each highlight with an r2_key but no thumb_key, fetch the MP4
 * from R2, extract the first frame via ffmpeg, upload the JPEG, set thumb_key.
 *
 * Required env vars:
 *   CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   CF_API_TOKEN, D1_DATABASE_ID   (omit for local forecheck-dev.db)
 *
 * Usage:
 *   bun run src/cli/thumbnails.ts
 *   bun run src/cli/thumbnails.ts --game=2025021115
 *   bun run src/cli/thumbnails.ts --season=20252026 --concurrency=4
 *   bun run src/cli/thumbnails.ts --force     # regenerate even if thumb_key set
 */

import { cloudD1FromEnv } from '../db/cloudD1.js';
import { createLocalD1 } from '../db/localD1.js';
import { localR2FromEnv } from '../db/localR2.js';
import { ensureThumbnail, thumbKeyFor } from '../ingest/ingestHighlights.js';
import { extractFirstFrame } from '../thumbnails.js';

const args = process.argv.slice(2);
const gameArg = args.find((a) => a.startsWith('--game='))?.split('=')[1];
const seasonArg = args.find((a) => a.startsWith('--season='))?.split('=')[1];
const dbPath = args.find((a) => a.startsWith('--db='))?.split('=')[1] ?? './forecheck-dev.db';
const CONCURRENCY = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '3');
const force = args.includes('--force');

const db = cloudD1FromEnv() ?? createLocalD1(dbPath);
console.log(process.env.CF_API_TOKEN ? 'using cloud D1' : `using local DB: ${dbPath}`);

const r2 = localR2FromEnv('forecheck');
if (!r2) { console.error('R2 env vars required (CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)'); process.exit(1); }

type Row = { game_id: number; event_id: number; r2_key: string };

const where = ['h.r2_key IS NOT NULL'];
const params: unknown[] = [];
if (!force) where.push('h.thumb_key IS NULL');
if (gameArg) { where.push('h.game_id = ?'); params.push(Number(gameArg)); }
if (seasonArg) { where.push('h.season = ?'); params.push(Number(seasonArg)); }

const { results: rows } = await db.prepare(`
  SELECT h.game_id, h.event_id, h.r2_key
  FROM highlights h
  WHERE ${where.join(' AND ')}
  ORDER BY h.game_id, h.event_id
`).bind(...params).all<Row>();

console.log(`${rows.length} highlights need thumbnails`);

let done = 0;
let failed = 0;

async function processRow(row: Row): Promise<void> {
  const thumbKey = thumbKeyFor(row.r2_key);
  try {
    const ok = await ensureThumbnail(r2!, row.r2_key, thumbKey, { extract: extractFirstFrame, force });
    if (!ok) throw new Error(`R2 key not found: ${row.r2_key}`);
    await db.prepare('UPDATE highlights SET thumb_key = ? WHERE game_id = ? AND event_id = ?')
      .bind(thumbKey, row.game_id, row.event_id).run();
    done++;
    console.log(`  ✓ ${thumbKey}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${row.game_id}/${row.event_id}:`, err instanceof Error ? err.message : err);
  }
}

const queue = [...rows];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await processRow(queue.shift()!);
  }),
);

console.log(`done: ${done} thumbnails, ${failed} failed`);
