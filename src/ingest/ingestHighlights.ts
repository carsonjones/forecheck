/**
 * ingestHighlights.ts
 *
 * For a given game: fetch goal clips from the NHL game story, resolve each
 * Brightcove clip to an MP4 URL, upload to R2 with a first-frame JPEG thumbnail,
 * and upsert into highlights table.
 *
 * Thumbnails: when `extractThumbnail` is supplied (bun CLI, ffmpeg available)
 * the first frame of the MP4 is used. Otherwise (worker) the Brightcove poster
 * image is fetched as a fallback. `bun run thumbnails:backfill` replaces
 * missing thumbs with real first frames later.
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

export type ThumbnailExtractor = (mp4: Uint8Array) => Promise<Uint8Array>;

export type IngestHighlightsOptions = {
  extractThumbnail?: ThumbnailExtractor;
};

export function thumbKeyFor(r2Key: string): string {
  return r2Key.replace(/\.mp4$/, '.jpg');
}

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

type ClipSources = { mp4Url: string | null; posterUrl: string | null };

async function getClipSources(clipId: number): Promise<ClipSources> {
  const policyKey = await getBrightcovePolicyKey();
  const res = await fetch(`${BRIGHTCOVE_PLAYBACK_URL}/${clipId}`, {
    headers: { Accept: `application/json;pk=${policyKey}` },
  });
  if (!res.ok) {
    console.warn(`  Brightcove ${clipId}: HTTP ${res.status}`);
    return { mp4Url: null, posterUrl: null };
  }
  const data = await res.json() as {
    poster?: string;
    sources?: Array<{ src?: string; container?: string; height?: number }>;
  };
  // prefer highest-res progressive MP4
  const mp4s = (data.sources ?? [])
    .filter((s) => s.container === 'MP4' && s.src?.startsWith('http'))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return {
    mp4Url: mp4s[0]?.src ?? null,
    posterUrl: data.poster?.startsWith('http') ? data.poster : null,
  };
}

// ---------------------------------------------------------------------------
// R2 helpers
// ---------------------------------------------------------------------------

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}: ${url.slice(0, 80)}`);
  return new Uint8Array(await res.arrayBuffer());
}

// faststart MP4s carry moov + first keyframe up front; 2MB is plenty for frame 0.
const THUMB_HEAD_BYTES = 2 * 1024 * 1024;

async function readR2(bucket: R2Bucket, key: string, length?: number): Promise<Uint8Array | null> {
  const obj = await bucket.get(key, length ? { range: { offset: 0, length } } : undefined);
  if (!obj) return null;
  return new Uint8Array(await new Response(obj.body).arrayBuffer());
}

/** Extract from the clip head; fall back to the whole object if ffmpeg can't decode the partial. */
async function extractFromR2(bucket: R2Bucket, key: string, extract: ThumbnailExtractor): Promise<Uint8Array | null> {
  const head = await readR2(bucket, key, THUMB_HEAD_BYTES);
  if (!head) return null;
  try {
    return await extract(head);
  } catch {
    const full = await readR2(bucket, key);
    return full ? extract(full) : null;
  }
}

/**
 * Ensures a JPEG thumbnail exists at thumbKey. Prefers ffmpeg first frame
 * (needs mp4 bytes — reads from R2 if not passed in), falls back to Brightcove poster.
 * Returns true if a thumbnail exists after the call.
 */
export async function ensureThumbnail(
  bucket: R2Bucket,
  r2Key: string,
  thumbKey: string,
  opts: { mp4?: Uint8Array; posterUrl?: string | null; extract?: ThumbnailExtractor; force?: boolean },
): Promise<boolean> {
  if (!opts.force && await bucket.head(thumbKey)) return true;

  let jpg: Uint8Array | null = null;
  if (opts.extract) {
    jpg = opts.mp4 ? await opts.extract(opts.mp4) : await extractFromR2(bucket, r2Key, opts.extract);
  } else if (opts.posterUrl) {
    jpg = await fetchBytes(opts.posterUrl);
  }
  if (!jpg) return false;

  await bucket.put(thumbKey, jpg, { httpMetadata: { contentType: 'image/jpeg' } });
  return true;
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
  opts: IngestHighlightsOptions = {},
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
    const thumbKey = thumbKeyFor(r2Key);

    let uploadedKey: string | null = null;
    let uploadedThumb: string | null = null;

    try {
      if (r2) {
        let sources: ClipSources | null = null;
        let mp4Bytes: Uint8Array | undefined;

        if (await r2.head(r2Key)) {
          uploadedKey = r2Key;
        } else {
          sources = await getClipSources(clipId);
          if (sources.mp4Url) {
            mp4Bytes = await fetchBytes(sources.mp4Url);
            await r2.put(r2Key, mp4Bytes, { httpMetadata: { contentType: 'video/mp4' } });
            uploadedKey = r2Key;
            console.log(`  uploaded ${r2Key}`);
          } else {
            console.warn(`  no MP4 source for clip ${clipId}, skipping R2`);
          }
        }

        if (uploadedKey) {
          if (!opts.extractThumbnail && !sources) sources = await getClipSources(clipId);
          const ok = await ensureThumbnail(r2, r2Key, thumbKey, {
            mp4: mp4Bytes,
            posterUrl: sources?.posterUrl,
            extract: opts.extractThumbnail,
          });
          if (ok) uploadedThumb = thumbKey;
          else console.warn(`  no thumbnail for ${r2Key}`);
        }
      } else {
        // dry-run: resolve URL but don't upload
        const { mp4Url } = await getClipSources(clipId);
        console.log(`  [dry-run] clip ${clipId} → ${mp4Url ?? 'no url'}`);
      }
    } catch (err) {
      console.error(`  clip ${clipId} failed:`, err);
    }

    await db
      .prepare(`
        INSERT INTO highlights (game_id, event_id, season, brightcove_clip_id, r2_key, thumb_key, period, time_in_period, scorer_id, team_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id, event_id) DO UPDATE SET
          r2_key      = COALESCE(excluded.r2_key, r2_key),
          thumb_key   = COALESCE(excluded.thumb_key, thumb_key),
          ingested_at = datetime('now')
      `)
      .bind(
        gameId,
        goal.eventId,
        season,
        clipId,
        uploadedKey,
        uploadedThumb,
        goal.period,
        goal.timeInPeriod,
        goal.playerId ?? null,
        null, // team_id: TODO resolve from teamAbbrev once teams table exists
      )
      .run();
  }
}
