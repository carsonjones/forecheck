import { EventTimeline } from '@web/components/EventTimeline';
import { teamAbbreviation } from '@web/teams';
import type { GameDetail } from '@web/types';

type Props = {
  game: GameDetail | undefined;
  selectedGameId: string | null;
  status: 'pending' | 'error' | 'success';
  error: string | null;
};

export function GameDetailPane({ game, selectedGameId, status, error }: Props) {
  return (
    <section className="pane detail-pane">
      {!selectedGameId && <p className="empty-state">Select a game.</p>}
      {selectedGameId && status === 'pending' && <p className="empty-state">Loading game details…</p>}
      {selectedGameId && status === 'error' && <p className="empty-state error">{error}</p>}
      {game && (
        <>
          <header className="game-detail-header">
            <div>
              <span className="eyebrow">{game.game_date} · {game.season}</span>
              <h1>{teamAbbreviation(game.away_team_id)} <span>@</span> {teamAbbreviation(game.home_team_id)}</h1>
            </div>
            <div className="final-score" aria-label="Score">
              <strong>{game.away_score ?? '—'}</strong><span>–</span><strong>{game.home_score ?? '—'}</strong>
            </div>
          </header>
          <div className="timeline-header">
            <span>Event timeline</span>
            <span>{game.events.length} events · {game.highlights.length} clips</span>
          </div>
          <div className="detail-scroll">
            <EventTimeline events={game.events} highlights={game.highlights} />
          </div>
        </>
      )}
    </section>
  );
}
