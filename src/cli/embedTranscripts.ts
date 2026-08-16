/**
 * Resumable Vectorize backfill for transcript embeddings.
 *
 * Required env vars:
 *   CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID
 *
 * The API token needs D1 Read, Workers AI Read, and Vectorize Write.
 *
 * Usage:
 *   bun run src/cli/embedTranscripts.ts
 *   bun run src/cli/embedTranscripts.ts --batch=50
 *   bun run src/cli/embedTranscripts.ts --state=.vectorize-cursor.json
 *   bun run src/cli/embedTranscripts.ts --reset
 */

import { existsSync } from 'node:fs';
import { cloudD1FromEnv } from '../db/cloudD1.js';
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_MODEL,
  transcriptVector,
  type TranscriptEmbeddingRow,
} from '../embeddings.js';

type BackfillRow = TranscriptEmbeddingRow & { transcript_id: number };
type State = { afterId: number; embedded: number; updatedAt: string };
type ApiEnvelope<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ message?: string }>;
};

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;
const db = cloudD1FromEnv();
if (!accountId || !apiToken || !db) {
  console.error('D1/API env vars required (CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID)');
  process.exit(1);
}

const args = process.argv.slice(2);
const argValue = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const batchSize = Number(argValue('batch') ?? EMBEDDING_BATCH_SIZE);
const statePath = argValue('state') ?? '.forecheck-vectorize-backfill.json';
const reset = args.includes('--reset');
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
  console.error('--batch must be an integer from 1 to 100');
  process.exit(1);
}

async function readState(): Promise<State> {
  if (reset || !existsSync(statePath)) return { afterId: 0, embedded: 0, updatedAt: new Date(0).toISOString() };
  const state = JSON.parse(await Bun.file(statePath).text()) as Partial<State>;
  if (!Number.isSafeInteger(state.afterId) || !Number.isSafeInteger(state.embedded)) {
    throw new Error(`invalid state file: ${statePath}`);
  }
  return state as State;
}

async function writeState(state: State): Promise<void> {
  await Bun.write(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function embed(texts: string[]): Promise<number[][]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texts }),
    },
  );
  if (!response.ok) throw new Error(`Workers AI ${response.status}: ${await response.text()}`);

  const body = await response.json() as ApiEnvelope<{ data?: number[][] }>;
  const embeddings = body.result?.data;
  if (!body.success || !embeddings || embeddings.length !== texts.length) {
    throw new Error(`Workers AI returned ${embeddings?.length ?? 0} vectors for ${texts.length} texts`);
  }
  return embeddings;
}

async function upsert(rows: BackfillRow[], embeddings: number[][]): Promise<void> {
  const ndjson = rows.map((row, index) => JSON.stringify(transcriptVector(row, embeddings[index]!))).join('\n');
  const form = new FormData();
  form.append('body', new Blob([`${ndjson}\n`], { type: 'application/x-ndjson' }), 'vectors.ndjson');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/forecheck-transcripts/upsert`,
    { method: 'POST', headers: { Authorization: `Bearer ${apiToken}` }, body: form },
  );
  if (!response.ok) throw new Error(`Vectorize ${response.status}: ${await response.text()}`);
  const body = await response.json() as ApiEnvelope<{ mutationId?: string }>;
  if (!body.success) throw new Error(`Vectorize upsert failed: ${body.errors?.map((error) => error.message).join(', ')}`);
}

let state = await readState();
console.log(`resuming after transcript id ${state.afterId} (${state.embedded} already embedded)`);

while (true) {
  const { results } = await db!.prepare(`
    SELECT
      t.id AS transcript_id,
      t.game_id,
      t.event_id,
      t.transcript,
      h.season,
      h.scorer_id,
      h.team_id
    FROM transcripts t
    JOIN highlights h ON h.game_id = t.game_id AND h.event_id = t.event_id
    WHERE t.id > ?
    ORDER BY t.id
    LIMIT ?
  `).bind(state.afterId, batchSize).all<BackfillRow>();

  if (results.length === 0) break;
  const embeddings = await embed(results.map((row) => row.transcript));
  await upsert(results, embeddings);

  state = {
    afterId: results.at(-1)!.transcript_id,
    embedded: state.embedded + results.length,
    updatedAt: new Date().toISOString(),
  };
  await writeState(state);
  console.log(`embedded ${state.embedded}; cursor=${state.afterId}`);
}

console.log(`done: ${state.embedded} transcripts embedded; state=${statePath}`);
