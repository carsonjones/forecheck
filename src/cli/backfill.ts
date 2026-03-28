import { cloudD1FromEnv } from '../db/cloudD1.js';
import { createLocalD1 } from '../db/localD1.js';
import { NhlClient } from '../nhl/index.js';
import { ingestGame } from '../ingest/ingestGame.js';

const args = process.argv.slice(2);
const seasonArg = args.find((a) => a.startsWith('--seasons='))?.split('=')[1];
const gameArg = args.find((a) => a.startsWith('--game='))?.split('=')[1];
const dbPath = args.find((a) => a.startsWith('--db='))?.split('=')[1] ?? './forecheck-dev.db';

const client = new NhlClient();
const db = cloudD1FromEnv() ?? createLocalD1(dbPath);
console.log(process.env.CF_API_TOKEN ? 'using cloud D1' : `using local DB: ${dbPath}`);

if (gameArg) {
  console.log(`ingesting single game ${gameArg}`);
  await ingestGame(Number(gameArg), client, db);
  process.exit(0);
}

const seasons = seasonArg ? seasonArg.split(',').map(Number) : [20242025];

for (const season of seasons) {
  console.log(`\n=== season ${season} ===`);
  const gameIds = await client.getSeasonGameIds(season);
  console.log(`  ${gameIds.length} games found`);

  let done = 0;
  for (const gameId of gameIds) {
    try {
      await ingestGame(gameId, client, db);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${gameIds.length}`);
    } catch (err) {
      console.error(`  failed game ${gameId}:`, err);
    }
    await Bun.sleep(300);
  }
  console.log(`  done: ${done}/${gameIds.length}`);
}
