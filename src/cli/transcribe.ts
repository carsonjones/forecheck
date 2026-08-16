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

import { parseTranscriptionResult, type TranscriptionResult } from '../transcription.js';
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
const LEGACY_TRANSCRIPTION_MODEL = '@cf/openai/whisper';

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

async function getGamePrompt(gameId: number): Promise<string> {
  const { results } = await db!.prepare(`
    SELECT DISTINCT p.first_name, p.last_name
    FROM players p
    JOIN events e ON e.scoring_player_id = p.id OR e.shooting_player_id = p.id
      OR e.assist1_player_id = p.id OR e.assist2_player_id = p.id
    WHERE e.game_id = ?
    UNION
    SELECT DISTINCT p.first_name, p.last_name
    FROM players p
    JOIN shifts s ON s.player_id = p.id
    WHERE s.game_id = ?
  `).bind(gameId, gameId).all<{ first_name: string; last_name: string }>();

  const names = results.map((r) => `${r.first_name} ${r.last_name}`).join(', ');
  return `NHL hockey game. Players: ${names}.`;
}

async function transcribeAudio(audioBytes: Uint8Array, prompt: string): Promise<TranscriptionResult> {
  const res = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ADMIN_SECRET}`,
      'Content-Type': 'audio/mpeg',
      'X-Prompt': encodeURIComponent(prompt),
    },
    body: audioBytes,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${await res.text()}`);

  const data: unknown = await res.json();
  // Production may still run the legacy endpoint during a rolling upgrade.
  // Its response omitted model metadata, but its model identity is known.
  return parseTranscriptionResult(data, LEGACY_TRANSCRIPTION_MODEL);
}

async function transcribeHighlight(row: { game_id: number; event_id: number; r2_key: string }, prompt: string): Promise<void> {
  process.stdout.write(`\n  fetching ${row.game_id}/${row.event_id}...`);
  const obj = await r2!.get(row.r2_key);
  if (!obj) throw new Error(`R2 key not found: ${row.r2_key}`);

  const mp4Bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());
  const audioBytes = await extractAudio(mp4Bytes);
  const { transcript, model } = await transcribeAudio(audioBytes, prompt);

  await db!.prepare(`
    INSERT INTO transcripts (game_id, event_id, transcript, model)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(game_id, event_id) DO UPDATE SET
      transcript  = excluded.transcript,
      model       = excluded.model,
      ingested_at = datetime('now')
  `).bind(row.game_id, row.event_id, transcript, model).run();

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

const total = results.length;
console.log(`${total} highlights to transcribe — ${CONCURRENCY} concurrent`);

// group by game so we fetch the roster prompt once per game
const byGame = new Map<number, typeof results>();
for (const row of results) {
  if (!byGame.has(row.game_id)) byGame.set(row.game_id, []);
  byGame.get(row.game_id)!.push(row);
}

let done = 0;
let failed = 0;
const games = [...byGame.keys()];

for (let g = 0; g < games.length; g++) {
  const gameId = games[g];
  const rows = byGame.get(gameId)!;
  const prompt = await getGamePrompt(gameId);

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (row) => {
        try {
          await transcribeHighlight(row, prompt);
          done++;
          process.stdout.write(`\r  ${done}/${total} clips  ${g + 1}/${games.length} games  ${failed} failed`);
        } catch (err) {
          failed++;
          console.error(`\n  ✗ ${row.game_id}/${row.event_id}: ${err}`);
        }
      }),
    );
    if (i + CONCURRENCY < rows.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

console.log(`\ndone: ${done} transcribed, ${failed} failed`);
