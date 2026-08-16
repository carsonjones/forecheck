import { useEffect, useRef } from 'react';
import type { Team } from '@web/types';

type Props = { teams: Team[]; status: 'pending' | 'error' | 'success'; error: string | null; selectedTeamId: string | null; onSelect: (teamId: number) => void };

export function TeamsListPane({ teams, status, error, selectedTeamId, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => selectedRef.current?.scrollIntoView({ block: 'nearest' }), [selectedTeamId]);
  return <aside className="pane teams-pane"><div className="pane-meta"><span>Teams</span><span>{status === 'success' ? teams.length : '—'}</span></div><div className="entity-list">
    {status === 'pending' && <p className="empty-state">Loading teams…</p>}
    {status === 'error' && <p className="empty-state error">{error}</p>}
    {teams.map((team) => { const active = String(team.id) === selectedTeamId; return <button ref={active ? selectedRef : undefined} key={team.id} className={active ? 'entity-row team-row active' : 'entity-row team-row'} onClick={() => onSelect(team.id)}><span><strong>{team.name}</strong><small>{team.player_count} players · {team.games_played} games</small></span><b>{team.abbreviation}</b></button>; })}
  </div></aside>;
}
