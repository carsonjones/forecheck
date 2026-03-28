/**
 * ingestGame.ts
 *
 * Core ingest logic for a single game:
 *   1. fetch play-by-play + shift charts
 *   2. upsert game, players, events, shifts into D1
 *
 * xG computation and WAR model are intentionally separate steps.
 */

import type { NhlClient } from '../nhl/client.js';
import { periodTimeToSeconds } from '../nhl/formatters.js';
import type { PlayEvent, ShiftRecord } from '../nhl/models.js';

// Event type codes we care about for shot-based metrics
const SHOT_TYPE_CODES = new Set([
  505, // goal
  506, // shot-on-goal
  507, // missed shot
  508, // blocked shot
]);

export async function ingestGame(
  gameId: number,
  client: NhlClient,
  db: D1Database,
): Promise<void> {
  const [pbp, shifts] = await Promise.all([
    client.getGamePlayByPlay(gameId),
    client.getShiftCharts(gameId),
  ]);

  const statements: D1PreparedStatement[] = [];

  // --- upsert game ---
  statements.push(
    db.prepare(`
      INSERT INTO games (id, season, game_type, game_date, home_team_id, away_team_id, home_score, away_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        home_score = excluded.home_score,
        away_score = excluded.away_score
    `).bind(
      gameId,
      pbp.season,
      pbp.gameType,
      pbp.gameDate,
      pbp.homeTeam.id,
      pbp.awayTeam.id,
      pbp.homeTeam.score ?? null,
      pbp.awayTeam.score ?? null,
    ),
  );

  // --- upsert players from rosterSpots ---
  for (const spot of pbp.rosterSpots) {
    statements.push(
      db.prepare(`
        INSERT INTO players (id, first_name, last_name, position_code, current_team_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          first_name = excluded.first_name,
          last_name  = excluded.last_name,
          position_code = excluded.position_code,
          current_team_id = excluded.current_team_id
      `).bind(
        spot.playerId,
        spot.firstName.default,
        spot.lastName.default,
        spot.positionCode,
        spot.teamId,
      ),
    );
  }

  // --- upsert events ---
  for (const event of pbp.plays) {
    if (!SHOT_TYPE_CODES.has(event.typeCode)) continue;
    statements.push(buildEventStatement(db, gameId, event));
  }

  // --- upsert shifts ---
  for (const shift of shifts.data) {
    if (shift.typeCode !== 517) continue; // 517 = actual shift
    const startSecs = periodTimeToSeconds(shift.startTime);
    const endSecs = periodTimeToSeconds(shift.endTime);
    statements.push(
      db.prepare(`
        INSERT INTO shifts (game_id, player_id, team_id, period, start_secs, end_secs, shift_number)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id, player_id, period, shift_number) DO NOTHING
      `).bind(
        gameId,
        shift.playerId,
        shift.teamId,
        shift.period,
        startSecs,
        endSecs,
        shift.shiftNumber,
      ),
    );
  }

  // batch write
  await db.batch(statements);
}

function buildEventStatement(
  db: D1Database,
  gameId: number,
  event: PlayEvent,
): D1PreparedStatement {
  const d = event.details;
  const secondsElapsed =
    (event.periodDescriptor.number - 1) * 20 * 60 +
    periodTimeToSeconds(event.timeInPeriod);

  return db.prepare(`
    INSERT INTO events (
      game_id, event_id, period, time_in_period, seconds_elapsed,
      situation_code, type_code, type_desc,
      owner_team_id, x_coord, y_coord, zone_code, shot_type,
      shooting_player_id, goalie_id, blocking_player_id,
      scoring_player_id, assist1_player_id, assist2_player_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id, event_id) DO NOTHING
  `).bind(
    gameId,
    event.eventId,
    event.periodDescriptor.number,
    event.timeInPeriod,
    secondsElapsed,
    event.situationCode,
    event.typeCode,
    event.typeDescKey,
    d.eventOwnerTeamId ?? null,
    d.xCoord ?? null,
    d.yCoord ?? null,
    d.zoneCode ?? null,
    d.shotType ?? null,
    d.shootingPlayerId ?? null,
    d.goalieInNetId ?? null,
    d.blockingPlayerId ?? null,
    d.scoringPlayerId ?? null,
    d.assist1PlayerId ?? null,
    d.assist2PlayerId ?? null,
  );
}
