import { beforeAll, expect, it } from 'vitest';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
  initializePhysics,
  TEST_PAD,
} from '../index.js';
import type { ClientCommand, GameEvent, PlayerSnapshot } from '@fps/protocol';
import { createMines, MINE } from './mines.js';
import { traceShot } from './weapons.js';

beforeAll(initializePhysics);
function fixture() {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
  game.enqueue({ type: 'join', playerId: 'owner', nickname: 'Owner' });
  game.step(1 / 60);
  const owner = game.snapshot().players[0]!;
  Object.assign(owner, {
    weapon: 'sapper',
    ready: true,
    grounded: true,
    protectionRemaining: 0,
    position: { x: 0, y: 0.03, z: 0 },
    yaw: 0,
  });
  game.dispose();
  return owner;
}

it('only hits the nearest visible mine, respects walls and players, and ignores knife attacks', () => {
  const world = createCollisionWorld(TEST_PAD);
  try {
    const shooter = fixture();
    const mine = {
      id: 'mine',
      ownerId: 'enemy',
      armed: true,
      position: { x: 0, y: 0.08, z: -5 },
    };
    const pitch = Math.atan2(mine.position.y - shooter.position.y - 1.65, 5);
    const trace = (weapon: 'sniper' | 'shotgun' | 'knife' = 'sniper') =>
      traceShot(shooter, [], world, 0, pitch, weapon, 1, [mine]);
    expect([...trace().mineHits]).toEqual(['mine']);
    expect(trace().hits.size).toBe(0);
    expect(trace().impacts).toEqual([]);
    expect(trace('knife').mineHits.size).toBe(0);
    expect(trace('shotgun').mineHits.size).toBe(1);
    expect(
      traceShot(
        shooter,
        [],
        { ...world, raycast: () => 1 },
        0,
        pitch,
        'sniper',
        1,
        [mine],
      ).mineHits.size,
    ).toBe(0);
    const blocker = {
      ...shooter,
      id: 'blocker',
      position: { x: 0, y: 0.03, z: -2 },
    };
    const blocked = traceShot(
      shooter,
      [blocker],
      world,
      0,
      pitch,
      'sniper',
      1,
      [mine],
    );
    expect(blocked.hits.has('blocker')).toBe(true);
    expect(blocked.mineHits.size).toBe(0);
    const farther = {
      ...mine,
      id: 'farther',
      position: { ...mine.position, z: -5.15 },
    };
    expect([
      ...traceShot(shooter, [], world, 0, pitch, 'sniper', 1, [farther, mine])
        .mineHits,
    ]).toEqual(['mine']);
  } finally {
    world.dispose();
  }
});

it.each([
  { armed: false, friendly: false },
  { armed: true, friendly: false },
  { armed: true, friendly: true },
])(
  'shooting mines respects arming and team rules ($armed, friendly=$friendly)',
  ({ armed, friendly }) => {
    const game = createGame(
      { ...DEFAULT_CONFIG, maxPlayers: 3, protectionSeconds: 0 },
      {
        ...TEST_PAD,
        spawns: [
          { x: 0, y: 0.03, z: 0 },
          { x: 0, y: 0.03, z: -5 },
          { x: 5, y: 0.03, z: 5 },
        ],
      },
      0,
    );
    const send = (playerId: string, command: ClientCommand) =>
      game.enqueue({ type: 'playerCommand', playerId, command });
    try {
      for (const id of ['owner', 'shooter'])
        game.enqueue({ type: 'join', playerId: id, nickname: id });
      send('owner', { type: 'selectWeapon', weapon: 'sapper' });
      send('shooter', { type: 'selectWeapon', weapon: 'sniper' });
      if (friendly) send('owner', { type: 'setMode', mode: 'waves' });
      for (const id of ['owner', 'shooter'])
        send(id, { type: 'ready', ready: true });
      for (let i = 0; i < 20; i++) game.step(1 / 60);
      expect(game.snapshot().mode).toBe(friendly ? 'waves' : 'arena');
      send('owner', {
        type: 'input',
        seq: 1,
        yaw: 0,
        pitch: 0,
        buttons: EMPTY_BUTTONS,
      });
      send('owner', { type: 'deployMine' });
      game.step(1 / 60);
      if (armed) for (let i = 0; i < 80; i++) game.step(1 / 60);
      const mine = game.snapshot().mines[0]!;
      expect(mine.armed).toBe(armed);
      const shooter = game.snapshot().players.find((p) => p.id === 'shooter')!;
      const dx = mine.position.x - shooter.position.x;
      const dz = mine.position.z - shooter.position.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(
        mine.position.y - shooter.position.y - 1.65,
        Math.hypot(dx, dz),
      );
      send('shooter', {
        type: 'input',
        seq: 1,
        yaw,
        pitch,
        buttons: EMPTY_BUTTONS,
      });
      send('shooter', { type: 'fire', inputSeq: 1, yaw, pitch });
      const events = game.step(1 / 60);
      expect(events.filter((e) => e.type === 'shot')).toHaveLength(1);
      expect(
        events.some(
          (e) =>
            e.type === 'explosion' || e.type === 'hit' || e.type === 'kill',
        ),
      ).toBe(false);
      expect(game.snapshot().mines).toHaveLength(friendly ? 1 : 0);
      expect(
        game.snapshot().players.find((p) => p.id === 'shooter')?.ammo,
      ).toBe(4);
      for (let i = 0; i < 100; i++)
        expect(game.step(1 / 60).some((e) => e.type === 'explosion')).toBe(
          false,
        );
    } finally {
      game.dispose();
    }
  },
);

it('destroy is idempotent and frees the placement limit without resetting cooldown', () => {
  const world = createCollisionWorld(TEST_PAD);
  try {
    const owner = fixture(),
      mines = createMines();
    mines.deploy(owner, world);
    const id = mines.snapshot()[0]!.id;
    expect(mines.destroy(id)).toBe(true);
    expect(mines.destroy(id)).toBe(false);
    expect(owner.mineCooldown).toBe(MINE.cooldown);
    expect(mines.deploy(owner, world)).toBe(false);
    owner.mineCooldown = 0;
    expect(mines.deploy(owner, world)).toBe(true);
  } finally {
    world.dispose();
  }
});
it('validates deployment, arms after a delay, respects walls, shields and teams', () => {
  const world = createCollisionWorld(TEST_PAD);
  try {
    const mines = createMines(),
      owner = fixture();
    const target: PlayerSnapshot = {
      ...owner,
      id: 'target',
      bot: true,
      position: { x: 0, y: 0.03, z: -1.8 },
    };
    const players = new Map([
      [owner.id, owner],
      [target.id, target],
    ]);
    expect(mines.deploy({ ...owner, grounded: false }, world)).toBe(false);
    expect(mines.deploy({ ...owner, weapon: 'rifle' }, world)).toBe(false);
    expect(mines.deploy(owner, world)).toBe(true);
    expect(owner.mineCooldown).toBe(MINE.cooldown);
    expect(mines.deploy(owner, world)).toBe(false);
    const hits: number[] = [];
    const blast = (
      _: PlayerSnapshot,
      __: unknown,
      victims: { damage: number }[],
    ) => hits.push(...victims.map((v) => v.damage));
    mines.step(0.5, players, world, () => true, blast);
    expect(hits).toEqual([]);
    expect(mines.snapshot()[0]!.armed).toBe(false);
    mines.step(1, players, world, () => false, blast);
    expect(hits).toEqual([]);
    target.protectionRemaining = 1;
    mines.step(0.1, players, world, () => true, blast);
    expect(hits).toEqual([]);
    target.protectionRemaining = 0;
    mines.step(0.1, players, { ...world, raycast: () => 0 }, () => true, blast);
    expect(hits).toEqual([]);
    mines.step(0.1, players, world, () => true, blast);
    expect(hits.length).toBe(1);
    expect(hits[0]).toBeGreaterThan(100);
    expect(mines.snapshot()).toEqual([]);
  } finally {
    world.dispose();
  }
});

it('bounds mines and removes expired, disconnected and previous-life ordnance', () => {
  const world = createCollisionWorld(TEST_PAD);
  try {
    const owner = fixture(),
      mines = createMines();
    const players = new Map([[owner.id, owner]]);
    for (let i = 0; i < 10; i++) {
      owner.mineCooldown = 0;
      mines.deploy(owner, world);
    }
    expect(mines.snapshot()).toHaveLength(2);
    owner.lifeId++;
    mines.step(
      0.1,
      players,
      world,
      () => true,
      () => {},
    );
    expect(mines.snapshot()).toEqual([]);
    mines.deploy(owner, world);
    mines.step(
      41,
      players,
      world,
      () => true,
      () => {},
    );
    expect(mines.snapshot()).toEqual([]);
    owner.mineCooldown = 0;
    mines.deploy(owner, world);
    owner.connected = false;
    mines.step(
      0.1,
      players,
      world,
      () => true,
      () => {},
    );
    expect(mines.snapshot()).toEqual([]);
  } finally {
    world.dispose();
  }
});

it('authoritatively credits mine kills once and rejects deployment outside combat', () => {
  const game = createGame(
    { ...DEFAULT_CONFIG, maxPlayers: 2, protectionSeconds: 0 },
    {
      ...TEST_PAD,
      spawns: [
        { x: 0, y: 0.03, z: 0 },
        { x: 0, y: 0.03, z: -1.8 },
      ],
    },
    0,
  );
  const send = (command: ClientCommand, playerId = 'owner') =>
    game.enqueue({ type: 'playerCommand', playerId, command });
  try {
    game.enqueue({ type: 'join', playerId: 'owner', nickname: 'Owner' });
    game.enqueue({ type: 'join', playerId: 'target', nickname: 'Target' });
    game.step(1 / 60);
    send({ type: 'selectWeapon', weapon: 'sapper' });
    send({ type: 'deployMine' });
    game.step(1 / 60);
    expect(game.snapshot().mines).toEqual([]);
    send({ type: 'ready', ready: true });
    send({ type: 'ready', ready: true }, 'target');
    for (let i = 0; i < 15; i++) game.step(1 / 60);
    const [owner, target] = game.snapshot().players;
    const yaw = Math.atan2(
      owner!.position.x - target!.position.x,
      owner!.position.z - target!.position.z,
    );
    send({ type: 'input', seq: 1, yaw, pitch: 0, buttons: EMPTY_BUTTONS });
    game.step(1 / 60);
    send({ type: 'deployMine' });
    game.step(1 / 60);
    expect(game.snapshot().mines).toHaveLength(1);
    const events: GameEvent[] = [];
    for (let i = 0; i < 100; i++) events.push(...game.step(1 / 60));
    expect(events.filter((e) => e.type === 'explosion')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'kill')).toMatchObject([
      {
        playerId: 'owner',
        targetId: 'target',
        weapon: 'mine',
        headshot: false,
      },
    ]);
    expect(game.snapshot().players[0]!.kills).toBe(1);
  } finally {
    game.dispose();
  }
});
