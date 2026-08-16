import type {
  Game,
  GameDetail,
  GameFilters,
  HighlightPage,
  Player,
  PlayerDetail,
  PlayerFilters,
  Team,
  TeamDetail,
  WarPlayer,
} from '@web/types';

async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response;

  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json() as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // Keep the status-based message when the response is not JSON.
  }
  throw new Error(message);
}

export async function fetchGames(filters: GameFilters): Promise<Game[]> {
  const url = new URL('/api/games', window.location.origin);
  if (filters.season) url.searchParams.set('season', filters.season);
  if (filters.date) url.searchParams.set('date', filters.date);
  url.searchParams.set('limit', '500');
  const response = await ensureOk(await fetch(url));
  return await response.json() as Game[];
}

export async function fetchGame(gameId: string): Promise<GameDetail> {
  const response = await ensureOk(await fetch(`/api/games/${encodeURIComponent(gameId)}`));
  return await response.json() as GameDetail;
}

export async function fetchPlayers(filters: PlayerFilters): Promise<Player[]> {
  const url = new URL('/api/players', window.location.origin);
  if (filters.query) url.searchParams.set('q', filters.query);
  if (filters.team) url.searchParams.set('team', filters.team);
  if (filters.position) url.searchParams.set('position', filters.position);
  url.searchParams.set('limit', '500');
  const response = await ensureOk(await fetch(url));
  return await response.json() as Player[];
}

export async function fetchPlayer(playerId: string): Promise<PlayerDetail> {
  const response = await ensureOk(await fetch(`/api/players/${encodeURIComponent(playerId)}`));
  return await response.json() as PlayerDetail;
}

export async function fetchWarLeaderboard(season: string): Promise<WarPlayer[]> {
  const url = new URL('/api/war/players', window.location.origin);
  url.searchParams.set('season', season);
  url.searchParams.set('limit', '200');
  const response = await ensureOk(await fetch(url));
  return await response.json() as WarPlayer[];
}

export async function fetchTeams(): Promise<Team[]> {
  const response = await ensureOk(await fetch('/api/teams'));
  return await response.json() as Team[];
}

export async function fetchTeam(teamId: string, season: string): Promise<TeamDetail> {
  const url = new URL(`/api/teams/${encodeURIComponent(teamId)}`, window.location.origin);
  if (season) url.searchParams.set('season', season);
  const response = await ensureOk(await fetch(url));
  return await response.json() as TeamDetail;
}

export async function fetchTeamHighlights(teamId: string, season: string): Promise<HighlightPage> {
  const url = new URL('/api/highlights', window.location.origin);
  url.searchParams.set('team', teamId);
  if (season) url.searchParams.set('season', season);
  url.searchParams.set('limit', '12');
  const response = await ensureOk(await fetch(url));
  return await response.json() as HighlightPage;
}
