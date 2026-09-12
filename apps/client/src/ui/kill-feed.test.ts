import { expect, it } from 'vitest';
import { createKillFeedItem, type KillEvent } from './kill-feed.js';

const event: KillEvent = {
  type: 'kill',
  playerId: 'attacker-id',
  targetId: 'victim-id',
  attacker: 'Alpha',
  victim: 'Bravo',
  weapon: 'sniper',
  headshot: true,
  attackerAirborne: true,
  victimAirborne: false,
  noScope: true,
  distance: 31.6,
};

it('builds compact kill feed details in a stable order', () => {
  expect(createKillFeedItem(event, 'attacker-id', 5000)).toEqual({
    attacker: 'Alpha',
    victim: 'Bravo',
    weapon: 'sniper',
    weaponLabel: 'СНП',
    weaponName: 'снайперка',
    tags: [
      { kind: 'headshot', label: 'В ГОЛОВУ' },
      { kind: 'airborne', label: 'В ПРЫЖКЕ' },
      { kind: 'no-scope', label: 'БЕЗ ПРИЦЕЛА' },
      { kind: 'distance', label: '32 М' },
    ],
    localKill: true,
    localDeath: false,
    announcement:
      'Alpha убил Bravo, снайперка, 32 метра, в голову, в прыжке, без прицела',
    expires: 5000,
  });
});

it('marks a local death and an airborne target', () => {
  const item = createKillFeedItem(
    {
      ...event,
      headshot: false,
      attackerAirborne: false,
      noScope: false,
      victimAirborne: true,
    },
    'victim-id',
    7000,
  );
  expect(item.localKill).toBe(false);
  expect(item.localDeath).toBe(true);
  expect(item.tags).toEqual([
    { kind: 'target-airborne', label: 'ЦЕЛЬ В ВОЗДУХЕ' },
    { kind: 'distance', label: '32 М' },
  ]);
});
