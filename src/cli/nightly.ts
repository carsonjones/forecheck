import { cloudD1FromEnv } from '../db/cloudD1.js';
import { createLocalD1 } from '../db/localD1.js';
import { runNightly } from '../ingest/nightly.js';

const db = cloudD1FromEnv() ?? createLocalD1('./forecheck-dev.db');
console.log(process.env.CF_API_TOKEN ? 'using cloud D1' : 'using local DB');
await runNightly(db);
