import type { Game, GameDetail, GameFilters } from '@web/types';

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
