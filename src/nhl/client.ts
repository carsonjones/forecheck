import { BaseURLStats, BaseURLWeb, type SortOrder } from './constants.js';
import { formatDate, getCurrentSeasonId } from './formatters.js';
import type {
  FilteredScoreboardResponse,
  Game,
  GameLandingResponse,
  PlayByPlayResponse,
  ShiftChartsResponse,
  StandingsResponse,
  TeamInfo,
  TeamScheduleResponse,
  TeamsResponse,
} from './models.js';

type HttpResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type HttpClient = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<HttpResponse>;

export class NhlClient {
  private webUrl: string;
  private statsUrl: string;
  private http: HttpClient;
  private teamsCache: TeamsResponse | null = null;

  constructor(options?: { webUrl?: string; statsUrl?: string; httpClient?: HttpClient }) {
    this.webUrl = options?.webUrl ?? BaseURLWeb;
    this.statsUrl = options?.statsUrl ?? BaseURLStats;
    this.http =
      options?.httpClient ?? ((input, init) => fetch(input, init) as Promise<HttpResponse>);
  }

  private async get<T>(baseUrl: string, path: string): Promise<T> {
    const url = `${baseUrl}${path}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.http(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 429) {
        const delay = 1000 * 2 ** attempt; // 1s, 2s, 4s, 8s
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return (await response.json()) as T;
    }
    throw new Error(`HTTP 429 (rate limited after retries) for ${url}`);
  }

  private web<T>(path: string) {
    return this.get<T>(this.webUrl, path);
  }

  private stats<T>(path: string) {
    return this.get<T>(this.statsUrl, path);
  }

  // ---------------------------------------------------------------------------
  // Schedule
  // ---------------------------------------------------------------------------

  async getScheduleByDate(date: string, sortOrder: SortOrder = 'asc'): Promise<FilteredScoreboardResponse> {
    const path = sortOrder === 'desc' ? `/score/${date}?sort=desc` : `/score/${date}`;
    const response = await this.web<FilteredScoreboardResponse>(path);
    return { ...response, date };
  }

  async getScheduleToday(): Promise<FilteredScoreboardResponse> {
    return this.getScheduleByDate(formatDate(new Date()));
  }

  async getTeamScheduleSeason(teamAbbrev: string, seasonId?: number): Promise<TeamScheduleResponse> {
    const season = seasonId ?? getCurrentSeasonId();
    return this.web<TeamScheduleResponse>(`/club-schedule-season/${teamAbbrev}/${season}`);
  }

  // ---------------------------------------------------------------------------
  // Game data
  // ---------------------------------------------------------------------------

  async getGamePlayByPlay(gameId: number): Promise<PlayByPlayResponse> {
    return this.web<PlayByPlayResponse>(`/gamecenter/${gameId}/play-by-play`);
  }

  // ---------------------------------------------------------------------------
  // Shift charts  (stats API)
  // ---------------------------------------------------------------------------

  async getGameLanding(gameId: number): Promise<GameLandingResponse> {
    return this.web<GameLandingResponse>(`/gamecenter/${gameId}/landing`);
  }

  async getShiftCharts(gameId: number): Promise<ShiftChartsResponse> {
    return this.stats<ShiftChartsResponse>(
      `/shiftcharts?cayenneExp=gameId=${gameId}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Standings
  // ---------------------------------------------------------------------------

  async getStandings(): Promise<StandingsResponse> {
    return this.web<StandingsResponse>('/standings/now');
  }

  async getStandingsByDate(date: string): Promise<StandingsResponse> {
    return this.web<StandingsResponse>(`/standings/${date}`);
  }

  // ---------------------------------------------------------------------------
  // Teams
  // ---------------------------------------------------------------------------

  async getTeams(): Promise<TeamsResponse> {
    if (this.teamsCache) return this.teamsCache;

    const teamData: Array<{ id: number; abbr: string; name: string; city: string }> = [
      { id: 1, abbr: 'NJD', name: 'New Jersey Devils', city: 'New Jersey' },
      { id: 2, abbr: 'NYI', name: 'New York Islanders', city: 'New York' },
      { id: 3, abbr: 'NYR', name: 'New York Rangers', city: 'New York' },
      { id: 4, abbr: 'PHI', name: 'Philadelphia Flyers', city: 'Philadelphia' },
      { id: 5, abbr: 'PIT', name: 'Pittsburgh Penguins', city: 'Pittsburgh' },
      { id: 6, abbr: 'BOS', name: 'Boston Bruins', city: 'Boston' },
      { id: 7, abbr: 'BUF', name: 'Buffalo Sabres', city: 'Buffalo' },
      { id: 8, abbr: 'MTL', name: 'Montreal Canadiens', city: 'Montreal' },
      { id: 9, abbr: 'OTT', name: 'Ottawa Senators', city: 'Ottawa' },
      { id: 10, abbr: 'TOR', name: 'Toronto Maple Leafs', city: 'Toronto' },
      { id: 12, abbr: 'CAR', name: 'Carolina Hurricanes', city: 'Carolina' },
      { id: 13, abbr: 'FLA', name: 'Florida Panthers', city: 'Florida' },
      { id: 14, abbr: 'TBL', name: 'Tampa Bay Lightning', city: 'Tampa Bay' },
      { id: 15, abbr: 'WSH', name: 'Washington Capitals', city: 'Washington' },
      { id: 16, abbr: 'CHI', name: 'Chicago Blackhawks', city: 'Chicago' },
      { id: 17, abbr: 'DET', name: 'Detroit Red Wings', city: 'Detroit' },
      { id: 18, abbr: 'NSH', name: 'Nashville Predators', city: 'Nashville' },
      { id: 19, abbr: 'STL', name: 'St. Louis Blues', city: 'St. Louis' },
      { id: 20, abbr: 'CGY', name: 'Calgary Flames', city: 'Calgary' },
      { id: 21, abbr: 'COL', name: 'Colorado Avalanche', city: 'Colorado' },
      { id: 22, abbr: 'EDM', name: 'Edmonton Oilers', city: 'Edmonton' },
      { id: 23, abbr: 'VAN', name: 'Vancouver Canucks', city: 'Vancouver' },
      { id: 24, abbr: 'ANA', name: 'Anaheim Ducks', city: 'Anaheim' },
      { id: 25, abbr: 'DAL', name: 'Dallas Stars', city: 'Dallas' },
      { id: 26, abbr: 'LAK', name: 'Los Angeles Kings', city: 'Los Angeles' },
      { id: 28, abbr: 'SJS', name: 'San Jose Sharks', city: 'San Jose' },
      { id: 29, abbr: 'CBJ', name: 'Columbus Blue Jackets', city: 'Columbus' },
      { id: 30, abbr: 'MIN', name: 'Minnesota Wild', city: 'Minnesota' },
      { id: 52, abbr: 'WPG', name: 'Winnipeg Jets', city: 'Winnipeg' },
      { id: 53, abbr: 'ARI', name: 'Arizona Coyotes', city: 'Arizona' },
      { id: 54, abbr: 'VGK', name: 'Vegas Golden Knights', city: 'Vegas' },
      { id: 55, abbr: 'SEA', name: 'Seattle Kraken', city: 'Seattle' },
      { id: 59, abbr: 'UTA', name: 'Utah Hockey Club', city: 'Utah' },
    ];

    this.teamsCache = {
      teams: teamData.map((t) => ({
        id: t.id,
        abbreviation: t.abbr,
        triCode: t.abbr,
        name: { default: t.name },
        city: { default: t.city },
        franchiseId: 0,
        active: true,
      })),
    };
    return this.teamsCache;
  }

  async getTeamByIdentifier(identifier: string): Promise<TeamInfo> {
    const teams = await this.getTeams();
    const numericId = Number(identifier);
    if (!Number.isNaN(numericId)) {
      const byId = teams.teams.find((t) => t.id === numericId);
      if (byId) return byId;
    }
    const lowered = identifier.toLowerCase();
    const byName = teams.teams.find(
      (t) =>
        t.abbreviation.toLowerCase() === lowered ||
        t.name.default.toLowerCase() === lowered,
    );
    if (!byName) throw new Error(`team not found: ${identifier}`);
    return byName;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** All regular-season game IDs for a given season across all teams (deduplicated). */
  async getSeasonGameIds(seasonId: number): Promise<number[]> {
    const teams = await this.getTeams();
    const ids = new Set<number>();
    for (const team of teams.teams) {
      try {
        const schedule = await this.getTeamScheduleSeason(team.abbreviation, seasonId);
        for (const game of schedule.games) {
          if (game.gameType === 2) ids.add(game.id); // regular season only
        }
      } catch {
        // some defunct teams may 404
      }
    }
    return [...ids];
  }
}
