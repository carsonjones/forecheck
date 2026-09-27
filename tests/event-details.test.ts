import { describe, expect, it } from 'bun:test';
import { eventParticipants, strengthLabel } from '../web/src/eventDetails';
import type { GameEvent } from '../web/src/types';

const event = {
  type_desc: 'shot-on-goal',
  shooting_player_id: 1, shooting_player_name: 'Test Shooter',
  goalie_id: 2, goalie_name: 'Test Goalie',
  scoring_player_id: null, scoring_player_name: null,
  blocking_player_id: null, blocking_player_name: null,
  assist1_player_id: null, assist1_player_name: null,
  assist2_player_id: null, assist2_player_name: null,
} as GameEvent;

describe('event participants', () => {
  it('shows shooter and save attribution', () => {
    expect(eventParticipants(event)).toEqual(['Test Shooter', 'Saved by Test Goalie']);
  });
  it('shows scorer and assists without calling a goal a save', () => {
    expect(eventParticipants({ ...event, type_desc: 'goal', scoring_player_id: 3,
      scoring_player_name: 'Test Scorer', assist1_player_id: 4, assist1_player_name: 'First Assist',
      assist2_player_id: 5, assist2_player_name: 'Second Assist',
    })).toEqual(['Test Scorer', 'Assists: First Assist, Second Assist', 'Goalie: Test Goalie']);
  });
  it('handles missing names and blocking players', () => {
    expect(eventParticipants({ ...event, type_desc: 'blocked-shot', shooting_player_name: null,
      goalie_id: null, goalie_name: null, blocking_player_id: 3, blocking_player_name: 'Test Blocker',
    })).toEqual(['Player #1', 'Blocked by Test Blocker']);
  });
});

describe('strength labels', () => {
  it('uses away/home order, not event owner order', () => {
    expect(strengthLabel('1551', 'DAL', 'MIN')).toBe('DAL 5-on-5 MIN');
    expect(strengthLabel('1541', 'DAL', 'MIN')).toBe('DAL 5-on-4 MIN');
    expect(strengthLabel('1451', 'DAL', 'MIN')).toBe('DAL 4-on-5 MIN');
  });
  it('identifies which net is empty', () => {
    expect(strengthLabel('1560', 'DAL', 'MIN')).toBe('DAL 5-on-6 MIN · MIN empty net');
    expect(strengthLabel('0651', 'DAL', 'MIN')).toBe('DAL 6-on-5 MIN · DAL empty net');
  });
  it('omits unknown codes', () => {
    expect(strengthLabel('', 'DAL', 'MIN')).toBeNull();
    expect(strengthLabel('unknown', 'DAL', 'MIN')).toBeNull();
  });
});
