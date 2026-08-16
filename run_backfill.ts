/**
 * run_backfill.ts
 *
 * One-shot orchestration for the forecheck missing-data backfill:
 *   1. ingestGame for every game with zero events (recomputed fresh from D1)
 *   2. ingestHighlights for every game missing a highlight row or missing r2_key
 *   3. transcribe.ts for the remaining transcript backlog (spawned as a subprocess,
 *      since it already handles concurrency/retry/ffmpeg on its own)
 *
 * Run from ~/src/forecheck on the remote host (relies on repo-relative src/ imports
 * and Bun's automatic .env loading from cwd).
 */

import { cloudD1FromEnv } from './src/db/cloudD1.js';
import { localR2FromEnv } from './src/db/localR2.js';
import { NhlClient } from './src/nhl/index.js';
import { ingestGame } from './src/ingest/ingestGame.js';
import { ingestHighlights } from './src/ingest/ingestHighlights.js';

const db = cloudD1FromEnv();
if (!db) { console.error('no cloud D1 credentials in .env'); process.exit(1); }
const client = new NhlClient();
const r2 = localR2FromEnv('forecheck');
console.log(r2 ? 'R2 uploads enabled' : 'R2 env vars not set — highlights will be dry-run only');

async function getMissingEventGames(): Promise<number[]> {
  const { results } = await db!.prepare(`
    SELECT g.id FROM games g
    WHERE (SELECT count(*) FROM events e WHERE e.game_id = g.id) = 0
    ORDER BY g.id
  `).all<{ id: number }>();
  return results.map((r) => r.id);
}

async function getMissingHighlightGames(): Promise<number[]> {
  const { results: a } = await db!.prepare(`
    SELECT g.id FROM games g LEFT JOIN highlights h ON h.game_id = g.id WHERE h.id IS NULL
  `).all<{ id: number }>();
  const { results: b } = await db!.prepare(`
    SELECT DISTINCT game_id as id FROM highlights WHERE r2_key IS NULL
  `).all<{ id: number }>();
  return [...new Set([...a, ...b].map((r) => r.id))].sort((x, y) => x - y);
}

// --- stage 1: events/shifts ---
console.log('\n=== stage 1: events/shifts backfill ===');
const eventGameIds = await getMissingEventGames();
console.log(`${eventGameIds.length} games missing events`);
let ok = 0, failed = 0;
for (const gameId of eventGameIds) {
  try {
    await ingestGame(gameId, client, db);
    ok++;
    console.log(`✓ events ${gameId}  [${ok + failed}/${eventGameIds.length}]`);
  } catch (err) {
    failed++;
    console.error(`✗ events ${gameId}  ${err}`);
  }
  await Bun.sleep(300);
}
console.log(`stage 1 done: ${ok} ok, ${failed} failed`);

// --- stage 2: highlights ---
console.log('\n=== stage 2: highlights backfill ===');
const highlightGameIds = await getMissingHighlightGames();
console.log(`${highlightGameIds.length} games missing highlights/r2_key`);
ok = 0; failed = 0;
for (const gameId of highlightGameIds) {
  try {
    await ingestHighlights(gameId, client, db, r2);
    ok++;
    console.log(`✓ highlights ${gameId}  [${ok + failed}/${highlightGameIds.length}]`);
  } catch (err) {
    failed++;
    console.error(`✗ highlights ${gameId}  ${err}`);
  }
  await Bun.sleep(300);
}
console.log(`stage 2 done: ${ok} ok, ${failed} failed`);

// --- stage 3: transcripts (delegate to existing CLI) ---
console.log('\n=== stage 3: transcript backlog ===');
const proc = Bun.spawn(['bun', 'run', 'src/cli/transcribe.ts', '--concurrency=3'], {
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
});
await proc.exited;

console.log('\n=== all stages complete ===');
