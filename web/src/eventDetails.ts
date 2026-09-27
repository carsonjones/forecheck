import type { GameEvent } from './types';

export function eventParticipants(event: GameEvent): string[] {
  const player = (name: string | null, id: number | null) => name || (id ? `Player #${id}` : '');
  const details: string[] = [];
  const scorer = player(event.scoring_player_name, event.scoring_player_id);
  const shooter = player(event.shooting_player_name, event.shooting_player_id);
  if (scorer || shooter) details.push(scorer || shooter);
  const assists = [
    player(event.assist1_player_name, event.assist1_player_id),
    player(event.assist2_player_name, event.assist2_player_id),
  ].filter(Boolean);
  if (assists.length) details.push(`Assists: ${assists.join(', ')}`);
  const blocker = player(event.blocking_player_name, event.blocking_player_id);
  if (blocker) details.push(`Blocked by ${blocker}`);
  const goalie = player(event.goalie_name, event.goalie_id);
  if (goalie) details.push(`${event.type_desc === 'shot-on-goal' ? 'Saved by' : 'Goalie:'} ${goalie}`);
  return details;
}

// NHL order: away goalie, away skaters, home skaters, home goalie.
export function strengthLabel(code: string, away: string, home: string): string | null {
  if (!/^[01][0-6][0-6][01]$/.test(code)) return null;
  const [awayGoalie, awaySkaters, homeSkaters, homeGoalie] = code.split('');
  const details = [`${away} ${awaySkaters}-on-${homeSkaters} ${home}`];
  if (awayGoalie === '0') details.push(`${away} empty net`);
  if (homeGoalie === '0') details.push(`${home} empty net`);
  return details.join(' · ');
}
