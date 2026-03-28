import { cloudD1FromEnv } from '../db/cloudD1.js';
import { createLocalD1 } from '../db/localD1.js';
import { localR2FromEnv } from '../db/localR2.js';
import { NhlClient } from '../nhl/index.js';
import { ingestHighlights } from '../ingest/ingestHighlights.js';

const args = process.argv.slice(2);
const gameArg = args.find((a) => a.startsWith('--game='))?.split('=')[1];
const dbPath = args.find((a) => a.startsWith('--db='))?.split('=')[1] ?? './forecheck-dev.db';

if (!gameArg) { console.error('usage: --game=<gameId>'); process.exit(1); }

const db = cloudD1FromEnv() ?? createLocalD1(dbPath);
console.log(process.env.CF_API_TOKEN ? 'using cloud D1' : `using local DB: ${dbPath}`);
const r2 = localR2FromEnv('forecheck');

console.log(r2 ? 'R2 uploads enabled' : 'R2 env vars not set — dry run');

const client = new NhlClient();
console.log(`ingesting highlights for game ${gameArg}`);
await ingestHighlights(Number(gameArg), client, db, r2);
console.log('done');
