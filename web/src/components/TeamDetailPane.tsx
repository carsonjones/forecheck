import { Link } from 'react-router';
import { HighlightCard } from '@web/components/HighlightCard';
import { teamAbbreviation } from '@web/teams';
import type { HighlightFeedItem, TeamDetail } from '@web/types';

type Props = { team: TeamDetail | undefined; highlights: HighlightFeedItem[]; selectedTeamId: string | null; season: string; status: 'pending' | 'error' | 'success'; error: string | null; highlightsPending: boolean; onSeasonChange: (season: string) => void };
const currentYear = new Date().getFullYear();
const seasons = Array.from(new Set(['20242025', ...Array.from({ length: 8 }, (_, index) => `${currentYear - index}${currentYear - index + 1}`)])).sort().reverse();
const seasonLabel = (season: string) => `${season.slice(0, 4)}–${season.slice(4)}`;

export function TeamDetailPane({ team, highlights, selectedTeamId, season, status, error, highlightsPending, onSeasonChange }: Props) {
  const completed = team?.games.filter((game) => game.home_score !== null && game.away_score !== null) ?? [];
  const wins = team ? completed.filter((game) => game.home_team_id === team.id ? game.home_score! > game.away_score! : game.away_score! > game.home_score!).length : 0;
  const goalsFor = team ? completed.reduce((sum, game) => sum + (game.home_team_id === team.id ? game.home_score! : game.away_score!), 0) : 0;
  const goalsAgainst = team ? completed.reduce((sum, game) => sum + (game.home_team_id === team.id ? game.away_score! : game.home_score!), 0) : 0;
  return <section className="pane entity-detail-pane">
    {!selectedTeamId && <p className="empty-state">Select a team.</p>}
    {selectedTeamId && status === 'pending' && <p className="empty-state">Loading team details…</p>}
    {selectedTeamId && status === 'error' && <p className="empty-state error">{error}</p>}
    {team && <><header className="entity-detail-header"><div><span className="eyebrow">{team.city} · #{team.id}</span><h1>{team.name}</h1></div><div className="team-controls"><label><span>Season</span><select value={season} onChange={(event) => onSeasonChange(event.target.value)}><option value="">All seasons</option>{seasons.map((item) => <option key={item} value={item}>{seasonLabel(item)}</option>)}</select></label></div></header>
      <div className="team-stat-strip"><div><strong>{completed.length}</strong><span>GP</span></div><div><strong>{wins}</strong><span>W</span></div><div><strong>{completed.length - wins}</strong><span>L</span></div><div><strong>{goalsFor}</strong><span>GF</span></div><div><strong>{goalsAgainst}</strong><span>GA</span></div></div>
      <div className="detail-scroll entity-detail-scroll">
        <section className="detail-section"><div className="section-heading"><h2>Roster</h2><span>{team.players.length} players</span></div><div className="roster-grid">{team.players.map((player) => <Link to={`/players/${player.id}`} key={player.id}><span><strong>{player.first_name} {player.last_name}</strong><small>{team.abbreviation}</small></span><b>{player.position_code}</b></Link>)}</div></section>
        <section className="detail-section"><div className="section-heading"><h2>Schedule &amp; results</h2><span>{season ? seasonLabel(season) : 'All seasons'} · {team.games.length} games</span></div><div className="schedule-list">{team.games.map((game) => { const home = game.home_team_id === team.id; const teamScore = home ? game.home_score : game.away_score; const opponentScore = home ? game.away_score : game.home_score; const result = teamScore === null || opponentScore === null ? '—' : teamScore > opponentScore ? 'W' : 'L'; return <Link to={`/games/${game.id}`} key={game.id}><time>{game.game_date}</time><span>{home ? 'vs' : '@'} {teamAbbreviation(home ? game.away_team_id : game.home_team_id)}</span><strong className={result === 'W' ? 'win' : result === 'L' ? 'loss' : ''}>{result} {teamScore ?? '—'}–{opponentScore ?? '—'}</strong></Link>; })}{team.games.length === 0 && <p className="empty-state">No games for this season.</p>}</div></section>
        <section className="detail-section"><div className="section-heading"><h2>Highlight reel</h2><span>{highlightsPending ? 'Loading…' : `${highlights.length} latest clips`}</span></div>{!highlightsPending && highlights.length === 0 && <p className="empty-state">No highlights for this season.</p>}<div className="clip-grid">{highlights.map((highlight) => <HighlightCard key={highlight.id} highlight={highlight} />)}</div></section>
      </div>
    </>}
  </section>;
}
