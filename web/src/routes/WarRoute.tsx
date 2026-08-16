import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { fetchWarLeaderboard } from '@web/api';
import { Layout } from '@web/components/Layout';

const defaultSeason = '20242025';
const currentYear = new Date().getFullYear();
const seasons = Array.from(new Set([defaultSeason, ...Array.from({ length: 8 }, (_, index) => `${currentYear - index}${currentYear - index + 1}`)])).sort().reverse();
const seasonLabel = (season: string) => `${season.slice(0, 4)}–${season.slice(4)}`;
const war = (value: number | null) => value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

export function WarRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const season = searchParams.get('season') ?? defaultSeason;
  const query = useQuery({ queryKey: ['war-leaderboard', season], queryFn: () => fetchWarLeaderboard(season) });

  return <Layout header={<><strong>FORECHECK</strong><span>WAR leaderboard</span></>} footer={<><button className="brand-button" onClick={() => window.dispatchEvent(new Event('open-cmdk'))}>● forecheck</button><span><kbd>⌘K</kbd> menu · ratings for {seasonLabel(season)}</span></>}>
    <section className="pane leaderboard-pane">
      <div className="leaderboard-header"><div><span className="eyebrow">Player value</span><h1>WAR leaderboard</h1></div><label><span>Season</span><select value={season} onChange={(event) => navigate(`/war?season=${event.target.value}`)}>{seasons.map((item) => <option key={item} value={item}>{seasonLabel(item)}</option>)}</select></label></div>
      <div className="leaderboard-table" role="table" aria-label="WAR leaderboard">
        <div className="leaderboard-row leaderboard-columns" role="row"><span>#</span><span>Player</span><span>Pos</span><span>GP</span><span>EV OFF</span><span>EV DEF</span><span>PP</span><span>PK</span><span>Total</span></div>
        {query.status === 'pending' && <p className="empty-state">Loading leaderboard…</p>}
        {query.status === 'error' && <p className="empty-state error">{query.error instanceof Error ? query.error.message : String(query.error)}</p>}
        {query.data?.map((player, index) => <Link className="leaderboard-row" role="row" key={player.player_id} to={`/players/${player.player_id}`}><span>{index + 1}</span><strong>{player.first_name} {player.last_name}</strong><span>{player.position_code}</span><span>{player.games_played ?? '—'}</span><span>{war(player.ev_offense_war)}</span><span>{war(player.ev_defense_war)}</span><span>{war(player.pp_war)}</span><span>{war(player.pk_war)}</span><b>{war(player.total_war)}</b></Link>)}
        {query.status === 'success' && query.data.length === 0 && <p className="empty-state">No ratings for this season.</p>}
      </div>
    </section>
  </Layout>;
}
