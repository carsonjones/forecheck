/**
 * Retranscribe a small random sample of legacy highlight transcripts with the
 * current production model. This is intentionally separate from transcribe.ts
 * so the normal missing-transcript backlog cannot overwrite existing results.
 *
 * Usage:
 *   bun run src/cli/retranscribe.ts --count=5
 *   bun run src/cli/retranscribe.ts --count=10 --season=20252026
 *   bun run src/cli/retranscribe.ts --count=3 --game=2025021115
 *   bun run src/cli/retranscribe.ts --all
 */

import { parseTranscriptionResult, type TranscriptionResult } from '../transcription.js';
import { cloudD1FromEnv } from '../db/cloudD1.js';
import { localR2FromEnv } from '../db/localR2.js';

const WORKER_URL = process.env.WORKER_URL ?? 'https://forecheck.neat.workers.dev';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const TARGET_MODEL = '@cf/openai/whisper-large-v3-turbo';

if (!ADMIN_SECRET) {
  console.error('ADMIN_SECRET env var required');
  process.exit(1);
}

const db = cloudD1FromEnv();
if (!db) {
  console.error('D1 env vars required (CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID)');
  process.exit(1);
}

const r2 = localR2FromEnv('forecheck');
if (!r2) {
  console.error('R2 env vars required (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  process.exit(1);
}

const args = process.argv.slice(2);
const valueFor = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const countRaw = valueFor('count');
const count = Number(countRaw);
const runAll = args.includes('--all');
const game = valueFor('game');
const season = valueFor('season');
const concurrency = Number(valueFor('concurrency') ?? '3');
const delayMs = Number(valueFor('delay') ?? '500');

if (runAll === (countRaw !== undefined)) {
  console.error('use exactly one of --count=N or --all');
  process.exit(1);
}
if (!runAll && (!Number.isInteger(count) || count < 1 || count > 100)) {
  console.error('--count must be an integer from 1 to 100');
  process.exit(1);
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
  console.error('--concurrency must be an integer from 1 to 10');
  process.exit(1);
}

const TRANSCRIBE_URL = `${WORKER_URL}/admin/transcribe`;

type LegacyRow = {
  game_id: number;
  event_id: number;
  r2_key: string;
  previous_transcript: string;
  previous_model: string;
};

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

  const names = results.map((row) => `${row.first_name} ${row.last_name}`).join(', ');
  return `NHL hockey game. Players: ${names}.`;
}

async function transcribeAudio(audioBytes: Uint8Array, prompt: string): Promise<TranscriptionResult> {
  const response = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ADMIN_SECRET}`,
      'Content-Type': 'audio/mpeg',
      'X-Prompt': encodeURIComponent(prompt),
    },
    body: audioBytes,
  });
  if (!response.ok) throw new Error(`transcribe ${response.status}: ${await response.text()}`);

  const result = parseTranscriptionResult(await response.json());
  if (result.model !== TARGET_MODEL) {
    throw new Error(`expected ${TARGET_MODEL}, received ${result.model}; existing transcript preserved`);
  }
  return result;
}

async function retranscribe(row: LegacyRow, prompt: string): Promise<void> {
  const object = await r2!.get(row.r2_key);
  if (!object) throw new Error(`R2 key not found: ${row.r2_key}`);

  const mp4Bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  const audioBytes = await extractAudio(mp4Bytes);
  const { transcript, model } = await transcribeAudio(audioBytes, prompt);

  await db!.prepare(`
    UPDATE transcripts
    SET transcript = ?, model = ?, ingested_at = datetime('now')
    WHERE game_id = ? AND event_id = ?
  `).bind(transcript, model, row.game_id, row.event_id).run();

  console.log(`\n✓ ${row.game_id}/${row.event_id}`);
  console.log(`  old (${row.previous_model}): ${row.previous_transcript.slice(0, 300)}`);
  console.log(`  new (${model}): ${transcript.slice(0, 300)}`);
}

let whereClause = `h.r2_key IS NOT NULL AND t.id IS NOT NULL AND t.model != ?`;
const binds: unknown[] = [TARGET_MODEL];
if (game) {
  whereClause += ` AND h.game_id = ?`;
  binds.push(Number(game));
} else if (season) {
  whereClause += ` AND h.season = ?`;
  binds.push(Number(season));
}
const limitClause = runAll ? '' : 'LIMIT ?';
if (!runAll) binds.push(count);

const { results } = await db.prepare(`
  SELECT h.game_id, h.event_id, h.r2_key,
    t.transcript AS previous_transcript, t.model AS previous_model
  FROM highlights h
  JOIN transcripts t ON t.game_id = h.game_id AND t.event_id = h.event_id
  WHERE ${whereClause}
  ORDER BY random()
  ${limitClause}
`).bind(...binds).all<LegacyRow>();

console.log(`${results.length} legacy transcripts selected — ${concurrency} concurrent`);

const prompts = new Map<number, string>();
let done = 0;
let failed = 0;
for (let i = 0; i < results.length; i += concurrency) {
  const chunk = results.slice(i, i + concurrency);
  await Promise.all(chunk.map(async (row) => {
    try {
      let prompt = prompts.get(row.game_id);
      if (!prompt) {
        prompt = await getGamePrompt(row.game_id);
        prompts.set(row.game_id, prompt);
      }
      await retranscribe(row, prompt);
      done++;
    } catch (error) {
      failed++;
      console.error(`\n✗ ${row.game_id}/${row.event_id}: ${error}`);
    }
  }));
  if (i + concurrency < results.length) await Bun.sleep(delayMs);
}

console.log(`\ndone: ${done} retranscribed, ${failed} failed`);
