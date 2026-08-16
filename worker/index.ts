import { NHL_TEAMS } from '../src/nhl/constants.js';

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
        'Access-Control-Allow-Headers': 'Content-Type, Range',
      },
    });
  }

  if (url.pathname === '/api/health') {
    return json({ status: 'ok', app: 'forecheck' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // GET /api/games?season=&team=&date=
  if (url.pathname === '/api/games' && request.method === 'GET') {
    return handleGames(url, env);
  }

  // GET /api/games/:id
  const gameMatch = url.pathname.match(/^\/api\/games\/(\d+)$/);
  if (gameMatch && request.method === 'GET') {
    return handleGame(Number(gameMatch[1]), url, env);
  }

  // GET /api/players?q=&team=&position=
  if (url.pathname === '/api/players' && request.method === 'GET') {
    return handlePlayers(url, env);
  }

  // GET /api/players/:id
  const explorerPlayerMatch = url.pathname.match(/^\/api\/players\/(\d+)$/);
  if (explorerPlayerMatch && request.method === 'GET') {
    return handlePlayer(Number(explorerPlayerMatch[1]), url, env);
  }

  // GET /api/teams and /api/teams/:id
  if (url.pathname === '/api/teams' && request.method === 'GET') {
    return handleTeams(env);
  }
  const teamMatch = url.pathname.match(/^\/api\/teams\/(\d+)$/);
  if (teamMatch && request.method === 'GET') {
    return handleTeam(Number(teamMatch[1]), url, env);
  }

  // GET /api/highlights?season=&team=&player=&limit=&cursor=
  if (url.pathname === '/api/highlights' && request.method === 'GET') {
    return handleHighlights(url, env);
  }

  // GET /api/search/transcripts?q=&mode=keyword
  if (url.pathname === '/api/search/transcripts' && request.method === 'GET') {
    return handleTranscriptSearch(url, env);
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
    return handleHighlightStream(Number(streamMatch[1]), Number(streamMatch[2]), request, env);
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
// Explorer API
// ---------------------------------------------------------------------------

function parseLimit(url: URL, fallback: number, maximum: number): number {
  const value = Number(url.searchParams.get('limit') ?? fallback);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function teamIdFromParam(value: string | null): number | null | undefined {
  if (value === null || value === '') return undefined;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  return NHL_TEAMS.find((team) => team.abbreviation.toLowerCase() === value.toLowerCase())?.id ?? null;
}

function teamMetadata(id: number) {
  return NHL_TEAMS.find((team) => team.id === id);
}

async function handleGames(url: URL, env: Env): Promise<Response> {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  const season = url.searchParams.get('season');
  const date = url.searchParams.get('date');
  const teamId = teamIdFromParam(url.searchParams.get('team'));
  if (teamId === null) return json({ error: 'unknown team' }, { status: 400 });

  if (season) {
    clauses.push('g.season = ?');
    values.push(season);
  }
  if (date) {
    clauses.push('g.game_date = ?');
    values.push(date);
  }
  if (teamId !== undefined) {
    clauses.push('(g.home_team_id = ? OR g.away_team_id = ?)');
    values.push(teamId, teamId);
  }

  const limit = parseLimit(url, 100, 500);
  values.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(`
    SELECT g.*
    FROM games g
    ${where}
    ORDER BY g.game_date DESC, g.id DESC
    LIMIT ?
  `).bind(...values).all();

  return json(results);
}

async function handleGame(gameId: number, url: URL, env: Env): Promise<Response> {
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first();
  if (!game) return json({ error: 'not found' }, { status: 404 });

  const gameQueries = await env.DB.batch([
    env.DB.prepare(`
      SELECT e.*
      FROM events e
      WHERE e.game_id = ?
      ORDER BY e.seconds_elapsed, e.event_id
    `).bind(gameId),
    env.DB.prepare(`
      SELECT ${HIGHLIGHT_COLS}, h.game_id, t.transcript, t.model AS transcript_model
      FROM highlights h
      LEFT JOIN players p ON p.id = h.scorer_id
      LEFT JOIN transcripts t ON t.game_id = h.game_id AND t.event_id = h.event_id
      WHERE h.game_id = ?
      ORDER BY h.period, h.time_in_period, h.event_id
    `).bind(gameId),
  ]);
  const eventsQuery = gameQueries[0]!;
  const highlightsQuery = gameQueries[1]!;

  return json({
    ...game,
    events: eventsQuery.results,
    highlights: highlightsQuery.results.map((row) =>
      highlightRow(row as Record<string, unknown>, url.origin)),
  });
}

async function handlePlayers(url: URL, env: Env): Promise<Response> {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  const query = url.searchParams.get('q')?.trim();
  const position = url.searchParams.get('position')?.trim().toUpperCase();
  const teamId = teamIdFromParam(url.searchParams.get('team'));
  if (teamId === null) return json({ error: 'unknown team' }, { status: 400 });

  if (query) {
    clauses.push("(p.first_name || ' ' || p.last_name LIKE ? OR p.last_name LIKE ?)");
    values.push(`%${query}%`, `%${query}%`);
  }
  if (teamId !== undefined) {
    clauses.push('p.current_team_id = ?');
    values.push(teamId);
  }
  if (position) {
    clauses.push('p.position_code = ?');
    values.push(position);
  }

  const limit = parseLimit(url, 100, 500);
  values.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(`
    SELECT p.*
    FROM players p
    ${where}
    ORDER BY p.last_name, p.first_name, p.id
    LIMIT ?
  `).bind(...values).all();

  return json(results);
}

async function handlePlayer(playerId: number, url: URL, env: Env): Promise<Response> {
  const player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first();
  if (!player) return json({ error: 'not found' }, { status: 404 });

  const playerQueries = await env.DB.batch([
    env.DB.prepare(`
      SELECT * FROM player_ratings
      WHERE player_id = ?
      ORDER BY season DESC
    `).bind(playerId),
    env.DB.prepare(`
      SELECT
        e.game_id,
        e.event_id,
        e.period,
        e.time_in_period,
        e.seconds_elapsed,
        e.owner_team_id,
        e.shot_type,
        e.x_coord,
        e.y_coord,
        e.xg,
        g.season,
        g.game_date,
        g.home_team_id,
        g.away_team_id,
        g.home_score,
        g.away_score,
        h.r2_key,
        h.brightcove_clip_id,
        t.transcript,
        t.model AS transcript_model
      FROM events e
      JOIN games g ON g.id = e.game_id
      LEFT JOIN highlights h ON h.game_id = e.game_id AND h.event_id = e.event_id
      LEFT JOIN transcripts t ON t.game_id = e.game_id AND t.event_id = e.event_id
      WHERE e.type_code = 505 AND e.scoring_player_id = ?
      ORDER BY g.game_date DESC, e.seconds_elapsed
    `).bind(playerId),
  ]);
  const ratingsQuery = playerQueries[0]!;
  const goalsQuery = playerQueries[1]!;

  return json({
    ...player,
    ratings: ratingsQuery.results,
    goals: goalsQuery.results.map((row) =>
      highlightRow(row as Record<string, unknown>, url.origin)),
  });
}

type TeamAggregate = {
  team_id: number;
  games_played: number;
  wins: number;
  losses: number;
  goals_for: number;
  goals_against: number;
};

type TeamPlayerCount = { team_id: number; player_count: number };

const TEAM_AGGREGATES_SQL = `
  SELECT
    team_id,
    COUNT(*) AS games_played,
    SUM(CASE WHEN goals_for > goals_against THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN goals_for < goals_against THEN 1 ELSE 0 END) AS losses,
    SUM(goals_for) AS goals_for,
    SUM(goals_against) AS goals_against
  FROM (
    SELECT home_team_id AS team_id, home_score AS goals_for, away_score AS goals_against FROM games
    UNION ALL
    SELECT away_team_id AS team_id, away_score AS goals_for, home_score AS goals_against FROM games
  )
  GROUP BY team_id
`;

async function handleTeams(env: Env): Promise<Response> {
  const teamQueries = await env.DB.batch([
    env.DB.prepare(TEAM_AGGREGATES_SQL),
    env.DB.prepare(`
      SELECT current_team_id AS team_id, COUNT(*) AS player_count
      FROM players
      WHERE current_team_id IS NOT NULL
      GROUP BY current_team_id
    `),
  ]);
  const aggregateQuery = teamQueries[0]!;
  const playerQuery = teamQueries[1]!;
  const aggregates = new Map(
    (aggregateQuery.results as TeamAggregate[]).map((row) => [row.team_id, row]),
  );
  const playerCounts = new Map(
    (playerQuery.results as TeamPlayerCount[]).map((row) => [row.team_id, row.player_count]),
  );

  return json(NHL_TEAMS.map((team) => ({
    ...team,
    player_count: playerCounts.get(team.id) ?? 0,
    games_played: aggregates.get(team.id)?.games_played ?? 0,
    wins: aggregates.get(team.id)?.wins ?? 0,
    losses: aggregates.get(team.id)?.losses ?? 0,
    goals_for: aggregates.get(team.id)?.goals_for ?? 0,
    goals_against: aggregates.get(team.id)?.goals_against ?? 0,
  })));
}

async function handleTeam(teamId: number, url: URL, env: Env): Promise<Response> {
  const team = teamMetadata(teamId);
  if (!team) return json({ error: 'not found' }, { status: 404 });

  const season = url.searchParams.get('season');
  const gameSeasonClause = season ? 'AND season = ?' : '';
  const gameParams: Array<string | number> = [teamId, teamId];
  if (season) gameParams.push(season);

  const detailQueries = await env.DB.batch([
    env.DB.prepare(`
      SELECT * FROM players
      WHERE current_team_id = ?
      ORDER BY position_code, last_name, first_name
    `).bind(teamId),
    env.DB.prepare(`
      SELECT * FROM games
      WHERE (home_team_id = ? OR away_team_id = ?) ${gameSeasonClause}
      ORDER BY game_date DESC, id DESC
    `).bind(...gameParams),
    env.DB.prepare(`${TEAM_AGGREGATES_SQL} HAVING team_id = ?`).bind(teamId),
  ]);
  const playersQuery = detailQueries[0]!;
  const gamesQuery = detailQueries[1]!;
  const aggregateQuery = detailQueries[2]!;

  return json({
    ...team,
    aggregate: aggregateQuery.results[0] ?? {
      games_played: 0,
      wins: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
    },
    players: playersQuery.results,
    games: gamesQuery.results,
  });
}

async function handleHighlights(url: URL, env: Env): Promise<Response> {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  const season = url.searchParams.get('season');
  const player = url.searchParams.get('player');
  const cursor = url.searchParams.get('cursor');
  const teamId = teamIdFromParam(url.searchParams.get('team'));
  if (teamId === null) return json({ error: 'unknown team' }, { status: 400 });

  if (season) {
    clauses.push('h.season = ?');
    values.push(season);
  }
  if (teamId !== undefined) {
    clauses.push('(h.team_id = ? OR (h.team_id IS NULL AND p.current_team_id = ?))');
    values.push(teamId, teamId);
  }
  if (player) {
    const playerId = Number(player);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return json({ error: 'player must be a positive integer' }, { status: 400 });
    }
    clauses.push('h.scorer_id = ?');
    values.push(playerId);
  }
  if (cursor) {
    const cursorId = Number(cursor);
    if (!Number.isInteger(cursorId) || cursorId <= 0) {
      return json({ error: 'invalid cursor' }, { status: 400 });
    }
    clauses.push('h.id < ?');
    values.push(cursorId);
  }

  const limit = parseLimit(url, 50, 200);
  values.push(limit + 1);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(`
    SELECT
      h.id,
      ${HIGHLIGHT_COLS},
      h.game_id,
      g.game_date,
      g.home_team_id,
      g.away_team_id,
      g.home_score,
      g.away_score,
      t.transcript,
      t.model AS transcript_model
    FROM highlights h
    JOIN games g ON g.id = h.game_id
    LEFT JOIN players p ON p.id = h.scorer_id
    LEFT JOIN transcripts t ON t.game_id = h.game_id AND t.event_id = h.event_id
    ${where}
    ORDER BY h.id DESC
    LIMIT ?
  `).bind(...values).all<Record<string, unknown>>();

  const hasMore = results.length > limit;
  const page = results.slice(0, limit).map((row) => highlightRow(row, url.origin));
  const last = page.at(-1);
  return json({
    results: page,
    next_cursor: hasMore && last ? String(last['id']) : null,
  });
}

function ftsQuery(raw: string): string | null {
  const parts = raw.match(/"[^"]*"|[^\s"]+/g) ?? [];
  const terms = parts
    .map((part) => part.startsWith('"') ? part.slice(1, -1) : part)
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' ');
}

async function handleTranscriptSearch(url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q')?.trim();
  if (!query) return json({ error: 'q required' }, { status: 400 });
  const mode = url.searchParams.get('mode') ?? 'keyword';
  if (mode !== 'keyword') {
    return json({ error: 'only keyword mode is available' }, { status: 400 });
  }
  const match = ftsQuery(query);
  if (!match) return json({ error: 'q must contain searchable text' }, { status: 400 });
  const limit = parseLimit(url, 50, 200);

  const { results } = await env.DB.prepare(`
    SELECT
      t.game_id,
      t.event_id,
      t.transcript,
      t.model,
      bm25(transcripts_fts) AS rank,
      h.period,
      h.time_in_period,
      h.season,
      h.scorer_id,
      h.team_id,
      h.r2_key,
      p.first_name,
      p.last_name,
      g.game_date,
      g.home_team_id,
      g.away_team_id
    FROM transcripts_fts
    JOIN transcripts t ON t.id = transcripts_fts.rowid
    JOIN highlights h ON h.game_id = t.game_id AND h.event_id = t.event_id
    JOIN games g ON g.id = t.game_id
    LEFT JOIN players p ON p.id = h.scorer_id
    WHERE transcripts_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).bind(match, limit).all<Record<string, unknown>>();

  return json({
    mode,
    results: results.map((row) => highlightRow(row, url.origin)),
  });
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
  h.scorer_id,
  h.team_id,
  p.first_name,
  p.last_name
`;

function highlightRow(row: Record<string, unknown>, baseUrl: string): Record<string, unknown> {
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
  return json(results.map((row) => highlightRow(row, baseUrl)));
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

type ByteRange = { offset: number; length: number; end: number };

function parseByteRange(header: string, size: number): ByteRange | null {
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (match[1] === '' && match[2] === '')) return null;

  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length, end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) return null;

  const end = Math.min(requestedEnd, size - 1);
  return { offset: start, length: end - start + 1, end };
}

async function handleHighlightStream(
  gameId: number,
  eventId: number,
  request: Request,
  env: Env,
): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT r2_key FROM highlights WHERE game_id = ? AND event_id = ?'
  ).bind(gameId, eventId).first<{ r2_key: string }>();

  if (!row?.r2_key) return new Response('not found', { status: 404 });

  const rangeHeader = request.headers.get('Range');
  const commonHeaders = {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'public, max-age=31536000',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
  };

  if (rangeHeader) {
    const metadata = await env.HIGHLIGHTS.head(row.r2_key);
    if (!metadata) return new Response('not found in R2', { status: 404 });
    const range = parseByteRange(rangeHeader, metadata.size);
    if (!range) {
      return new Response('range not satisfiable', {
        status: 416,
        headers: {
          ...commonHeaders,
          'Content-Range': `bytes */${metadata.size}`,
        },
      });
    }

    const object = await env.HIGHLIGHTS.get(row.r2_key, {
      range: { offset: range.offset, length: range.length },
    });
    if (!object) return new Response('not found in R2', { status: 404 });
    return new Response(object.body, {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Length': String(range.length),
        'Content-Range': `bytes ${range.offset}-${range.end}/${metadata.size}`,
      },
    });
  }

  const object = await env.HIGHLIGHTS.get(row.r2_key);
  if (!object) return new Response('not found in R2', { status: 404 });
  return new Response(object.body, {
    headers: {
      ...commonHeaders,
      'Content-Length': String(object.size),
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
