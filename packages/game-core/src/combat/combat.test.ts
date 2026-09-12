import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createGame,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
  initializePhysics,
  WEAPONS,
} from '../index.js';
import type { Game, GameConfig, MapDefinition } from '../index.js';
import type {
  ClientCommand,
  GameEvent,
  PlayerSnapshot,
  SelectableWeaponId,
} from '@fps/protocol';

beforeAll(initializePhysics);
const games: Game[] = [];
afterEach(() => {
  games.splice(0).forEach((game) => game.dispose());
});
const map: MapDefinition = {
  id: 'duel',
  blocks: [
    {
      id: 'floor',
      shape: 'box',
      position: { x: 0, y: -0.5, z: 0 },
      size: { x: 40, y: 1, z: 40 },
      yaw: 0,
      color: 0,
    },
  ],
  spawns: [
    { x: 0, y: 0.03, z: 0 },
    { x: 0, y: 0.03, z: -5 },
  ],
};
const step = (game: Game, count = 1) => {
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) events.push(...game.step(1 / 60));
  return events;
};
const command = (game: Game, id: string, value: ClientCommand) =>
  game.enqueue({ type: 'playerCommand', playerId: id, command: value });
const player = (game: Game, id: string) =>
  game.snapshot().players.find((p) => p.id === id)!;
function setup(
  weapon: SelectableWeaponId = 'rifle',
  config: Partial<GameConfig> = {},
  arena = map,
) {
  const game = createGame(
    { ...DEFAULT_CONFIG, maxPlayers: 2, protectionSeconds: 0, ...config },
    arena,
    0,
  );
  games.push(game);
  for (const id of ['a', 'b'])
    game.enqueue({ type: 'join', playerId: id, nickname: id });
  command(game, 'a', { type: 'selectWeapon', weapon });
  for (const id of ['a', 'b'])
    command(game, id, { type: 'ready', ready: true });
  step(game, 12);
  return game;
}
function fire(game: Game, id = 'a', knife = false, head = false, seq = 1) {
  const a = player(game, id),
    b = player(game, id === 'a' ? 'b' : 'a');
  const dx = b.position.x - a.position.x,
    dz = b.position.z - a.position.z;
  const targetHeight = head ? 1.65 : 0.9;
  const yaw = Math.atan2(-dx, -dz),
    pitch = Math.atan2(
      b.position.y + targetHeight - (a.position.y + 1.65),
      Math.hypot(dx, dz),
    );
  command(game, id, { type: 'input', seq, yaw, pitch, buttons: EMPTY_BUTTONS });
  command(game, id, {
    type: 'fire',
    inputSeq: seq,
    yaw,
    pitch,
    attack: knife ? 'knife' : 'primary',
  });
  return step(game);
}

describe('server combat', () => {
  it('sniper body hit leaves a healthy opponent alive, and a second shot finishes them', () => {
    const game = setup('sniper');
    expect(fire(game).some((e) => e.type === 'kill')).toBe(false);
    expect(player(game, 'b').health).toBe(15);
    step(game, 66);
    expect(
      fire(game, 'a', false, false, 2).some((e) => e.type === 'kill'),
    ).toBe(true);
  });
  it('medkits wait three seconds after damage and share a personal cooldown', () => {
    const game = setup(
      'rifle',
      {},
      { ...map, medkits: [{ x: 1, y: 0.6, z: -5 }] },
    );
    fire(game);
    expect(player(game, 'b').health).toBe(76);
    expect(player(game, 'b').healthCooldown).toBe(3);
    expect(step(game, 179).some((e) => e.type === 'healed')).toBe(false);
    const events = step(game, 2);
    expect(events).toContainEqual({
      type: 'healed',
      playerId: 'b',
      amount: 24,
    });
    expect(player(game, 'b').health).toBe(100);
    fire(game, 'a', false, false, 2);
    expect(player(game, 'b').health).toBe(76);
    expect(step(game, 181).some((e) => e.type === 'healed')).toBe(false);
    expect(player(game, 'b').health).toBe(76);
  });
  it('applies rifle damage once and enforces cooldown and magazine', () => {
    const game = setup();
    fire(game);
    expect(player(game, 'b').health).toBe(76);
    expect(player(game, 'a').ammo).toBe(29);
    for (let i = 0; i < 3; i++)
      command(game, 'a', {
        type: 'fire',
        inputSeq: 1,
        yaw: player(game, 'a').yaw,
        pitch: player(game, 'a').pitch,
      });
    step(game);
    expect(player(game, 'b').health).toBe(76);
    expect(player(game, 'a').ammo).toBe(29);
    step(game, Math.ceil(WEAPONS.rifle.interval * 60));
    fire(game, 'a', false, true, 2);
    expect(player(game, 'b').health).toBe(40);
  });
  it('refills only at the end of reload and cannot fire while reloading', () => {
    const game = setup();
    fire(game);
    command(game, 'a', { type: 'reload' });
    step(game, 30);
    expect(player(game, 'a').ammo).toBe(29);
    fire(game, 'a', false, false, 2);
    expect(player(game, 'a').ammo).toBe(29);
    step(game, 66);
    expect(player(game, 'a').ammo).toBe(30);
    expect(player(game, 'a').reloadRemaining).toBe(0);
  });
  it('sniper headshot kills, scores once, rejects dead fire and respawns', () => {
    const game = setup('sniper', { respawnSeconds: 0.5 });
    const kill = fire(game, 'a', false, true).find((e) => e.type === 'kill');
    expect(kill).toMatchObject({
      type: 'kill',
      weapon: 'sniper',
      headshot: true,
      attackerAirborne: false,
      victimAirborne: false,
      noScope: true,
    });
    expect(kill?.type === 'kill' && kill.distance).toBeCloseTo(5, 1);
    expect(player(game, 'a').kills).toBe(1);
    expect(player(game, 'b').deaths).toBe(1);
    const life = player(game, 'b').lifeId;
    expect(fire(game, 'b').filter((e) => e.type === 'shot')).toHaveLength(0);
    step(game, 30);
    expect(player(game, 'b').health).toBe(100);
    expect(player(game, 'b').lifeId).toBe(life + 1);
    expect(player(game, 'b').deaths).toBe(1);
    expect(
      Math.hypot(player(game, 'b').position.z - player(game, 'a').position.z),
    ).toBeGreaterThan(4);
  });
  it('reports headshots and airborne players in kill events', () => {
    const game = setup('sniper');
    for (const [index, id] of ['a', 'b'].entries())
      command(game, id, {
        type: 'input',
        seq: index + 1,
        yaw: 0,
        pitch: 0,
        buttons: { ...EMPTY_BUTTONS, jump: true },
      });
    step(game);
    expect(player(game, 'a').grounded).toBe(false);
    expect(player(game, 'b').grounded).toBe(false);
    const kill = fire(game, 'a', false, true, 3).find(
      (event) => event.type === 'kill',
    );
    expect(kill).toMatchObject({
      type: 'kill',
      headshot: true,
      attackerAirborne: true,
      victimAirborne: true,
      noScope: true,
    });
  });
  it('does not shoot through static cover', () => {
    const game = setup(
      'sniper',
      {},
      {
        ...map,
        blocks: [
          ...map.blocks,
          {
            id: 'wall',
            shape: 'box',
            position: { x: 0, y: 1.5, z: -2.5 },
            size: { x: 4, y: 3, z: 1 },
            yaw: 0,
            color: 0,
          },
        ],
      },
    );
    const events = fire(game);
    expect(events.some((e) => e.type === 'shot')).toBe(true);
    expect(player(game, 'b').health).toBe(100);
  });
  it('caps eight shotgun pellets and applies distance falloff', () => {
    const game = setup('shotgun');
    const events = fire(game);
    const shot = events.find((e) => e.type === 'shot');
    expect(shot?.type === 'shot' && shot.ends.length).toBe(8);
    const damage = events
      .filter((e): e is Extract<GameEvent, { type: 'hit' }> => e.type === 'hit')
      .reduce((sum, e) => sum + e.damage, 0);
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThanOrEqual(WEAPONS.shotgun.damage * 8);
    const far = setup(
      'shotgun',
      {},
      { ...map, spawns: [map.spawns[0]!, { x: 0, y: 0.03, z: -19 }] },
    );
    const distant = fire(far)
      .filter((e): e is Extract<GameEvent, { type: 'hit' }> => e.type === 'hit')
      .reduce((sum, e) => sum + e.damage, 0);
    expect(distant).toBeLessThan(damage);
  });
  it('rewinds moving targets within the bounded history window', () => {
    for (const rewind of [false, true]) {
      const game = setup('sniper');
      const before = game.snapshot();
      const a = player(game, 'a'),
        b = player(game, 'b');
      const yaw = Math.atan2(
        -(b.position.x - a.position.x),
        -(b.position.z - a.position.z),
      );
      const pitch = Math.atan2(
        b.position.y + 0.9 - a.position.y - 1.65,
        Math.abs(b.position.z - a.position.z),
      );
      for (let seq = 1; seq <= 10; seq++) {
        command(game, 'b', {
          type: 'input',
          seq,
          yaw: 0,
          pitch: 0,
          buttons: { ...EMPTY_BUTTONS, right: true },
        });
        step(game);
      }
      command(game, 'a', {
        type: 'input',
        seq: 1,
        yaw,
        pitch,
        buttons: EMPTY_BUTTONS,
      });
      command(game, 'a', {
        type: 'fire',
        inputSeq: 1,
        yaw,
        pitch,
        ...(rewind ? { viewTick: before.tick - 1 } : {}),
      });
      step(game);
      expect(player(game, 'b').health).toBe(rewind ? 15 : 100);
    }
  });
  it('knife has limited reach and consumes no ammunition', () => {
    const far = setup();
    command(far, 'a', { type: 'selectSlot', slot: 'knife' });
    step(far, 15);
    fire(far, 'a', true);
    expect(player(far, 'b').health).toBe(100);
    const near = setup(
      'rifle',
      {},
      { ...map, spawns: [map.spawns[0]!, { x: 0, y: 0.03, z: -1.5 }] },
    );
    // A forged quick-stab command cannot bypass the selected firearm.
    expect(fire(near, 'a', true).some((e) => e.type === 'shot')).toBe(false);
    command(near, 'a', { type: 'selectSlot', slot: 'knife' });
    step(near, 15);
    fire(near, 'a', true);
    expect(player(near, 'b').health).toBe(35);
    expect(player(near, 'a').ammo).toBe(30);
    step(near, 60);
    expect(player(near, 'a').slot).toBe('knife');
    command(near, 'a', { type: 'reload' });
    step(near);
    expect(player(near, 'a').reloadRemaining).toBe(0);
    expect(fire(near, 'a', true, false, 2).some((e) => e.type === 'kill')).toBe(
      true,
    );
    expect(player(near, 'a').slot).toBe('knife');
  });
  it('keeps the full three-second shield even when firing', () => {
    const game = setup('sniper', { protectionSeconds: 3 });
    fire(game);
    expect(player(game, 'b').health).toBe(100);
    expect(player(game, 'a').protectionRemaining).toBeGreaterThan(2.7);
    fire(game, 'b');
    expect(player(game, 'b').protectionRemaining).toBeGreaterThan(2.7);
    expect(player(game, 'a').health).toBe(100);
    step(game, 170);
    expect(player(game, 'a').protectionRemaining).toBe(0);
    fire(game, 'b', false, false, 2);
    expect(player(game, 'a').health).toBeLessThan(100);
  });
  it.each(['smg', 'sapper'] as const)(
    'supports %s damage, independent ammunition and cooldown',
    (weapon) => {
      const game = setup(weapon);
      fire(game);
      expect(player(game, 'b').health).toBe(100 - WEAPONS[weapon].damage);
      expect(player(game, 'a').ammo).toBe(WEAPONS[weapon].magazine - 1);
      fire(game, 'a', false, false, 2);
      expect(player(game, 'a').ammo).toBe(WEAPONS[weapon].magazine - 1);
      step(game, Math.ceil(WEAPONS[weapon].interval * 60));
      fire(game, 'a', false, false, 3);
      expect(player(game, 'a').ammo).toBe(WEAPONS[weapon].magazine - 2);
    },
  );
  it('blocks live class changes and ready toggles that would evade damage', () => {
    const game = setup();
    command(game, 'b', { type: 'selectWeapon', weapon: 'shotgun' });
    command(game, 'b', { type: 'ready', ready: false });
    step(game);
    expect(player(game, 'b').weapon).toBe('rifle');
    expect(player(game, 'b').ready).toBe(true);
    fire(game);
    expect(player(game, 'b').health).toBe(76);
  });
  it('disconnect clears buffered actions, stops movement and retains score', () => {
    const game = setup();
    command(game, 'a', {
      type: 'input',
      seq: 5,
      yaw: 0,
      pitch: 0,
      buttons: { ...EMPTY_BUTTONS, forward: true },
    });
    game.enqueue({ type: 'connection', playerId: 'a', connected: false });
    step(game, 20);
    expect(player(game, 'a').connected).toBe(false);
    expect(player(game, 'a').velocity.z).toBe(0);
    expect(fire(game).some((e) => e.type === 'shot')).toBe(false);
    game.enqueue({ type: 'connection', playerId: 'a', connected: true });
    step(game);
    expect(player(game, 'a').connected).toBe(true);
    expect(player(game, 'a').lastProcessedInput).toBe(5);
  });
});

describe('round lifecycle', () => {
  it('waits for two ready players, ends, freezes score and starts next round', () => {
    const game = createGame(
      {
        ...DEFAULT_CONFIG,
        maxPlayers: 2,
        roundSeconds: 0.5,
        resultsSeconds: 0.2,
        protectionSeconds: 0,
      },
      map,
      0,
    );
    games.push(game);
    game.enqueue({ type: 'join', playerId: 'a', nickname: 'a' });
    command(game, 'a', { type: 'ready', ready: true });
    step(game, 40);
    expect(game.snapshot().phase).toBe('waiting');
    game.enqueue({ type: 'join', playerId: 'b', nickname: 'b' });
    command(game, 'b', { type: 'ready', ready: true });
    step(game);
    expect(game.snapshot().phase).toBe('active');
    step(game, 30);
    expect(game.snapshot().phase).toBe('results');
    expect(game.snapshot().winner).toBe('Ничья');
    const frozen: PlayerSnapshot = player(game, 'a');
    fire(game);
    expect(player(game, 'a').ammo).toBe(frozen.ammo);
    step(game, 12);
    expect(game.snapshot().round).toBe(2);
    expect(game.snapshot().phase).toBe('active');
    expect(player(game, 'a').kills).toBe(0);
  });
});
