import { Link } from 'react-router';
import { teamAbbreviation } from '@web/teams';
import type { Highlight, HighlightFeedItem, PlayerGoal } from '@web/types';

type Props = {
  highlight: Highlight | HighlightFeedItem | PlayerGoal;
  title?: string;
  showGame?: boolean;
};

function hasGameContext(highlight: Props['highlight']): highlight is HighlightFeedItem | PlayerGoal {
  return 'game_date' in highlight;
}

export function HighlightCard({ highlight, title, showGame = true }: Props) {
  const scorer = [highlight.first_name, highlight.last_name].filter(Boolean).join(' ');
  return (
    <article className="clip compact-clip">
      <div className="clip-heading">
        <div>
          <strong>{title || scorer || 'Goal highlight'}</strong>
          {showGame && hasGameContext(highlight) && (
            <Link to={`/games/${highlight.game_id}`}>
              {teamAbbreviation(highlight.away_team_id)} @ {teamAbbreviation(highlight.home_team_id)} · {highlight.game_date}
            </Link>
          )}
        </div>
        <span>{teamAbbreviation(highlight.team_id)} · P{highlight.period} {highlight.time_in_period}</span>
      </div>
      {highlight.stream_url ? (
        <video controls playsInline preload="none" src={highlight.stream_url}>Your browser does not support HTML video.</video>
      ) : <p className="clip-unavailable">Video is not available.</p>}
      {highlight.transcript && (
        <div className="transcript"><span>Transcript</span><p>{highlight.transcript}</p></div>
      )}
    </article>
  );
}
