import { z } from 'zod';

// Modes, map metadata and snapshot schemas must match between client and server.
export const PROTOCOL_VERSION = 22;
export const ROOM_TYPE = 'arena';
export const MAX_PLAYERS = 8;
export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const CLIENT_MESSAGE = 'command';
export const SERVER_EVENT = 'event';

export const nicknameSchema = z
  .string()
  .max(128)
  .transform((value) =>
    value
      .normalize('NFKC')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .trim()
      .replace(/\s+/g, ' '),
  )
  .pipe(z.string().min(1).max(20));

export const joinOptionsSchema = z.strictObject({
  nickname: nicknameSchema,
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

export const mapIdSchema = z.enum([
  'switchyard',
  'bastion',
  'sandgate',
  'spillway',
]);
export const modeSchema = z.enum([
  'arena',
  'training',
  'bots',
  'parkour',
  'waves',
  'control',
  'mission',
]);
export type GameMode = z.infer<typeof modeSchema>;
export const isTeamMode = (mode: GameMode) =>
  mode === 'waves' || mode === 'control' || mode === 'mission';
export const difficultySchema = z.enum(['easy', 'normal', 'hard']);
export type BotDifficulty = z.infer<typeof difficultySchema>;

export const weaponSchema = z.enum([
  'rifle',
  'sniper',
  'shotgun',
  'smg',
  'revolver',
  'lmg',
  'sapper',
]);
export type WeaponId = z.infer<typeof weaponSchema>;
// Keep the retired revolver readable in historical results, not selectable.
export const selectableWeaponSchema = weaponSchema.exclude(['revolver']);
export type SelectableWeaponId = z.infer<typeof selectableWeaponSchema>;
const sequence = z.number().int().min(0).max(0xffffffff);
const look = {
  yaw: z.number().finite().min(-Math.PI).max(Math.PI),
  pitch: z
    .number()
    .finite()
    .min(-Math.PI / 2)
    .max(Math.PI / 2),
};

export const clientCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('input'),
    seq: sequence,
    aiming: z.boolean().optional(),
    interacting: z.boolean().optional(),
    ...look,
    buttons: z.strictObject({
      forward: z.boolean(),
      back: z.boolean(),
      left: z.boolean(),
      right: z.boolean(),
      jump: z.boolean(),
      crouch: z.boolean(),
    }),
  }),
  z.strictObject({
    type: z.literal('fire'),
    inputSeq: sequence,
    ...look,
    attack: z.enum(['primary', 'knife']).optional(),
    viewTick: sequence.optional(),
  }),
  z.strictObject({ type: z.literal('reload') }),
  z.strictObject({ type: z.literal('deployMine') }),
  z.strictObject({
    type: z.literal('squadOrder'),
    kind: z.enum(['follow', 'hold', 'attack']),
    ...look,
  }),
  z.strictObject({ type: z.literal('throwGrenade'), ...look }),
  z.strictObject({
    type: z.literal('selectSlot'),
    slot: z.enum(['primary', 'secondary', 'knife']),
  }),
  z.strictObject({
    type: z.literal('selectWeapon'),
    weapon: selectableWeaponSchema,
  }),
  z.strictObject({ type: z.literal('ready'), ready: z.boolean() }),
  z.strictObject({ type: z.literal('setMode'), mode: modeSchema }),
  z.strictObject({ type: z.literal('setMap'), mapId: mapIdSchema }),
  z.strictObject({
    type: z.literal('setBots'),
    count: z.number().int().min(1).max(5),
    difficulty: difficultySchema,
  }),
  z.strictObject({ type: z.literal('startChallenge') }),
  z.strictObject({ type: z.literal('cancelChallenge') }),
  z.strictObject({ type: z.literal('restartWaves') }),
  z.strictObject({ type: z.literal('restartMission') }),
  z.strictObject({
    type: z.literal('setAllies'),
    count: z.number().int().min(0).max(3),
  }),
]);
export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type InputCommand = Extract<ClientCommand, { type: 'input' }>;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface MovementSnapshot {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  grounded: boolean;
  crouched: boolean;
  sliding: boolean;
  slideRemaining: number;
  slideCooldown: number;
  jumpBuffer: number;
  coyoteRemaining: number;
  jumpWasDown: boolean;
  crouchWasDown: boolean;
  landed: boolean;
  aimProgress: number;
  landingRemaining: number;
}
export interface ChallengeSnapshot {
  kind: 'training' | 'parkour';
  status: 'idle' | 'countdown' | 'running' | 'finished' | 'failed';
  runId: number;
  elapsed: number;
  remaining: number;
  duration: number;
  shots: number;
  hits: number;
  headshots: number;
  reactionMs: number;
  checkpoint: number;
  targetIndex: number;
  targetTick: number;
  weapon: WeaponId;
}
export interface ChallengeResult {
  kind: ChallengeSnapshot['kind'];
  runId: number;
  elapsed: number;
  duration: number;
  shots: number;
  hits: number;
  headshots: number;
  reactionMs: number;
  weapon: WeaponId;
  course: string;
}
export interface PlayerSnapshot extends MovementSnapshot {
  colorIndex: number;
  id: string;
  bot: boolean;
  ally: boolean;
  reserveAmmo: number;
  secondaryReserve: number;
  bloom: number;
  supplyCooldown: number;
  mineCooldown: number;
  grenades: number;
  healthCooldown: number;
  challenge: ChallengeSnapshot;
  nickname: string;
  ready: boolean;
  weapon: WeaponId;
  lastProcessedInput: number;
  connected: boolean;
  health: number;
  maxHealth: number;
  ammo: number;
  secondaryAmmo: number;
  slot: 'primary' | 'secondary' | 'knife';
  reloadRemaining: number;
  fireRemaining: number;
  respawnRemaining: number;
  protectionRemaining: number;
  kills: number;
  deaths: number;
  lifeId: number;
}
export interface WaveSnapshot {
  number: number;
  status: 'idle' | 'preparing' | 'fighting' | 'defeat';
  remaining: number;
  alive: number;
  queued: number;
  total: number;
  cleared: number;
  runId: number;
}
export interface ControlSnapshot {
  progress: number;
  owner: 'neutral' | 'allies' | 'enemies';
  contested: boolean;
  allies: number;
  enemies: number;
  allyScore: number;
  enemyScore: number;
}
export interface SquadOrderSnapshot {
  kind: 'auto' | 'follow' | 'hold' | 'attack';
  commanderId: string;
  position: Vec3;
  remaining: number;
  serial: number;
}
export interface MineSnapshot {
  id: string;
  ownerId: string;
  position: Vec3;
  armed: boolean;
}
export interface GrenadeSnapshot {
  id: string;
  ownerId: string;
  position: Vec3;
  remaining: number;
}
export type MissionStage =
  | 'idle'
  | 'dispatch'
  | 'cell'
  | 'deliver'
  | 'switch'
  | 'defend'
  | 'override'
  | 'extract'
  | 'departing'
  | 'complete'
  | 'failed';
export interface MissionSnapshot {
  stage: MissionStage;
  checkpoint: MissionStage;
  progress: number;
  remaining: number;
  elapsed: number;
  carrierId: string;
  cargo: Vec3;
  queued: number;
  alive: number;
  runId: number;
  serial: number;
  attempts: number;
  boarded: number;
  required: number;
}
export interface GameSnapshot {
  mission?: MissionSnapshot;
  control?: ControlSnapshot;
  squadOrder?: SquadOrderSnapshot;
  grenades: GrenadeSnapshot[];
  mines: MineSnapshot[];
  wave: WaveSnapshot;
  mapId: string;
  tick: number;
  mode: GameMode;
  hostId: string;
  botCount: number;
  allyCount: number;
  difficulty: BotDifficulty;
  phase: 'waiting' | 'active' | 'results';
  round: number;
  remaining: number;
  winner: string;
  players: PlayerSnapshot[];
}
export type GameEvent =
  | {
      type: 'equipmentRejected';
      playerId: string;
      item: 'mine' | 'grenade';
      reason:
        | 'unavailable'
        | 'sapperOnly'
        | 'airborne'
        | 'cooldown'
        | 'empty'
        | 'limit'
        | 'reload'
        | 'blocked';
    }
  | { type: 'grenadeThrown'; playerId: string }
  | { type: 'healed'; playerId: string; amount: number }
  | { type: 'explosion'; playerId: string; position: Vec3 }
  | {
      type: 'commandRejected';
      playerId: string;
      reason:
        | 'hostOnly'
        | 'matchRunning'
        | 'squadFull'
        | 'invalidOrder'
        | 'orderCooldown';
    }
  | { type: 'resupply'; playerId: string }
  | { type: 'playerJoined'; playerId: string }
  | { type: 'playerLeft'; playerId: string }
  | {
      type: 'shot';
      playerId: string;
      weapon: WeaponId | 'pistol' | 'knife';
      origin: Vec3;
      ends: Vec3[];
      impacts?: { position: Vec3; normal: Vec3 }[];
    }
  | {
      type: 'hit';
      playerId: string;
      targetId: string;
      damage: number;
      headshot: boolean;
    }
  | {
      type: 'kill';
      playerId: string;
      targetId: string;
      attacker: string;
      victim: string;
      weapon: WeaponId | 'pistol' | 'knife' | 'mine' | 'grenade';
      headshot: boolean;
      attackerAirborne: boolean;
      victimAirborne: boolean;
      noScope: boolean;
      distance: number;
    }
  | {
      type: 'practiceHit';
      playerId: string;
      targetId: string;
      damage: number;
      headshot: boolean;
    }
  | { type: 'challengeFinished'; playerId: string; result: ChallengeResult }
  | { type: 'checkpoint'; playerId: string; index: number }
  | { type: 'respawn'; playerId: string }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; winner: string }
  | { type: 'waveStart'; number: number; total: number }
  | { type: 'waveCleared'; number: number }
  | { type: 'defeat'; cleared: number };
export type ServerEvent =
  | GameEvent
  | {
      type: 'commandRejected';
      reason:
        | 'invalidCommand'
        | 'notImplemented'
        | 'hostOnly'
        | 'matchRunning'
        | 'squadFull'
        | 'invalidOrder'
        | 'orderCooldown';
    };

export const challengeResultSchema = z.object({
  kind: z.enum(['training', 'parkour']),
  runId: z.number().int().nonnegative(),
  elapsed: z.number().finite().min(0).max(120),
  duration: z.number().finite().positive().max(120),
  shots: z.number().int().min(0).max(2000),
  hits: z.number().int().min(0).max(2000),
  headshots: z.number().int().min(0).max(2000),
  reactionMs: z.number().finite().min(0).max(120000),
  weapon: weaponSchema,
  course: z.literal('switchyard-v1'),
});
