import { BaseURLStats, BaseURLWeb, NHL_TEAMS, type SortOrder } from './constants.js';
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

    this.teamsCache = {
      teams: NHL_TEAMS.map((t) => ({
        id: t.id,
        abbreviation: t.abbreviation,
        triCode: t.abbreviation,
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
