import { beforeAll, expect, it } from 'vitest';
import {
  createGame,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
} from '../index.js';
import type { ClientCommand } from '@fps/protocol';
beforeAll(initializePhysics);

it.each(['grenade', 'mine'] as const)(
  'uses %s while practising alone before the match',
  (kind) => {
    const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
    const send = (command: ClientCommand) =>
      game.enqueue({ type: 'playerCommand', playerId: 'a', command });
    try {
      game.enqueue({ type: 'join', playerId: 'a', nickname: 'Sapper' });
      send({ type: 'selectWeapon', weapon: 'sapper' });
      send({ type: 'ready', ready: true });
      for (let i = 0; i < 12; i++) game.step(1 / 60);
      expect(game.snapshot().phase).toBe('waiting');
      expect(game.snapshot().players[0]!.grounded).toBe(true);
      send(
        kind === 'mine'
          ? { type: 'deployMine' }
          : { type: 'throwGrenade', yaw: 0, pitch: 0 },
      );
      game.step(1 / 60);
      expect(
        kind === 'mine' ? game.snapshot().mines : game.snapshot().grenades,
      ).toHaveLength(1);
      if (kind === 'grenade') {
        for (let i = 0; i < 160; i++) game.step(1 / 60);
        expect(game.snapshot().grenades).toHaveLength(0);
        expect(game.snapshot().players[0]!.grenades).toBe(1);
      }
    } finally {
      game.dispose();
    }
  },
);
