/**
 * ingestHighlights.ts
 *
 * For a given game: fetch goal clips from the NHL game story, resolve each
 * Brightcove clip to an MP4 URL, upload to R2, and upsert into highlights table.
 *
 * R2 bucket is optional — if omitted, metadata is written to D1 but r2_key stays null.
 * This lets the pipeline run locally against forecheck-dev.db without R2 credentials.
 *
 * Usage:
 *   bun run src/ingest/ingestHighlights.ts --game=2025021115
 *   bun run src/ingest/ingestHighlights.ts --game=2025021115 --db=./forecheck-dev.db
 */

import type { NhlClient } from '../nhl/client.js';
import type { GoalPlay, ScoringPeriod } from '../nhl/models.js';

const BRIGHTCOVE_ACCOUNT = '6415718365001';
const BRIGHTCOVE_CONFIG_URL = `https://players.brightcove.net/${BRIGHTCOVE_ACCOUNT}/default_default/config.json`;
const BRIGHTCOVE_PLAYBACK_URL = `https://edge.api.brightcove.com/playback/v1/accounts/${BRIGHTCOVE_ACCOUNT}/videos`;

// ---------------------------------------------------------------------------
// Brightcove helpers
// ---------------------------------------------------------------------------

let _policyKey: string | null = null;

async function getBrightcovePolicyKey(): Promise<string> {
  if (_policyKey) return _policyKey;
  const res = await fetch(BRIGHTCOVE_CONFIG_URL);
  if (!res.ok) throw new Error(`Brightcove config fetch failed: ${res.status}`);
  const config = await res.json() as { video_cloud?: { policy_key?: string } };
  const key = config.video_cloud?.policy_key;
  if (!key) throw new Error('policy_key not found in Brightcove config');
  _policyKey = key;
  return key;
}

async function getBestMp4Url(clipId: number): Promise<string | null> {
  const policyKey = await getBrightcovePolicyKey();
  const res = await fetch(`${BRIGHTCOVE_PLAYBACK_URL}/${clipId}`, {
    headers: { Accept: `application/json;pk=${policyKey}` },
  });
  if (!res.ok) {
    console.warn(`  Brightcove ${clipId}: HTTP ${res.status}`);
    return null;
  }
  const data = await res.json() as { sources?: Array<{ src?: string; container?: string; height?: number }> };
  // prefer highest-res progressive MP4
  const mp4s = (data.sources ?? [])
    .filter((s) => s.container === 'MP4' && s.src?.startsWith('http'))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return mp4s[0]?.src ?? null;
}

// ---------------------------------------------------------------------------
// R2 upload
// ---------------------------------------------------------------------------

async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  mp4Url: string,
): Promise<void> {
  const res = await fetch(mp4Url);
  if (!res.ok || !res.body) throw new Error(`MP4 fetch failed: ${res.status}`);
  await bucket.put(key, res.body, { httpMetadata: { contentType: 'video/mp4' } });
}

// ---------------------------------------------------------------------------
// Core ingest
// ---------------------------------------------------------------------------

type GoalWithPeriod = GoalPlay & { period: number };

export async function ingestHighlights(
  gameId: number,
  client: NhlClient,
  db: D1Database,
  r2?: R2Bucket,
): Promise<void> {
  const landing = await client.getGameLanding(gameId);
  const season = landing.season;

  const scoring = landing.summary?.scoring ?? [];
  const goals: GoalWithPeriod[] = scoring.flatMap((p: ScoringPeriod) =>
    p.goals.map((g) => ({ ...g, period: p.periodDescriptor.number })),
  );
  const clippable = goals.filter((g) => g.highlightClip && g.eventId);

  console.log(`  ${clippable.length}/${goals.length} goals have clips`);

  for (const goal of clippable) {
    const clipId = goal.highlightClip! as number;
    const r2Key = `highlights/${season}/${gameId}/${goal.eventId}.mp4`;

    let uploadedKey: string | null = null;

    try {
      if (r2) {
        // check if already uploaded
        const existing = await r2.head(r2Key);
        if (!existing) {
          const mp4Url = await getBestMp4Url(clipId);
          if (mp4Url) {
            await uploadToR2(r2, r2Key, mp4Url);
            console.log(`  uploaded ${r2Key}`);
          } else {
            console.warn(`  no MP4 source for clip ${clipId}, skipping R2`);
          }
        }
        uploadedKey = r2Key;
      } else {
        // dry-run: resolve URL but don't upload
        const mp4Url = await getBestMp4Url(clipId);
        console.log(`  [dry-run] clip ${clipId} → ${mp4Url ?? 'no url'}`);
      }
    } catch (err) {
      console.error(`  clip ${clipId} failed:`, err);
    }

    await db
      .prepare(`
        INSERT INTO highlights (game_id, event_id, season, brightcove_clip_id, r2_key, period, time_in_period, scorer_id, team_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id, event_id) DO UPDATE SET
          r2_key     = COALESCE(excluded.r2_key, r2_key),
          ingested_at = datetime('now')
      `)
      .bind(
        gameId,
        goal.eventId,
        season,
        clipId,
        uploadedKey,
        goal.period,
        goal.timeInPeriod,
        goal.playerId ?? null,
        null, // team_id: TODO resolve from teamAbbrev once teams table exists
      )
      .run();
  }
}

