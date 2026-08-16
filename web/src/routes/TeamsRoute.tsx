import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { fetchTeam, fetchTeamHighlights, fetchTeams } from '@web/api';
import { Layout } from '@web/components/Layout';
import { TeamDetailPane } from '@web/components/TeamDetailPane';
import { TeamsListPane } from '@web/components/TeamsListPane';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : error ? String(error) : null;

export function TeamsRoute() {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [searchParams] = useSearchParams();
  const season = searchParams.get('season') ?? '';
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: fetchTeams });
  const teamQuery = useQuery({ queryKey: ['team', teamId, season], queryFn: () => fetchTeam(teamId!, season), enabled: Boolean(teamId) });
  const highlightsQuery = useQuery({ queryKey: ['team-highlights', teamId, season], queryFn: () => fetchTeamHighlights(teamId!, season), enabled: Boolean(teamId) });
  const suffix = season ? `?season=${season}` : '';

  useEffect(() => {
    if (!teamsQuery.data?.length || teamId) return;
    navigate(`/teams/${teamsQuery.data[0]!.id}${suffix}`, { replace: true });
  }, [navigate, suffix, teamId, teamsQuery.data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ['INPUT', 'SELECT', 'VIDEO'].includes((event.target as HTMLElement).tagName) || !['j', 'k'].includes(event.key)) return;
      const teams = teamsQuery.data ?? [];
      if (!teams.length) return;
      event.preventDefault();
      const current = teams.findIndex((team) => String(team.id) === teamId);
      const next = Math.min(Math.max((current < 0 ? 0 : current) + (event.key === 'j' ? 1 : -1), 0), teams.length - 1);
      navigate(`/teams/${teams[next]!.id}${suffix}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, suffix, teamId, teamsQuery.data]);

  return <Layout header={<><strong>FORECHECK</strong><span>Team explorer</span></>} footer={<><button className="brand-button" onClick={() => window.dispatchEvent(new Event('open-cmdk'))}>● forecheck</button><span><kbd>⌘K</kbd> menu · <kbd>j/k</kbd> select team</span></>}><section className="split-view"><TeamsListPane teams={teamsQuery.data ?? []} status={teamsQuery.status} error={errorMessage(teamsQuery.error)} selectedTeamId={teamId ?? null} onSelect={(id) => navigate(`/teams/${id}${suffix}`)} /><TeamDetailPane team={teamQuery.data} highlights={highlightsQuery.data?.results ?? []} selectedTeamId={teamId ?? null} season={season} status={teamQuery.status} error={errorMessage(teamQuery.error)} highlightsPending={highlightsQuery.isPending} onSeasonChange={(next) => navigate(`/teams/${teamId}${next ? `?season=${next}` : ''}`)} /></section></Layout>;
}
