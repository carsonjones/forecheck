export enum GameType {
  RegularSeason = 2,
  Playoffs = 3,
  AllStar = 4,
}

export type SortOrder = 'asc' | 'desc';

export const BaseURLWeb = 'https://api-web.nhle.com/v1';
export const BaseURLStats = 'https://api.nhl.com/stats/rest/en';

export type TeamMetadata = {
  id: number;
  abbreviation: string;
  name: string;
  city: string;
};

export const NHL_TEAMS: readonly TeamMetadata[] = [
  { id: 1, abbreviation: 'NJD', name: 'New Jersey Devils', city: 'New Jersey' },
  { id: 2, abbreviation: 'NYI', name: 'New York Islanders', city: 'New York' },
  { id: 3, abbreviation: 'NYR', name: 'New York Rangers', city: 'New York' },
  { id: 4, abbreviation: 'PHI', name: 'Philadelphia Flyers', city: 'Philadelphia' },
  { id: 5, abbreviation: 'PIT', name: 'Pittsburgh Penguins', city: 'Pittsburgh' },
  { id: 6, abbreviation: 'BOS', name: 'Boston Bruins', city: 'Boston' },
  { id: 7, abbreviation: 'BUF', name: 'Buffalo Sabres', city: 'Buffalo' },
  { id: 8, abbreviation: 'MTL', name: 'Montreal Canadiens', city: 'Montreal' },
  { id: 9, abbreviation: 'OTT', name: 'Ottawa Senators', city: 'Ottawa' },
  { id: 10, abbreviation: 'TOR', name: 'Toronto Maple Leafs', city: 'Toronto' },
  { id: 12, abbreviation: 'CAR', name: 'Carolina Hurricanes', city: 'Carolina' },
  { id: 13, abbreviation: 'FLA', name: 'Florida Panthers', city: 'Florida' },
  { id: 14, abbreviation: 'TBL', name: 'Tampa Bay Lightning', city: 'Tampa Bay' },
  { id: 15, abbreviation: 'WSH', name: 'Washington Capitals', city: 'Washington' },
  { id: 16, abbreviation: 'CHI', name: 'Chicago Blackhawks', city: 'Chicago' },
  { id: 17, abbreviation: 'DET', name: 'Detroit Red Wings', city: 'Detroit' },
  { id: 18, abbreviation: 'NSH', name: 'Nashville Predators', city: 'Nashville' },
  { id: 19, abbreviation: 'STL', name: 'St. Louis Blues', city: 'St. Louis' },
  { id: 20, abbreviation: 'CGY', name: 'Calgary Flames', city: 'Calgary' },
  { id: 21, abbreviation: 'COL', name: 'Colorado Avalanche', city: 'Colorado' },
  { id: 22, abbreviation: 'EDM', name: 'Edmonton Oilers', city: 'Edmonton' },
  { id: 23, abbreviation: 'VAN', name: 'Vancouver Canucks', city: 'Vancouver' },
  { id: 24, abbreviation: 'ANA', name: 'Anaheim Ducks', city: 'Anaheim' },
  { id: 25, abbreviation: 'DAL', name: 'Dallas Stars', city: 'Dallas' },
  { id: 26, abbreviation: 'LAK', name: 'Los Angeles Kings', city: 'Los Angeles' },
  { id: 28, abbreviation: 'SJS', name: 'San Jose Sharks', city: 'San Jose' },
  { id: 29, abbreviation: 'CBJ', name: 'Columbus Blue Jackets', city: 'Columbus' },
  { id: 30, abbreviation: 'MIN', name: 'Minnesota Wild', city: 'Minnesota' },
  { id: 52, abbreviation: 'WPG', name: 'Winnipeg Jets', city: 'Winnipeg' },
  { id: 53, abbreviation: 'ARI', name: 'Arizona Coyotes', city: 'Arizona' },
  { id: 54, abbreviation: 'VGK', name: 'Vegas Golden Knights', city: 'Vegas' },
  { id: 55, abbreviation: 'SEA', name: 'Seattle Kraken', city: 'Seattle' },
  { id: 59, abbreviation: 'UTA', name: 'Utah Hockey Club', city: 'Utah' },
];
