import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { fetchPlayer, fetchPlayers, fetchTeams } from '@web/api';
import { Layout } from '@web/components/Layout';
import { PlayerDetailPane } from '@web/components/PlayerDetailPane';
import { PlayersListPane } from '@web/components/PlayersListPane';
import type { PlayerFilters } from '@web/types';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : error ? String(error) : null;

export function PlayersRoute() {
  const navigate = useNavigate();
  const { playerId } = useParams();
  const [searchParams] = useSearchParams();
  const filters: PlayerFilters = { query: searchParams.get('q') ?? '', team: searchParams.get('team') ?? '', position: searchParams.get('position') ?? '' };
  const playersQuery = useQuery({ queryKey: ['players', filters.query, filters.team, filters.position], queryFn: () => fetchPlayers(filters) });
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: fetchTeams });
  const playerQuery = useQuery({ queryKey: ['player', playerId], queryFn: () => fetchPlayer(playerId!), enabled: Boolean(playerId) });
  const search = searchParams.toString();
  const routeFor = (id?: number) => `${id ? `/players/${id}` : '/players'}${search ? `?${search}` : ''}`;

  useEffect(() => {
    if (!playersQuery.data?.length || playerId) return;
    navigate(routeFor(playersQuery.data[0]!.id), { replace: true });
  }, [navigate, playerId, playersQuery.data, search]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ['INPUT', 'SELECT', 'VIDEO'].includes((event.target as HTMLElement).tagName) || !['j', 'k'].includes(event.key)) return;
      const players = playersQuery.data ?? [];
      if (!players.length) return;
      event.preventDefault();
      const current = players.findIndex((player) => String(player.id) === playerId);
      const next = Math.min(Math.max((current < 0 ? 0 : current) + (event.key === 'j' ? 1 : -1), 0), players.length - 1);
      navigate(routeFor(players[next]!.id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, playerId, playersQuery.data, search]);

  const updateFilters = (next: PlayerFilters) => {
    const params = new URLSearchParams();
    if (next.query) params.set('q', next.query);
    if (next.team) params.set('team', next.team);
    if (next.position) params.set('position', next.position);
    navigate(`/players${params.size ? `?${params}` : ''}`);
  };

  return <Layout header={<><strong>FORECHECK</strong><span>Player explorer</span></>} footer={<><button className="brand-button" onClick={() => window.dispatchEvent(new Event('open-cmdk'))}>● forecheck</button><span><kbd>⌘K</kbd> menu · <kbd>j/k</kbd> select player</span></>}><section className="split-view"><PlayersListPane players={playersQuery.data ?? []} teams={teamsQuery.data ?? []} filters={filters} status={playersQuery.status} error={errorMessage(playersQuery.error)} selectedPlayerId={playerId ?? null} onFiltersChange={updateFilters} onSelect={(id) => navigate(routeFor(id))} /><PlayerDetailPane player={playerQuery.data} selectedPlayerId={playerId ?? null} status={playerQuery.status} error={errorMessage(playerQuery.error)} /></section></Layout>;
}
