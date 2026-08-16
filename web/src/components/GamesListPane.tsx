import { useEffect, useRef } from 'react';
import { teamAbbreviation } from '@web/teams';
import type { Game, GameFilters } from '@web/types';

const currentYear = new Date().getFullYear();
const seasons = Array.from({ length: 7 }, (_, index) => {
  const start = currentYear - index;
  return `${start}${start + 1}`;
});

const seasonLabel = (season: string) => `${season.slice(0, 4)}–${season.slice(4)}`;

function gameScore(game: Game): string {
  if (game.away_score === null || game.home_score === null) return '—';
  return `${game.away_score}–${game.home_score}`;
}

type Props = {
  games: Game[];
  filters: GameFilters;
  status: 'pending' | 'error' | 'success';
  error: string | null;
  selectedGameId: string | null;
  onFiltersChange: (filters: GameFilters) => void;
  onSelect: (gameId: number) => void;
};

export function GamesListPane({ games, filters, status, error, selectedGameId, onFiltersChange, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedGameId]);

  return (
    <aside className="pane games-pane">
      <div className="filters">
        <label>
          <span>Season</span>
          <select value={filters.season} onChange={(event) => onFiltersChange({ ...filters, season: event.target.value })}>
            <option value="">All seasons</option>
            {seasons.map((season) => <option key={season} value={season}>{seasonLabel(season)}</option>)}
          </select>
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={filters.date} onChange={(event) => onFiltersChange({ ...filters, date: event.target.value })} />
        </label>
        {(filters.season || filters.date) && (
          <button className="text-button" onClick={() => onFiltersChange({ season: '', date: '' })}>clear filters</button>
        )}
      </div>
      <div className="pane-meta"><span>Games</span><span>{status === 'success' ? games.length : '—'}</span></div>
      <div className="game-list">
        {status === 'pending' && <p className="empty-state">Loading games…</p>}
        {status === 'error' && <p className="empty-state error">{error}</p>}
        {status === 'success' && games.length === 0 && <p className="empty-state">No games match these filters.</p>}
        {games.map((game) => {
          const active = String(game.id) === selectedGameId;
          return (
            <button
              key={game.id}
              ref={active ? selectedRef : undefined}
              className={active ? 'game-row active' : 'game-row'}
              onClick={() => onSelect(game.id)}
            >
              <span className="game-row-main">
                <strong>{teamAbbreviation(game.away_team_id)} @ {teamAbbreviation(game.home_team_id)}</strong>
                <small>{game.game_date}</small>
              </span>
              <span className="score">{gameScore(game)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
