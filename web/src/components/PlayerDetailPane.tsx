import { HighlightCard } from '@web/components/HighlightCard';
import { WarChart } from '@web/components/WarChart';
import { teamAbbreviation } from '@web/teams';
import type { PlayerDetail } from '@web/types';

type Props = {
  player: PlayerDetail | undefined;
  selectedPlayerId: string | null;
  status: 'pending' | 'error' | 'success';
  error: string | null;
};

const warValue = (value: number | null) => value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
const seasonLabel = (season: number) => `${String(season).slice(0, 4)}–${String(season).slice(4)}`;

export function PlayerDetailPane({ player, selectedPlayerId, status, error }: Props) {
  const currentRating = player?.ratings.find((rating) => rating.total_war !== null) ?? player?.ratings[0];
  return (
    <section className="pane entity-detail-pane">
      {!selectedPlayerId && <p className="empty-state">Select a player.</p>}
      {selectedPlayerId && status === 'pending' && <p className="empty-state">Loading player details…</p>}
      {selectedPlayerId && status === 'error' && <p className="empty-state error">{error}</p>}
      {player && <>
        <header className="entity-detail-header"><div><span className="eyebrow">{teamAbbreviation(player.current_team_id)} · {player.position_code} · #{player.id}</span><h1>{player.first_name} {player.last_name}</h1></div>{currentRating && <div className="hero-stat"><strong>{warValue(currentRating.total_war)}</strong><span>WAR</span></div>}</header>
        <div className="detail-scroll entity-detail-scroll">
          <section className="detail-section">
            <div className="section-heading"><h2>WAR components</h2><span>{currentRating ? `${seasonLabel(currentRating.season)} · ${currentRating.games_played ?? '—'} GP` : 'No ratings'}</span></div>
            {currentRating ? <><WarChart rating={currentRating} /><div className="rating-history"><span>Season</span><span>GP</span><span>Total WAR</span>{player.ratings.map((rating) => <div className="rating-row" key={rating.id}><span>{seasonLabel(rating.season)}</span><span>{rating.games_played ?? '—'}</span><strong>{warValue(rating.total_war)}</strong></div>)}</div></> : <p className="empty-state">No WAR ratings available.</p>}
          </section>
          <section className="detail-section">
            <div className="section-heading"><h2>Goal log</h2><span>{player.goals.length} goals</span></div>
            {player.goals.length === 0 && <p className="empty-state">No goals collected.</p>}
            <div className="clip-grid">{player.goals.map((goal) => <HighlightCard key={`${goal.game_id}:${goal.event_id}`} highlight={goal} title={`${player.first_name} ${player.last_name}`} />)}</div>
          </section>
        </div>
      </>}
    </section>
  );
}
