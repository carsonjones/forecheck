/**
 * transcribe.ts
 *
 * For each highlight with an r2_key but no transcript, fetches the MP4 from R2,
 * extracts audio via ffmpeg, transcribes with CF Workers AI Whisper, and upserts
 * into the transcripts table.
 *
 * Required env vars:
 *   CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *
 * Usage:
 *   bun run src/cli/transcribe.ts
 *   bun run src/cli/transcribe.ts --game=2025021115
 *   bun run src/cli/transcribe.ts --season=20252026 --concurrency=3
 */

import { cloudD1FromEnv } from '../db/cloudD1.js';
import { localR2FromEnv } from '../db/localR2.js';

const WORKER_URL = process.env.WORKER_URL ?? 'https://forecheck.neat.workers.dev';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error('ADMIN_SECRET env var required');
  process.exit(1);
}

const db = cloudD1FromEnv();
if (!db) { console.error('D1 env vars required (CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID)'); process.exit(1); }

const r2 = localR2FromEnv('forecheck');
if (!r2) { console.error('R2 env vars required (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)'); process.exit(1); }

const args = process.argv.slice(2);
const gameArg = args.find((a) => a.startsWith('--game='))?.split('=')[1];
const seasonArg = args.find((a) => a.startsWith('--season='))?.split('=')[1];
const CONCURRENCY = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '3');
const DELAY_MS = Number(args.find((a) => a.startsWith('--delay='))?.split('=')[1] ?? '500');

const TRANSCRIBE_URL = `${WORKER_URL}/admin/transcribe`;

// ---------------------------------------------------------------------------

async function extractAudio(mp4Bytes: Uint8Array): Promise<Uint8Array> {
  const proc = Bun.spawn(
    ['ffmpeg', '-i', 'pipe:0', '-vn', '-ar', '16000', '-ac', '1', '-f', 'mp3', 'pipe:1'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  proc.stdin.write(mp4Bytes);
  proc.stdin.end();
  const [mp3] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    proc.exited,
  ]);
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg failed: ${err.slice(-200)}`);
  }
  return new Uint8Array(mp3);
}

async function transcribeAudio(audioBytes: Uint8Array): Promise<string> {
  const res = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ADMIN_SECRET}`,
      'Content-Type': 'audio/mpeg',
    },
    body: audioBytes,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${await res.text()}`);
  const data = await res.json() as { transcript: string };
  return data.transcript;
}

async function transcribeHighlight(row: { game_id: number; event_id: number; r2_key: string }): Promise<void> {
  const obj = await r2!.get(row.r2_key);
  if (!obj) throw new Error(`R2 key not found: ${row.r2_key}`);

  const mp4Bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());
  const audioBytes = await extractAudio(mp4Bytes);
  const transcript = await transcribeAudio(audioBytes);

  await db!.prepare(`
    INSERT INTO transcripts (game_id, event_id, transcript)
    VALUES (?, ?, ?)
    ON CONFLICT(game_id, event_id) DO UPDATE SET
      transcript  = excluded.transcript,
      ingested_at = datetime('now')
  `).bind(row.game_id, row.event_id, transcript).run();

  console.log(`  ✓ ${row.game_id}/${row.event_id}: ${transcript.slice(0, 80)}`);
}

// ---------------------------------------------------------------------------

let whereClause = `h.r2_key IS NOT NULL AND t.id IS NULL`;
const binds: unknown[] = [];

if (gameArg) {
  whereClause += ` AND h.game_id = ?`;
  binds.push(Number(gameArg));
} else if (seasonArg) {
  whereClause += ` AND h.season = ?`;
  binds.push(Number(seasonArg));
}

const { results } = await db.prepare(`
  SELECT h.game_id, h.event_id, h.r2_key
  FROM highlights h
  LEFT JOIN transcripts t ON t.game_id = h.game_id AND t.event_id = h.event_id
  WHERE ${whereClause}
  ORDER BY h.game_id, h.event_id
`).bind(...binds).all<{ game_id: number; event_id: number; r2_key: string }>();

console.log(`${results.length} highlights to transcribe — ${CONCURRENCY} concurrent`);

let done = 0;
let failed = 0;

for (let i = 0; i < results.length; i += CONCURRENCY) {
  const chunk = results.slice(i, i + CONCURRENCY);
  await Promise.allSettled(
    chunk.map(async (row) => {
      try {
        await transcribeHighlight(row);
        done++;
      } catch (err) {
        failed++;
        console.error(`  ✗ ${row.game_id}/${row.event_id}: ${err}`);
      }
    }),
  );
  if (i + CONCURRENCY < results.length) await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(`\ndone: ${done} transcribed, ${failed} failed`);
