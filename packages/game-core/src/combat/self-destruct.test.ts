import { beforeAll, expect, it } from 'vitest';
import {
  createGame,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
} from '../index.js';
import {
  clientCommandSchema,
  type ClientCommand,
  type GameMode,
} from '@fps/protocol';

beforeAll(initializePhysics);
it('cleans up owned mines and grenades without an explosion on self-destruction', () => {
  const game = createGame(
    DEFAULT_CONFIG,
    { ...TEST_PAD, spawns: TEST_PAD.spawns.map((p) => ({ ...p, y: 0.03 })) },
    0,
  );
  const send = (command: ClientCommand, playerId = 'p') =>
    game.enqueue({ type: 'playerCommand', playerId, command });
  try {
    game.enqueue({ type: 'join', playerId: 'p', nickname: 'Engineer' });
    game.enqueue({ type: 'join', playerId: 'friend', nickname: 'Friend' });
    send({ type: 'selectWeapon', weapon: 'sapper' });
    send({ type: 'ready', ready: true });
    send({ type: 'ready', ready: true }, 'friend');
    for (let i = 0; i < 30; i++) game.step(1 / 60);
    send({ type: 'deployMine' });
    send({ type: 'throwGrenade', yaw: 0, pitch: 0 });
    game.step(1 / 60);
    expect(game.snapshot().mines).toHaveLength(1);
    expect(game.snapshot().grenades).toHaveLength(1);
    send({ type: 'selfDestruct' });
    const events = game.step(1 / 60);
    expect(game.snapshot().mines).toHaveLength(0);
    expect(game.snapshot().grenades).toHaveLength(0);
    expect(events.some((e) => e.type === 'explosion')).toBe(false);
  } finally {
    game.dispose();
  }
});
it('accepts only a self-destruct request with no target or client-supplied damage', () => {
  expect(clientCommandSchema.safeParse({ type: 'selfDestruct' }).success).toBe(
    true,
  );
  expect(
    clientCommandSchema.safeParse({ type: 'selfDestruct', targetId: 'friend' })
      .success,
  ).toBe(false);
  expect(
    clientCommandSchema.safeParse({ type: 'selfDestruct', damage: 100 })
      .success,
  ).toBe(false);
});
it.each<GameMode>([
  'arena',
  'control',
  'training',
  'parkour',
  'waves',
  'mission',
])(
  'self-destructs once through a shield without awarding kills in %s',
  (mode) => {
    const game = createGame(
      { ...DEFAULT_CONFIG, protectionSeconds: 20 },
      TEST_PAD,
      0,
    );
    const send = (command: ClientCommand, playerId = 'p') =>
      game.enqueue({ type: 'playerCommand', playerId, command });
    const tick = (count = 1) => {
      for (let i = 0; i < count; i++) game.step(1 / 60);
    };
    const player = () => game.snapshot().players.find((p) => p.id === 'p')!;
    try {
      game.enqueue({ type: 'join', playerId: 'p', nickname: 'Player' });
      game.enqueue({ type: 'join', playerId: 'friend', nickname: 'Friend' });
      send({ type: 'setMode', mode });
      tick();
      send({ type: 'selfDestruct' });
      tick();
      expect(player().deaths).toBe(0);
      send({ type: 'ready', ready: true });
      send({ type: 'ready', ready: true }, 'friend');
      tick();
      expect(game.snapshot().phase).toBe(
        mode === 'training' || mode === 'parkour' ? 'waiting' : 'active',
      );
      if (mode === 'training' || mode === 'parkour') {
        send({ type: 'startChallenge' });
        tick();
      }
      const life = player().lifeId;
      expect(player().protectionRemaining).toBeGreaterThan(0);
      send({ type: 'selfDestruct' });
      send({ type: 'selfDestruct' });
      const events = game.step(1 / 60);
      expect(events.filter((e) => e.type === 'kill')).toEqual([
        expect.objectContaining({
          playerId: 'p',
          targetId: 'p',
          weapon: 'selfDestruct',
        }),
      ]);
      expect(player().health).toBe(0);
      expect(player().deaths).toBe(1);
      expect(player().kills).toBe(0);
      expect(
        game.snapshot().players.find((p) => p.id === 'friend')!.health,
      ).toBe(100);
      if (mode === 'training' || mode === 'parkour')
        expect(player().challenge.status).toBe('failed');
      tick(170);
      expect(player().health).toBe(0);
      tick(20);
      if (mode === 'waves' || mode === 'mission') {
        expect(player().health).toBe(0);
        expect(player().lifeId).toBe(life);
      } else {
        expect(player().health).toBe(100);
        expect(player().lifeId).toBe(life + 1);
      }
      expect(player().deaths).toBe(1);
    } finally {
      game.dispose();
    }
  },
);
