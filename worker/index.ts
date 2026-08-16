type Env = {
  DB: D1Database;
  CACHE: KVNamespace;
  HIGHLIGHTS: R2Bucket;
  AI: Ai;
  ADMIN_SECRET: string;
};

const TRANSCRIPTION_MODEL = '@cf/openai/whisper-large-v3-turbo' as const;

type ScheduledEvent = { cron: string; scheduledTime: number };

const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
      ...init?.headers,
    },
  });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (url.pathname === '/api/health') {
    return json({ status: 'ok', app: 'forecheck' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // GET /api/war/players?season=20242025&limit=50&position=F
  if (url.pathname === '/api/war/players' && request.method === 'GET') {
    return handleWarLeaderboard(url, env);
  }

  // GET /api/war/players/:id?season=20242025
  const playerMatch = url.pathname.match(/^\/api\/war\/players\/(\d+)$/);
  if (playerMatch && request.method === 'GET') {
    const playerId = Number(playerMatch[1]);
    return handlePlayerWar(playerId, url, env);
  }

  // POST /admin/backfill/game  { gameId, highlights? }
  if (url.pathname === '/admin/backfill/game' && request.method === 'POST') {
    return handleAdminBackfillGame(request, env);
  }

  // POST /admin/transcribe  — body: raw MP3 bytes, returns { transcript, model }
  if (url.pathname === '/admin/transcribe' && request.method === 'POST') {
    return handleAdminTranscribe(request, env);
  }

  // GET /api/highlights/game/:gameId
  const highlightsGameMatch = url.pathname.match(/^\/api\/highlights\/game\/(\d+)$/);
  if (highlightsGameMatch && request.method === 'GET') {
    return handleHighlightsForGame(Number(highlightsGameMatch[1]), url, env);
  }

  // GET /api/highlights/event/:eventId?gameId=
  const highlightsEventMatch = url.pathname.match(/^\/api\/highlights\/event\/(\d+)$/);
  if (highlightsEventMatch && request.method === 'GET') {
    const gameId = url.searchParams.get('gameId');
    if (!gameId) return json({ error: 'gameId required' }, { status: 400 });
    return handleHighlightForEvent(Number(highlightsEventMatch[1]), Number(gameId), env);
  }

  // GET /api/highlights/stream/:gameId/:eventId
  const streamMatch = url.pathname.match(/^\/api\/highlights\/stream\/(\d+)\/(\d+)$/);
  if (streamMatch && request.method === 'GET') {
    return handleHighlightStream(Number(streamMatch[1]), Number(streamMatch[2]), env);
  }

  return new Response('Not Found', { status: 404 });
}

async function handleWarLeaderboard(url: URL, env: Env): Promise<Response> {
  const season = url.searchParams.get('season') ?? '20242025';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const cacheKey = `war-leaderboard-${season}-${limit}`;

  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    return json(JSON.parse(cached), { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }

  const { results } = await env.DB.prepare(`
    SELECT
      r.player_id,
      p.first_name,
      p.last_name,
      p.position_code,
      r.ev_offense_war,
      r.ev_defense_war,
      r.pp_war,
      r.pk_war,
      r.total_war,
      r.games_played,
      r.ev_toi
    FROM player_ratings r
    JOIN players p ON p.id = r.player_id
    WHERE r.season = ?
      AND r.total_war IS NOT NULL
    ORDER BY r.total_war DESC
    LIMIT ?
  `).bind(season, limit).all();

  env.CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: 3600 });
  return json(results);
}

async function handlePlayerWar(playerId: number, url: URL, env: Env): Promise<Response> {
  const season = url.searchParams.get('season') ?? '20242025';

  const row = await env.DB.prepare(`
    SELECT
      r.*,
      p.first_name,
      p.last_name,
      p.position_code,
      p.current_team_id
    FROM player_ratings r
    JOIN players p ON p.id = r.player_id
    WHERE r.player_id = ? AND r.season = ?
  `).bind(playerId, season).first();

  if (!row) return json({ error: 'not found' }, { status: 404 });
  return json(row);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function handleAdminBackfillGame(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Authorization') !== `Bearer ${env.ADMIN_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { gameId, highlights: withHighlights = true } = await request.json() as {
    gameId: number;
    highlights?: boolean;
  };

  const { NhlClient } = await import('../src/nhl/index.js');
  const { ingestGame } = await import('../src/ingest/ingestGame.js');
  const { ingestHighlights } = await import('../src/ingest/ingestHighlights.js');

  const client = new NhlClient();
  await ingestGame(gameId, client, env.DB);
  if (withHighlights) await ingestHighlights(gameId, client, env.DB, env.HIGHLIGHTS);

  return json({ ok: true, gameId }, { headers: { 'Cache-Control': 'no-store' } });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function decodePrompt(raw: string | null): string | undefined {
  if (!raw) return undefined;

  // X-Prompt has historically been URI encoded, but accepting a raw value keeps
  // the endpoint compatible with callers that send an ordinary header value.
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function handleAdminTranscribe(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Authorization') !== `Bearer ${env.ADMIN_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const mp3 = await request.arrayBuffer();
  if (mp3.byteLength === 0) {
    return json({ error: 'audio body required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const initialPrompt = decodePrompt(request.headers.get('X-Prompt'));
  const input = {
    audio: arrayBufferToBase64(mp3),
    task: 'transcribe',
    language: 'en',
    vad_filter: true,
    condition_on_previous_text: false,
    ...(initialPrompt ? { initial_prompt: initialPrompt } : {}),
  };
  const result = await env.AI.run(TRANSCRIPTION_MODEL, input);

  const transcript = result.text?.trim();
  if (!transcript) return json({ error: 'empty transcript' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  return json(
    { transcript, model: TRANSCRIPTION_MODEL },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLS = `
  h.event_id,
  h.period,
  h.time_in_period,
  h.brightcove_clip_id,
  h.r2_key,
  h.season,
  p.first_name,
  p.last_name
`;

function highlightRow(row: Record<string, unknown>, baseUrl: string) {
  const streamUrl = row.r2_key
    ? `${baseUrl}/api/highlights/stream/${row.game_id ?? ''}/${row.event_id}`
    : null;
  return { ...row, stream_url: streamUrl };
}

async function handleHighlightsForGame(gameId: number, url: URL, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`
    SELECT ${HIGHLIGHT_COLS}, h.game_id
    FROM highlights h
    LEFT JOIN players p ON p.id = h.scorer_id
    WHERE h.game_id = ?
    ORDER BY h.period, h.time_in_period
  `).bind(gameId).all();

  const baseUrl = new URL(url).origin;
  return json(results.map((r) => highlightRow(r as any, baseUrl)));
}

async function handleHighlightForEvent(eventId: number, gameId: number, env: Env): Promise<Response> {
  const row = await env.DB.prepare(`
    SELECT ${HIGHLIGHT_COLS}, h.game_id
    FROM highlights h
    LEFT JOIN players p ON p.id = h.scorer_id
    WHERE h.event_id = ? AND h.game_id = ?
  `).bind(eventId, gameId).first();

  if (!row) return json({ error: 'not found' }, { status: 404 });
  return json(row);
}

async function handleHighlightStream(gameId: number, eventId: number, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT r2_key FROM highlights WHERE game_id = ? AND event_id = ?'
  ).bind(gameId, eventId).first<{ r2_key: string }>();

  if (!row?.r2_key) return new Response('not found', { status: 404 });

  const object = await env.HIGHLIGHTS.get(row.r2_key);
  if (!object) return new Response('not found in R2', { status: 404 });

  return new Response(object.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ---------------------------------------------------------------------------
// Nightly cron  (6am UTC — runs after overnight games finish)
// ---------------------------------------------------------------------------

async function runNightlyIngest(env: Env): Promise<void> {
  const { runNightly } = await import('../src/ingest/nightly.js');
  await runNightly(env.DB, env.HIGHLIGHTS);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default {
  fetch: handleRequest,
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runNightlyIngest(env);
  },
};
