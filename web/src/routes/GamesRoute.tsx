import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { fetchGame, fetchGames } from '@web/api';
import { GameDetailPane } from '@web/components/GameDetailPane';
import { GamesListPane } from '@web/components/GamesListPane';
import { Layout } from '@web/components/Layout';
import type { GameFilters } from '@web/types';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : error ? String(error) : null;

export function GamesRoute() {
  const navigate = useNavigate();
  const { gameId } = useParams();
  const [searchParams] = useSearchParams();
  const filters: GameFilters = {
    season: searchParams.get('season') ?? '',
    date: searchParams.get('date') ?? '',
  };

  const gamesQuery = useQuery({
    queryKey: ['games', filters.season, filters.date],
    queryFn: () => fetchGames(filters),
  });
  const gameQuery = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => fetchGame(gameId!),
    enabled: Boolean(gameId),
  });

  const search = searchParams.toString();
  const routeFor = (id?: number) => `${id ? `/games/${id}` : '/games'}${search ? `?${search}` : ''}`;

  useEffect(() => {
    if (!gamesQuery.data?.length || gameId) return;
    navigate(routeFor(gamesQuery.data[0]!.id), { replace: true });
  }, [gameId, gamesQuery.data, navigate, search]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ['INPUT', 'SELECT', 'VIDEO'].includes((event.target as HTMLElement).tagName)) return;
      if (event.key !== 'j' && event.key !== 'k') return;
      const games = gamesQuery.data ?? [];
      if (!games.length) return;
      event.preventDefault();
      const current = games.findIndex((game) => String(game.id) === gameId);
      const delta = event.key === 'j' ? 1 : -1;
      const next = current < 0 ? 0 : Math.min(Math.max(current + delta, 0), games.length - 1);
      navigate(routeFor(games[next]!.id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameId, gamesQuery.data, navigate, search]);

  const updateFilters = (next: GameFilters) => {
    const params = new URLSearchParams();
    if (next.season) params.set('season', next.season);
    if (next.date) params.set('date', next.date);
    navigate(`/games${params.size ? `?${params}` : ''}`);
  };

  return (
    <Layout
      header={<><strong>FORECHECK</strong><span>Game explorer</span></>}
      footer={<><button className="brand-button" onClick={() => window.dispatchEvent(new Event('open-cmdk'))}>● forecheck</button><span><kbd>⌘K</kbd> menu · <kbd>j/k</kbd> select game</span></>}
    >
      <section className="split-view">
        <GamesListPane
          games={gamesQuery.data ?? []}
          filters={filters}
          status={gamesQuery.status}
          error={errorMessage(gamesQuery.error)}
          selectedGameId={gameId ?? null}
          onFiltersChange={updateFilters}
          onSelect={(id) => navigate(routeFor(id))}
        />
        <GameDetailPane
          game={gameQuery.data}
          selectedGameId={gameId ?? null}
          status={gameQuery.status}
          error={errorMessage(gameQuery.error)}
        />
      </section>
    </Layout>
  );
}
