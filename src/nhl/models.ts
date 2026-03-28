// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type LanguageNames = {
  default: string;
  fr?: string;
};

export type NameInfo = {
  default: string;
};

export type Venue = {
  default: string;
};

export type PeriodDescriptor = {
  number: number;
  periodType: string;
  maxRegulationPeriods: number;
};

// ---------------------------------------------------------------------------
// Schedule / game list
// ---------------------------------------------------------------------------

export type Game = {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  startTimeUTC: string;
  gameState: string;
  awayTeam: Team;
  homeTeam: Team;
};

export type Team = {
  id: number;
  abbrev: string;
  score: number;
};

export type FilteredScoreboardResponse = {
  date: string;
  games: Game[];
};

export type TeamScheduleResponse = {
  games: ScheduleGame[];
};

export type ScheduleGame = {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  startTimeUTC: string;
  gameState: string;
  homeTeam: { id: number; abbrev: string; score: number };
  awayTeam: { id: number; abbrev: string; score: number };
};

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export type TeamInfo = {
  id: number;
  name: LanguageNames;
  abbreviation: string;
  city: LanguageNames;
  triCode: string;
  franchiseId: number;
  active: boolean;
};

export type TeamsResponse = {
  teams: TeamInfo[];
};

// ---------------------------------------------------------------------------
// Play-by-play
// ---------------------------------------------------------------------------

export type PlayByPlayResponse = {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  homeTeam: { id: number; abbrev: string; score: number };
  awayTeam: { id: number; abbrev: string; score: number };
  plays: PlayEvent[];
  rosterSpots: RosterSpot[];
};

export type RosterSpot = {
  teamId: number;
  playerId: number;
  firstName: LanguageNames;
  lastName: LanguageNames;
  sweaterNumber: number;
  positionCode: string;
  headshot: string;
};

export type PlayEvent = {
  eventId: number;
  periodDescriptor: PeriodDescriptor;
  timeInPeriod: string;
  timeRemaining: string;
  /** 4-digit code: away_goalies away_skaters home_skaters home_goalies e.g. "1551" = 5v5 */
  situationCode: string;
  typeCode: number;
  typeDescKey: string;
  details: EventDetails;
};

export type EventDetails = {
  eventOwnerTeamId?: number;
  xCoord?: number;
  yCoord?: number;
  zoneCode?: string;
  shotType?: string;
  shootingPlayerId?: number;
  goalieInNetId?: number;
  blockingPlayerId?: number;
  hittingPlayerId?: number;
  hitteePlayerId?: number;
  winningPlayerId?: number;
  losingPlayerId?: number;
  reason?: string;
  typeCode?: string;
  descKey?: string;
  duration?: number;
  committedByPlayerId?: number;
  drawnByPlayerId?: number;
  awaySOG?: number;
  homeSOG?: number;
  scoringPlayerId?: number;
  scoringPlayerTotal?: number;
  assist1PlayerId?: number;
  assist1PlayerTotal?: number;
  assist2PlayerId?: number;
  assist2PlayerTotal?: number;
};

// ---------------------------------------------------------------------------
// Shift charts  (https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=X)
// ---------------------------------------------------------------------------

export type ShiftChartsResponse = {
  data: ShiftRecord[];
  total: number;
};

export type ShiftRecord = {
  id: number;
  gameId: number;
  playerId: number;
  firstName: string;
  lastName: string;
  teamId: number;
  teamAbbrev: string;
  period: number;
  startTime: string; // "MM:SS"
  endTime: string;   // "MM:SS"
  duration: string;  // "MM:SS"
  shiftNumber: number;
  /** 517 = shift, 505 = goal, 802 = stoppage */
  typeCode: number;
  /** "EVG", "PPG", "SHG" when typeCode=505 */
  eventDescription: string | null;
  detailCode: number;
};

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type StandingsResponse = {
  standings: StandingsTeam[];
};

export type StandingsTeam = {
  teamName: LanguageNames;
  teamAbbrev: { default: string };
  conferenceName: string;
  divisionName: string;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  gamesPlayed: number;
  goalFor: number;
  goalAgainst: number;
};

// ---------------------------------------------------------------------------
// Game story  (highlight clips live here)
// ---------------------------------------------------------------------------

export type GoalPlay = {
  eventId: number;
  timeInPeriod: string;     // "MM:SS"
  teamAbbrev: NameInfo;
  playerId: number;
  firstName: NameInfo;
  lastName: NameInfo;
  highlightClip?: number;   // Brightcove clip ID — absent if no clip exists
};

export type ScoringPeriod = {
  periodDescriptor: PeriodDescriptor;
  goals: GoalPlay[];
};

export type GameLandingResponse = {
  id: number;
  season: number;
  summary?: {
    scoring?: ScoringPeriod[];
  };
};

// ---------------------------------------------------------------------------
// Stats filter
// ---------------------------------------------------------------------------

export type StatsFilter = {
  gameType?: number;
  seasonId?: number;
};
