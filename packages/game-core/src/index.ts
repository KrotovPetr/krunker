import {
  emptyWave,
  waveSize,
  chooseEnemySpawn,
  chooseRespawn,
} from './waves/director.js';
export { emptyWave } from './waves/director.js';
import { getMap } from './maps/catalog.js';
export { getMap, MAPS } from './maps/catalog.js';
export { CITY } from './maps/city.js';
export { SANDGATE } from './maps/sandgate.js';
import {
  emptyChallenge,
  challengeActive,
  challengeInput,
  movingTargets,
  advanceChallenge,
  recordTrainingHit,
  PARKOUR_START,
  TRAINING_SECONDS,
  PARKOUR_SECONDS,
  CHALLENGE_COUNTDOWN,
} from './training/challenges.js';
import { createBotBrain, createNavigation, visible } from './bots/brain.js';
export {
  emptyChallenge,
  challengeActive,
  challengeInput,
  movingTargets,
  challengeResult,
  PARKOUR_START,
  PARKOUR_CHECKPOINTS,
  COURSE_VERSION,
} from './training/challenges.js';
import { MAX_PLAYERS, TICK_RATE } from '@fps/protocol';
import type {
  ClientCommand,
  GameEvent,
  GameSnapshot,
  PlayerSnapshot,
  InputCommand,
  Vec3,
} from '@fps/protocol';
import { TEST_PAD } from './maps/test-pad.js';
import type { MapDefinition } from './maps/test-pad.js';
import { createCollisionWorld } from './movement/collision-world.js';
import {
  createMovementState,
  EMPTY_BUTTONS,
  predictPlayerMovement,
} from './movement/controller.js';
import { MOVEMENT } from './movement/config.js';
import {
  WEAPONS,
  KNIFE,
  PISTOL,
  FIREARMS,
  equippedWeapon,
  magazineAmmo,
  reserveAmmo,
  traceShot,
} from './combat/weapons.js';

export { TEST_PAD };
export type { MapDefinition };
export { ARENA, rampVertices, RAMP_INDICES } from './maps/arena.js';
export type { MapBlock } from './maps/arena.js';
export {
  initializePhysics,
  createCollisionWorld,
} from './movement/collision-world.js';
export type { CollisionWorld } from './movement/collision-world.js';
export {
  createMovementState,
  EMPTY_BUTTONS,
  predictPlayerMovement,
  playerHeight,
} from './movement/controller.js';
export type { MovementState } from './movement/controller.js';
export { MOVEMENT } from './movement/config.js';
export { createFixedStepper } from './movement/fixed-step.js';
export {
  WEAPONS,
  KNIFE,
  PISTOL,
  FIREARMS,
  equippedWeapon,
  magazineAmmo,
  reserveAmmo,
  weaponSpread,
  horizontalRecoil,
  CLASS_NAMES,
} from './combat/weapons.js';
export {
  createPrediction,
  interpolateSnapshots,
} from './network/prediction.js';

export interface GameConfig {
  maxPlayers: number;
  tickRate: number;
  roundSeconds: number;
  resultsSeconds: number;
  respawnSeconds: number;
  protectionSeconds: number;
  trainingSeconds?: number;
  challengeCountdown?: number;
  wavePreparationSeconds?: number;
  waveSpawnSeconds?: number;
  waveBaseEnemies?: number;
}
export const DEFAULT_CONFIG: GameConfig = {
  maxPlayers: MAX_PLAYERS,
  tickRate: TICK_RATE,
  roundSeconds: 300,
  resultsSeconds: 8,
  respawnSeconds: 3,
  protectionSeconds: 3,
};
export type GameCommand =
  | { type: 'join'; playerId: string; nickname: string; bot?: boolean }
  | { type: 'leave'; playerId: string }
  | { type: 'connection'; playerId: string; connected: boolean }
  | { type: 'playerCommand'; playerId: string; command: ClientCommand };
export interface Game {
  enqueue(command: GameCommand): void;
  step(fixedDeltaSeconds: number): GameEvent[];
  snapshot(): GameSnapshot;
  dispose(): void;
}
type InputState = {
  queue: InputCommand[];
  latest?: InputCommand;
  highest: number;
  age: number;
};

export function createGame(
  config: GameConfig,
  map: MapDefinition,
  seed: number,
): Game {
  if (
    !Number.isInteger(config.maxPlayers) ||
    config.maxPlayers < 1 ||
    config.maxPlayers > MAX_PLAYERS ||
    map.spawns.length < config.maxPlayers ||
    !Number.isInteger(config.tickRate) ||
    config.tickRate < 30 ||
    config.tickRate > 120 ||
    !Number.isInteger(seed) ||
    [config.roundSeconds, config.resultsSeconds, config.respawnSeconds].some(
      (v) => !Number.isFinite(v) || v <= 0,
    ) ||
    !Number.isFinite(config.protectionSeconds) ||
    config.protectionSeconds < 0 ||
    (config.waveBaseEnemies !== undefined &&
      (!Number.isInteger(config.waveBaseEnemies) ||
        config.waveBaseEnemies < 1 ||
        config.waveBaseEnemies > 30)) ||
    [config.wavePreparationSeconds ?? 8, config.waveSpawnSeconds ?? 1.4].some(
      (v) => !Number.isFinite(v) || v <= 0 || v > 120,
    ) ||
    [
      config.trainingSeconds ?? TRAINING_SECONDS,
      config.challengeCountdown ?? CHALLENGE_COUNTDOWN,
    ].some((v) => !Number.isFinite(v) || v <= 0 || v > 120)
  )
    throw new Error('Invalid game configuration');
  const fixedDelta = 1 / config.tickRate;
  const players = new Map<string, PlayerSnapshot>();
  const inputs = new Map<string, InputState>();
  const slots = new Map<string, number>();
  let collisions = createCollisionWorld(map);
  const history: { tick: number; players: PlayerSnapshot[] }[] = [];
  let queue: GameCommand[] = [];
  let fires: {
    playerId: string;
    command: Extract<ClientCommand, { type: 'fire' }>;
    expires: number;
    lifeId: number;
  }[] = [];
  let tick = 0,
    round = 0,
    remaining = 0,
    winner = '';
  let phase: GameSnapshot['phase'] = 'waiting';
  let mode: GameSnapshot['mode'] = 'arena';
  let hostId = '';
  let botCount = 3;
  let allyCount = 0;
  const enemy = (p: PlayerSnapshot) => p.bot && !p.ally;
  let difficulty: GameSnapshot['difficulty'] = 'normal';
  const brains = new Map<string, ReturnType<typeof createBotBrain>>();
  let wave = emptyWave();
  let waveSpawnTimer = 0;
  let waveSpawnSerial = 0;
  let navigation: ReturnType<typeof createNavigation> | undefined;
  const removePlayer = (id: string) => {
    players.delete(id);
    inputs.delete(id);
    slots.delete(id);
    brains.delete(id);
    fires = fires.filter((f) => f.playerId !== id);
  };
  const removeBots = () => {
    for (const p of players.values()) if (p.bot) removePlayer(p.id);
  };
  let disposed = false;
  const offset = (seed >>> 0) % map.spawns.length;
  const assertLive = () => {
    if (disposed) throw new Error('Game is disposed');
  };
  const spawn = (player: PlayerSnapshot, initial = false, override?: Vec3) => {
    let point = map.spawns[slots.get(player.id) ?? 0]!;
    if (!initial) {
      const points = map.spawns.map(
        (_, i) => map.spawns[(offset + i + round) % map.spawns.length]!,
      );
      point = chooseRespawn(
        points,
        [...players.values()].filter(
          (p) => p.id !== player.id && p.health > 0 && p.ready && p.connected,
        ),
        collisions,
      );
    }
    if (phase === 'waiting' && map.practice?.spawns.length) {
      point =
        map.practice.spawns[
          (slots.get(player.id) ?? 0) % map.practice.spawns.length
        ]!;
    }
    if (mode === 'parkour') point = PARKOUR_START;
    if (mode === 'training' && map.practice?.spawns[0])
      point = map.practice.spawns[0];
    if (mode === 'waves' && !enemy(player)) {
      const positions = map.defense?.players ?? map.spawns;
      point =
        positions[
          Math.max(
            0,
            [...players.values()]
              .filter((p) => !enemy(p))
              .findIndex((p) => p.id === player.id),
          ) % positions.length
        ]!;
    }
    if (mode === 'waves' && player.ally) {
      // Extra defenders must not appear inside one another when humans fill all base slots.
      const offsets = [
        [0, 0],
        [1.2, 0],
        [-1.2, 0],
        [0, 1.2],
        [0, -1.2],
        [1.2, 1.2],
        [-1.2, -1.2],
      ];
      for (const [dx, dz] of offsets) {
        const candidate = { ...point, x: point.x + dx!, z: point.z + dz! };
        if (
          collisions.canOccupy(candidate, 1.8) &&
          [...players.values()].every(
            (p) =>
              p.id === player.id ||
              enemy(p) ||
              p.health <= 0 ||
              Math.hypot(
                p.position.x - candidate.x,
                p.position.z - candidate.z,
              ) >= 0.8,
          )
        ) {
          point = candidate;
          break;
        }
      }
    }
    if (override) point = override;
    Object.assign(player, createMovementState(point));
    player.maxHealth = WEAPONS[player.weapon].health;
    player.health = player.maxHealth;
    player.ammo = WEAPONS[player.weapon].magazine;
    player.secondaryAmmo = PISTOL.magazine;
    player.reserveAmmo = WEAPONS[player.weapon].magazine * 3;
    player.secondaryReserve = PISTOL.magazine * 3;
    player.bloom = player.supplyCooldown = 0;
    player.slot = 'primary';
    player.reloadRemaining = player.fireRemaining = player.respawnRemaining = 0;
    player.protectionRemaining =
      mode === 'waves' && enemy(player) ? 0.6 : config.protectionSeconds;
    player.lifeId++;
    const input = inputs.get(player.id);
    if (input) {
      player.lastProcessedInput = Math.max(0, input.highest);
      input.queue = [];
      delete input.latest;
      input.age = Infinity;
    }
  };
  const addPlayer = (
    id: string,
    nickname: string,
    bot = false,
    spawnPoint?: Vec3,
    ally = false,
  ) => {
    if (players.has(id) || players.size >= config.maxPlayers) return;
    const used = new Set(slots.values());
    const slot = Array.from(
      { length: map.spawns.length },
      (_, i) => (offset + i) % map.spawns.length,
    ).find((i) => !used.has(i));
    if (slot === undefined) return;
    slots.set(id, slot);
    inputs.set(id, { queue: [], highest: -1, age: Infinity });
    const player: PlayerSnapshot = {
      ...createMovementState(map.spawns[slot]!),
      id: id,
      bot: bot,
      ally,
      reserveAmmo: 90,
      secondaryReserve: 36,
      bloom: 0,
      supplyCooldown: 0,
      challenge: emptyChallenge(),
      nickname: nickname,
      ready: false,
      connected: true,
      weapon: 'rifle',
      lastProcessedInput: 0,
      health: 100,
      maxHealth: 100,
      ammo: 30,
      secondaryAmmo: PISTOL.magazine,
      slot: 'primary',
      reloadRemaining: 0,
      fireRemaining: 0,
      respawnRemaining: 0,
      protectionRemaining: 0,
      kills: 0,
      deaths: 0,
      lifeId: 0,
    };
    if (player.bot) {
      player.ready = true;
      const index = ally
        ? Number(id.split(':')[1])
        : mode === 'waves'
          ? waveSpawnSerial
          : Number(id.split(':')[1]);
      const botWeapons = ally
        ? (['rifle', 'smg', 'lmg'] as const)
        : (['rifle', 'smg', 'shotgun', 'revolver', 'lmg', 'sniper'] as const);
      // Five opponents cannot cover six classes at once. Rotate the roster
      // deterministically per room so none of the classes becomes unreachable.
      const rosterOffset = ally ? 0 : (seed >>> 0) % botWeapons.length;
      player.weapon = botWeapons[(index + rosterOffset) % botWeapons.length]!;
      brains.set(player.id, createBotBrain(index));
    } else if (!hostId) hostId = player.id;
    players.set(id, player);
    spawn(player, true, spawnPoint);
    return player;
  };
  const startRound = (events: GameEvent[]) => {
    phase = 'active';
    round++;
    remaining = config.roundSeconds;
    winner = '';
    history.length = 0;
    fires = [];
    // Choose match spawns from the arena, independently of the practice lane.
    for (const player of players.values()) {
      if (player.ready)
        player.position = { ...map.spawns[slots.get(player.id) ?? 0]! };
    }
    for (const player of players.values()) {
      player.kills = player.deaths = 0;
      if (player.ready) spawn(player);
    }
    events.push({ type: 'roundStart', round });
  };
  const prepareWave = () => {
    for (const p of players.values()) if (enemy(p)) removePlayer(p.id);
    const humans = [...players.values()].filter((p) => !p.bot).length;
    const desired = Math.max(
      0,
      Math.min(allyCount, config.maxPlayers - humans - 1),
    );
    for (let i = 0; i < desired; i++)
      if (!players.has(`ally:${i}`))
        addPlayer(
          `ally:${i}`,
          ['Союзник · Рук', 'Союзник · Искра', 'Союзник · Бастион'][i]!,
          true,
          undefined,
          true,
        );
    fires = [];
    history.length = 0;
    wave.number++;
    wave.total = waveSize(wave.number, config.waveBaseEnemies ?? 3);
    wave.queued = wave.total;
    wave.alive = 0;
    wave.status = 'preparing';
    wave.remaining = config.wavePreparationSeconds ?? 8;
    waveSpawnTimer = 0;
    for (const player of players.values())
      if (!enemy(player) && player.ready) spawn(player, true);
    phase = 'active';
    remaining = wave.remaining;
    round = wave.number;
  };
  return {
    enqueue(command) {
      assertLive();
      if (queue.length >= 1024) throw new Error('Command queue is full');
      queue.push(structuredClone(command));
    },
    step(delta) {
      assertLive();
      if (!Number.isFinite(delta) || Math.abs(delta - fixedDelta) > 1e-9)
        throw new Error('Game must advance at its configured fixed timestep');
      const events: GameEvent[] = [];
      for (const item of queue) {
        if (item.type === 'join') {
          if (
            players.has(item.playerId) ||
            (!item.bot &&
              mode === 'waves' &&
              [...players.values()].filter((p) => !p.bot).length >=
                Math.min(4, config.maxPlayers - 1))
          )
            continue;
          if (!item.bot && players.size >= config.maxPlayers) {
            const bot =
              [...players.values()].find(enemy) ??
              [...players.values()].find((p) => p.bot);
            if (bot) {
              if (
                mode === 'waves' &&
                wave.status === 'fighting' &&
                enemy(bot) &&
                bot.health > 0
              )
                wave.queued++;
              removePlayer(bot.id);
            }
          }
          if (players.size >= config.maxPlayers) continue;
          const joined = addPlayer(item.playerId, item.nickname, item.bot);
          if (joined) {
            if (mode === 'waves' && wave.status === 'fighting' && !joined.bot)
              joined.health = 0;
            events.push({ type: 'playerJoined', playerId: item.playerId });
          }
        } else if (item.type === 'leave') {
          if (players.has(item.playerId))
            events.push({ type: 'playerLeft', playerId: item.playerId });
          removePlayer(item.playerId);
          if (hostId === item.playerId)
            hostId = [...players.values()].find((p) => !p.bot)?.id ?? '';
          if (!hostId) removeBots();
        } else {
          const player = players.get(item.playerId),
            input = inputs.get(item.playerId);
          if (!player || !input) continue;
          if (item.type === 'connection') {
            player.connected = item.connected;
            input.queue = [];
            delete input.latest;
            input.age = Infinity;
            player.lastProcessedInput = Math.max(0, input.highest);
            fires = fires.filter((f) => f.playerId !== player.id);
            continue;
          }
          if (!player.connected) continue;
          const command = item.command;
          switch (command.type) {
            case 'restartWaves':
              if (
                mode === 'waves' &&
                wave.status === 'defeat' &&
                player.id === hostId
              ) {
                wave = emptyWave(wave.runId + 1);
                phase = 'waiting';
                winner = '';
                removeBots();
                for (const p of players.values()) {
                  p.kills = p.deaths = 0;
                  if (p.ready) spawn(p, true);
                }
              }
              break;
            case 'setMode':
            case 'setMap':
            case 'setBots':
            case 'setAllies': {
              if (player.id !== hostId) {
                events.push({
                  type: 'commandRejected',
                  playerId: player.id,
                  reason: 'hostOnly',
                });
                break;
              }
              if (mode === 'arena' && phase === 'active') {
                events.push({
                  type: 'commandRejected',
                  playerId: player.id,
                  reason: 'matchRunning',
                });
                break;
              }
              if (
                command.type === 'setMode' &&
                command.mode === 'waves' &&
                [...players.values()].filter((p) => !p.bot).length >
                  Math.min(4, config.maxPlayers - 1)
              ) {
                events.push({
                  type: 'commandRejected',
                  playerId: player.id,
                  reason: 'squadFull',
                });
                break;
              }
              if (command.type === 'setAllies') {
                if (mode !== 'waves') break;
                allyCount = command.count;
              } else if (command.type === 'setBots') {
                botCount = command.count;
                difficulty = command.difficulty;
              } else if (command.type === 'setMode') mode = command.mode;
              const nextMap =
                command.type === 'setMap'
                  ? getMap(command.mapId)
                  : (mode === 'training' || mode === 'parkour') &&
                      map.id !== 'switchyard'
                    ? getMap('switchyard')
                    : map;
              if (
                command.type === 'setMap' &&
                (mode === 'training' || mode === 'parkour')
              )
                mode = 'arena';
              if (nextMap !== map) {
                const nextCollisions = createCollisionWorld(nextMap);
                collisions.dispose();
                collisions = nextCollisions;
                map = nextMap;
                navigation = undefined;
              }
              wave = emptyWave(wave.runId);
              removeBots();
              phase = 'waiting';
              remaining = 0;
              winner = '';
              fires = [];
              history.length = 0;
              for (const p of players.values()) {
                p.challenge = {
                  ...emptyChallenge(p.challenge.runId),
                  kind: mode === 'parkour' ? 'parkour' : 'training',
                };
                p.ready = false;
                p.kills = p.deaths = 0;
                spawn(p, true);
              }
              break;
            }
            case 'startChallenge':
              if (
                (mode === 'training' && map.practice?.targets.length) ||
                mode === 'parkour'
              ) {
                const runId = player.challenge.runId + 1;
                spawn(player, true);
                player.ready = true;
                player.challenge = {
                  ...emptyChallenge(runId),
                  kind: mode === 'parkour' ? 'parkour' : 'training',
                  status: 'countdown',
                  weapon: player.weapon,
                  duration:
                    mode === 'parkour'
                      ? PARKOUR_SECONDS
                      : (config.trainingSeconds ?? TRAINING_SECONDS),
                  remaining: config.challengeCountdown ?? CHALLENGE_COUNTDOWN,
                };
                fires = fires.filter((f) => f.playerId !== player.id);
              }
              break;
            case 'cancelChallenge':
              player.challenge = {
                ...emptyChallenge(player.challenge.runId),
                kind: player.challenge.kind,
              };
              break;
            case 'ready':
              if (phase !== 'active' || command.ready) {
                const wasReady = player.ready;
                player.ready = command.ready;
                if (
                  phase === 'active' &&
                  player.ready &&
                  !wasReady &&
                  !(mode === 'waves' && wave.status === 'fighting')
                )
                  spawn(player);
              }
              break;
            case 'selectWeapon':
              if (challengeActive(player.challenge)) break;
              if (
                phase !== 'active' ||
                player.health <= 0 ||
                !player.ready ||
                (mode === 'waves' && wave.status === 'preparing')
              ) {
                player.weapon = command.weapon;
                if (
                  !(
                    mode === 'waves' &&
                    (wave.status === 'fighting' || wave.status === 'defeat')
                  ) &&
                  (phase !== 'active' ||
                    !player.ready ||
                    (mode === 'waves' && wave.status === 'preparing'))
                )
                  spawn(player, true);
              }
              break;
            case 'input':
              if (command.seq > input.highest) {
                input.highest = command.seq;
                // At most one movement step per server tick; bounded jitter buffer.
                if (input.queue.length === 8) input.queue.shift();
                input.queue.push(command);
              }
              break;
            case 'selectSlot':
              if (challengeActive(player.challenge)) break;
              if (
                player.health > 0 &&
                phase !== 'results' &&
                player.slot !== command.slot
              ) {
                player.slot = command.slot;
                player.reloadRemaining = 0;
                player.aimProgress = 0;
                player.fireRemaining = Math.max(player.fireRemaining, 0.22);
                fires = fires.filter((f) => f.playerId !== player.id);
              }
              break;
            case 'reload':
              if (
                phase !== 'results' &&
                player.ready &&
                player.health > 0 &&
                player.reloadRemaining === 0 &&
                reserveAmmo(player) > 0 &&
                magazineAmmo(player) < FIREARMS[equippedWeapon(player)].magazine
              )
                player.reloadRemaining =
                  FIREARMS[equippedWeapon(player)].reload;
              break;
            case 'fire':
              if (fires.filter((f) => f.playerId === player.id).length < 4)
                fires.push({
                  playerId: player.id,
                  command,
                  expires: tick + Math.ceil(config.tickRate * 0.2),
                  lifeId: player.lifeId,
                });
              break;
          }
        }
      }
      queue = [];
      if (mode === 'bots' && hostId) {
        const humans = [...players.values()].filter((p) => !p.bot).length;
        const desired = Math.min(botCount, config.maxPlayers - humans);
        for (let i = 0; i < desired; i++)
          if (!players.has(`bot:${i}`))
            queue.push({
              type: 'join',
              playerId: `bot:${i}`,
              nickname: [
                'BOT · Rook',
                'BOT · Spark',
                'BOT · Dash',
                'BOT · Echo',
                'BOT · Volt',
              ][i]!,
              bot: true,
            });
      }
      const humanReady = [...players.values()].some(
        (p) => !p.bot && p.ready && p.connected,
      );
      const readyCount = [...players.values()].filter(
        (p) => p.ready && p.connected,
      ).length;
      const canStart =
        (mode === 'arena' || mode === 'bots') && readyCount >= 2 && humanReady;
      if (mode === 'waves') {
        if (phase === 'waiting' && humanReady) {
          wave.runId++;
          prepareWave();
        }
        if (wave.status === 'preparing') {
          wave.remaining = Math.max(0, wave.remaining - delta);
          remaining = wave.remaining;
          if (wave.remaining < 1e-8) {
            wave.status = 'fighting';
            remaining = 0;
            events.push({
              type: 'waveStart',
              number: wave.number,
              total: wave.total,
            });
          }
        }
        if (wave.status === 'fighting') {
          waveSpawnTimer = Math.max(0, waveSpawnTimer - delta);
          const humans = [...players.values()].filter(
            (p) => !enemy(p) && p.ready && p.connected && p.health > 0,
          );
          const bots = [...players.values()].filter(enemy);
          if (
            humans.length &&
            wave.queued > 0 &&
            waveSpawnTimer === 0 &&
            bots.length < botCount &&
            players.size < config.maxPlayers
          ) {
            const point = chooseEnemySpawn(
              map.defense?.enemies ?? map.spawns,
              humans,
              bots,
              collisions,
              map.defense?.concealedSpawns,
            );
            if (point) {
              const id = `wave:${wave.runId}:${++waveSpawnSerial}`;
              const enemy = addPlayer(
                id,
                `Налётчик ${waveSpawnSerial}`,
                true,
                point,
              );
              if (enemy) {
                const weapons = [
                  'rifle',
                  'smg',
                  'shotgun',
                  'revolver',
                  'sniper',
                  'lmg',
                ] as const;
                enemy.weapon =
                  weapons[
                    (waveSpawnSerial + wave.number - 2) %
                      Math.min(wave.number + 2, weapons.length)
                  ]!;
                enemy.maxHealth = enemy.health = Math.min(
                  160,
                  WEAPONS[enemy.weapon].health + (wave.number - 1) * 5,
                );
                enemy.ammo = WEAPONS[enemy.weapon].magazine;
                enemy.reserveAmmo = enemy.ammo * 3;
                wave.queued--;
                waveSpawnTimer = config.waveSpawnSeconds ?? 1.4;
                events.push({ type: 'playerJoined', playerId: id });
              }
            }
          }
        }
      } else if (phase === 'waiting' && canStart) startRound(events);
      else if (phase !== 'waiting') {
        remaining = Math.max(0, remaining - delta);
        if (remaining < 1e-8) {
          if (phase === 'active') {
            phase = 'results';
            remaining = config.resultsSeconds;
            fires = [];
            const ranked = [...players.values()]
              .filter((p) => p.ready)
              .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
            const first = ranked[0];
            winner = !first
              ? 'Нет игроков'
              : ranked[1]?.kills === first.kills &&
                  ranked[1]?.deaths === first.deaths
                ? 'Ничья'
                : first.nickname;
            events.push({ type: 'roundEnd', winner });
          } else if (canStart) startRound(events);
          else {
            phase = 'waiting';
            remaining = 0;
            for (const player of players.values()) spawn(player, true);
          }
        }
      }
      for (const player of players.values()) {
        const input = inputs.get(player.id)!;
        if (player.bot && phase === 'active' && player.health > 0) {
          navigation ??= createNavigation(map, collisions);
          const decision = brains.get(player.id)!.update(
            player,
            [...players.values()].filter(
              (p) => mode !== 'waves' || enemy(p) !== enemy(player),
            ),
            collisions,
            navigation,
            difficulty,
            delta,
            tick,
            mode === 'waves'
              ? {
                  team: enemy(player) ? 'attackers' : 'defenders',
                  occupied: [...players.values()].flatMap((p) => {
                    if (
                      p.id === player.id ||
                      p.health <= 0 ||
                      !p.ready ||
                      !p.connected ||
                      enemy(p) !== enemy(player)
                    )
                      return [];
                    const destination = brains.get(p.id)?.intent().destination;
                    return destination
                      ? [p.position, destination]
                      : [p.position];
                  }),
                }
              : {},
          );
          input.queue = [decision.input];
          input.highest = decision.input.seq;
          if (decision.reload && reserveAmmo(player) > 0)
            player.reloadRemaining = WEAPONS[player.weapon].reload;
          if (
            decision.fire &&
            player.fireRemaining <= delta &&
            player.reloadRemaining === 0
          )
            fires.push({
              playerId: player.id,
              command: {
                type: 'fire',
                inputSeq: decision.input.seq,
                yaw: decision.input.yaw,
                pitch: decision.input.pitch,
              },
              expires: tick + 1,
              lifeId: player.lifeId,
            });
        }
        const nextInput = input.queue.shift();
        if (nextInput) {
          input.latest = nextInput;
          input.age = 0;
          player.lastProcessedInput = nextInput.seq;
        }
        input.age += delta;
        const command: InputCommand =
          player.connected && input.latest && input.age <= MOVEMENT.inputTimeout
            ? input.latest
            : {
                type: 'input',
                seq: player.lastProcessedInput,
                yaw: player.yaw,
                pitch: player.pitch,
                buttons: EMPTY_BUTTONS,
              };
        for (const key of [
          'fireRemaining',
          'protectionRemaining',
          'supplyCooldown',
        ] as const)
          player[key] = Math.max(0, player[key] - delta);
        player.bloom = Math.max(0, player.bloom - delta * 0.018);
        if (player.reloadRemaining > 0) {
          player.reloadRemaining = Math.max(0, player.reloadRemaining - delta);
          if (player.reloadRemaining < 1e-8) {
            player.reloadRemaining = 0;
            const amount = Math.min(
              FIREARMS[equippedWeapon(player)].magazine - magazineAmmo(player),
              reserveAmmo(player),
            );
            if (player.slot === 'secondary') {
              player.secondaryAmmo += amount;
              player.secondaryReserve -= amount;
            } else {
              player.ammo += amount;
              player.reserveAmmo -= amount;
            }
          }
        }
        if (player.health <= 0) {
          if (mode === 'waves') {
            if (enemy(player)) {
              player.respawnRemaining = Math.max(
                0,
                player.respawnRemaining - delta,
              );
              if (player.respawnRemaining <= 0) removePlayer(player.id);
            }
            continue;
          }
          if (phase === 'active') {
            player.respawnRemaining = Math.max(
              0,
              player.respawnRemaining - delta,
            );
            if (player.respawnRemaining < 1e-8) {
              spawn(player);
              events.push({ type: 'respawn', playerId: player.id });
            }
          }
          continue;
        }
        if (phase !== 'results')
          Object.assign(
            player,
            predictPlayerMovement(
              player,
              player.reloadRemaining > 0
                ? challengeInput(player, { ...command, aiming: false })
                : challengeInput(player, command),
              delta,
              collisions,
              WEAPONS[player.weapon].speed,
              FIREARMS[equippedWeapon(player)].aimSeconds,
            ),
          );
        if (
          player.ready &&
          phase !== 'results' &&
          player.supplyCooldown === 0 &&
          (player.reserveAmmo < WEAPONS[player.weapon].magazine * 3 ||
            player.secondaryReserve < PISTOL.magazine * 3)
        ) {
          const near = (map.supplies ?? []).some((point) => {
            const eye = { ...player.position, y: player.position.y + 1 };
            const length = Math.hypot(
              point.x - eye.x,
              point.y - eye.y,
              point.z - eye.z,
            );
            return length < 2.6 && visible(collisions, eye, point);
          });
          if (near || mode === 'training') {
            player.reserveAmmo = WEAPONS[player.weapon].magazine * 3;
            player.secondaryReserve = PISTOL.magazine * 3;
            player.supplyCooldown = 20;
            events.push({ type: 'resupply', playerId: player.id });
          }
        }
        events.push(
          ...advanceChallenge(
            player,
            delta,
            tick,
            map.practice?.targets.length ?? 0,
          ),
        );
      }
      for (const fire of fires) {
        const shooter = players.get(fire.playerId);
        if (
          !shooter ||
          !shooter.connected ||
          mode === 'parkour' ||
          shooter.challenge.status === 'countdown' ||
          shooter.lifeId !== fire.lifeId ||
          phase === 'results' ||
          !shooter.ready ||
          shooter.health <= 0
        ) {
          fire.expires = -1;
          continue;
        }
        if (shooter.lastProcessedInput < fire.command.inputSeq) continue;
        fire.expires = -1;
        const weapon =
          fire.command.attack === 'knife' ? 'knife' : equippedWeapon(shooter);
        if (
          shooter.fireRemaining > 1e-8 ||
          shooter.reloadRemaining > 0 ||
          (weapon !== 'knife' && magazineAmmo(shooter) <= 0)
        )
          continue;
        if (challengeActive(shooter.challenge) && weapon === 'knife') continue;
        if (mode === 'training' && shooter.challenge.status === 'running')
          shooter.challenge.shots++;
        shooter.fireRemaining = (
          weapon === 'knife' ? KNIFE : FIREARMS[weapon]
        ).interval;
        if (weapon !== 'knife') {
          if (shooter.slot === 'secondary') shooter.secondaryAmmo--;
          else shooter.ammo--;
        }
        // Spawn shield lasts the full configured duration, including while firing.
        const rewindTick = Math.max(
          tick - Math.ceil(config.tickRate * 0.2),
          Math.min(tick, fire.command.viewTick ?? tick),
        );
        const frame = [...history].reverse().find((h) => h.tick <= rewindTick);
        const targets = [...players.values()]
          .filter((p) => mode !== 'waves' || enemy(p) !== enemy(shooter))
          .map((p) => {
            const old = frame?.players.find(
              (t) => t.id === p.id && t.lifeId === p.lifeId,
            );
            return old
              ? {
                  ...p,
                  position: old.position,
                  crouched: old.crouched,
                  yaw: old.yaw,
                }
              : p;
          });
        const shot = traceShot(
          shooter,
          phase === 'waiting'
            ? (mode === 'training'
                ? movingTargets(map, rewindTick, config.tickRate).filter(
                    (_, i) =>
                      shooter.challenge.status !== 'running' ||
                      (i === shooter.challenge.targetIndex &&
                        rewindTick >= shooter.challenge.targetTick),
                  )
                : (map.practice?.targets ?? [])
              ).map((target) => ({
                ...target,
                health: 1000,
                ready: true,
                crouched: false,
              }))
            : targets,
          collisions,
          fire.command.yaw,
          fire.command.pitch,
          weapon,
          seed ^ tick ^ shooter.lastProcessedInput,
        );
        if (weapon !== 'knife' && FIREARMS[weapon].automatic) {
          const config = FIREARMS[weapon];
          shooter.bloom = Math.min(
            config.maxBloom ?? 0.026,
            shooter.bloom + (config.bloomPerShot ?? 0.005),
          );
        }
        events.push({
          type: 'shot',
          playerId: shooter.id,
          weapon,
          origin: shot.origin,
          ends: shot.ends,
          impacts: shot.impacts,
        });
        for (const [id, hit] of shot.hits) {
          if (phase === 'waiting') {
            if (mode === 'training')
              recordTrainingHit(
                shooter.challenge,
                hit.headshot,
                tick,
                config.tickRate,
              );
            events.push({
              type: 'practiceHit',
              playerId: shooter.id,
              targetId: id,
              ...hit,
            });
            continue;
          }
          const target = players.get(id);
          if (!target || target.health <= 0 || target.protectionRemaining > 0)
            continue;
          const damage = Math.min(
            target.health,
            hit.damage * (mode === 'waves' && enemy(shooter) ? 0.7 : 1),
          );
          target.health = Math.max(0, target.health - damage);
          events.push({
            type: 'hit',
            playerId: shooter.id,
            targetId: id,
            damage,
            headshot: hit.headshot,
          });
          if (target.health === 0) {
            target.deaths++;
            shooter.kills++;
            target.respawnRemaining =
              mode === 'waves'
                ? enemy(target)
                  ? 1.6
                  : 0
                : config.respawnSeconds;
            target.reloadRemaining = 0;
            target.velocity = { x: 0, y: 0, z: 0 };
            events.push({
              type: 'kill',
              playerId: shooter.id,
              targetId: id,
              attacker: shooter.nickname,
              victim: target.nickname,
              weapon,
            });
          }
        }
      }
      if (
        mode === 'waves' &&
        (wave.status === 'fighting' || wave.status === 'preparing')
      ) {
        wave.alive = [...players.values()].filter(
          (p) => enemy(p) && p.health > 0,
        ).length;
        const defenders = [...players.values()].filter(
          (p) => !enemy(p) && p.ready && p.connected && p.health > 0,
        );
        if (defenders.length === 0 || !humanReady) {
          wave.status = 'defeat';
          wave.remaining = 0;
          phase = 'results';
          remaining = 0;
          winner = `Волн отражено: ${wave.cleared}`;
          fires = [];
          events.push({ type: 'defeat', cleared: wave.cleared });
        } else if (
          wave.status === 'fighting' &&
          wave.alive === 0 &&
          wave.queued === 0
        ) {
          wave.cleared = wave.number;
          events.push({ type: 'waveCleared', number: wave.number });
          prepareWave();
        }
      }
      fires = fires.filter((f) => f.expires > tick);
      history.push({ tick, players: structuredClone([...players.values()]) });
      if (history.length > Math.ceil(config.tickRate * 0.2) + 2)
        history.shift();
      tick++;
      return events;
    },
    snapshot() {
      assertLive();
      return {
        tick,
        wave: { ...wave },
        mapId: map.id,
        mode,
        hostId,
        botCount,
        allyCount,
        difficulty,
        phase,
        round,
        remaining,
        winner,
        players: structuredClone([...players.values()]),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      collisions.dispose();
      players.clear();
      inputs.clear();
      slots.clear();
      brains.clear();
      queue = [];
      fires = [];
      history.length = 0;
    },
  };
}
