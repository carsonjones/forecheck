import { useEffect, useRef } from 'react';
import { teamAbbreviation } from '@web/teams';
import type { Player, PlayerFilters, Team } from '@web/types';

type Props = {
  players: Player[];
  teams: Team[];
  filters: PlayerFilters;
  status: 'pending' | 'error' | 'success';
  error: string | null;
  selectedPlayerId: string | null;
  onFiltersChange: (filters: PlayerFilters) => void;
  onSelect: (playerId: number) => void;
};

export function PlayersListPane({ players, teams, filters, status, error, selectedPlayerId, onFiltersChange, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => selectedRef.current?.scrollIntoView({ block: 'nearest' }), [selectedPlayerId]);

  return (
    <aside className="pane collection-pane">
      <div className="player-filters">
        <label className="wide-filter"><span>Search</span><input type="search" value={filters.query} placeholder="Player name" onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} /></label>
        <label><span>Team</span><select value={filters.team} onChange={(event) => onFiltersChange({ ...filters, team: event.target.value })}><option value="">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.abbreviation}</option>)}</select></label>
        <label><span>Position</span><select value={filters.position} onChange={(event) => onFiltersChange({ ...filters, position: event.target.value })}><option value="">All</option>{['C', 'L', 'R', 'D', 'G'].map((position) => <option key={position}>{position}</option>)}</select></label>
        {(filters.query || filters.team || filters.position) && <button className="text-button" onClick={() => onFiltersChange({ query: '', team: '', position: '' })}>clear filters</button>}
      </div>
      <div className="pane-meta"><span>Players</span><span>{status === 'success' ? players.length : '—'}</span></div>
      <div className="entity-list">
        {status === 'pending' && <p className="empty-state">Loading players…</p>}
        {status === 'error' && <p className="empty-state error">{error}</p>}
        {status === 'success' && players.length === 0 && <p className="empty-state">No players match these filters.</p>}
        {players.map((player) => {
          const active = String(player.id) === selectedPlayerId;
          return <button key={player.id} ref={active ? selectedRef : undefined} className={active ? 'entity-row active' : 'entity-row'} onClick={() => onSelect(player.id)}><span><strong>{player.first_name} {player.last_name}</strong><small>{teamAbbreviation(player.current_team_id)}</small></span><b>{player.position_code}</b></button>;
        })}
      </div>
    </aside>
  );
}
