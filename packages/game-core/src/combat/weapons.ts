import type { PlayerSnapshot, Vec3, WeaponId } from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { playerHeight } from '../movement/controller.js';

export interface WeaponConfig {
  name: string;
  health: number;
  speed: number;
  magazine: number;
  damage: number;
  headMultiplier: number;
  interval: number;
  reload: number;
  range: number;
  pellets: number;
  spread: number;
  automatic: boolean;
  aimedSpread: number;
  aimSeconds: number;
  recoil: number;
  bloomPerShot?: number;
  maxBloom?: number;
}
export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  lmg: {
    name: 'Пулемёт «Титан»',
    health: 100,
    speed: 0.6,
    magazine: 100,
    damage: 16,
    headMultiplier: 1.5,
    interval: 1 / 12,
    reload: 6,
    range: 100,
    pellets: 1,
    spread: 0.007,
    aimedSpread: 0.0015,
    aimSeconds: 0.28,
    recoil: 0.005,
    automatic: true,
    bloomPerShot: 0.002,
    maxBloom: 0.004,
  },
  smg: {
    name: 'ПП «Вектор»',
    health: 100,
    speed: 1.18,
    magazine: 32,
    damage: 18,
    headMultiplier: 1.5,
    interval: 0.095,
    reload: 1.45,
    range: 55,
    pellets: 1,
    spread: 0.026,
    aimedSpread: 0.006,
    aimSeconds: 0.1,
    recoil: 0.006,
    automatic: true,
  },
  revolver: {
    name: 'Револьвер',
    health: 100,
    speed: 1.04,
    magazine: 6,
    damage: 60,
    headMultiplier: 1.6,
    interval: 0.46,
    reload: 1.9,
    range: 90,
    pellets: 1,
    spread: 0.022,
    aimedSpread: 0.001,
    aimSeconds: 0.13,
    recoil: 0.026,
    automatic: false,
  },
  rifle: {
    name: 'Автомат',
    health: 100,
    speed: 1,
    magazine: 30,
    damage: 24,
    headMultiplier: 1.5,
    interval: 0.14,
    reload: 1.6,
    range: 100,
    pellets: 1,
    spread: 0.016,
    aimedSpread: 0.002,
    aimSeconds: 0.14,
    recoil: 0.008,
    automatic: true,
  },
  sniper: {
    name: 'Снайперка',
    health: 90,
    speed: 0.9,
    magazine: 5,
    damage: 100,
    headMultiplier: 2,
    interval: 1.1,
    reload: 2.2,
    range: 130,
    pellets: 1,
    spread: 0,
    aimedSpread: 0,
    aimSeconds: 0.22,
    recoil: 0.04,
    automatic: false,
  },
  shotgun: {
    name: 'Дробовик',
    health: 110,
    speed: 0.96,
    magazine: 6,
    damage: 14,
    headMultiplier: 1,
    interval: 0.85,
    reload: 2.4,
    range: 30,
    pellets: 8,
    spread: 0.07,
    aimedSpread: 0.045,
    aimSeconds: 0.16,
    recoil: 0.025,
    automatic: false,
  },
};
export const PISTOL: WeaponConfig = {
  name: 'Пистолет',
  health: 100,
  speed: 1,
  magazine: 12,
  damage: 22,
  headMultiplier: 1.5,
  interval: 0.19,
  reload: 1.25,
  range: 70,
  pellets: 1,
  spread: 0.025,
  aimedSpread: 0.0015,
  aimSeconds: 0.1,
  recoil: 0.012,
  automatic: false,
};
export const FIREARMS = { ...WEAPONS, pistol: PISTOL };
export type FirearmId = WeaponId | 'pistol';
export function equippedWeapon(
  player: Pick<PlayerSnapshot, 'weapon' | 'slot'>,
): FirearmId {
  return player.slot === 'secondary' ? 'pistol' : player.weapon;
}
export function magazineAmmo(
  player: Pick<PlayerSnapshot, 'slot' | 'ammo' | 'secondaryAmmo'>,
) {
  return player.slot === 'secondary' ? player.secondaryAmmo : player.ammo;
}
export const CLASS_NAMES: Record<WeaponId, string> = {
  rifle: 'Штурмовик',
  smg: 'Разведчик',
  sniper: 'Снайпер',
  shotgun: 'Тяжёлый боец',
  revolver: 'Стрелок',
  lmg: 'Пулемётчик',
};
export function reserveAmmo(
  player: Pick<PlayerSnapshot, 'slot' | 'reserveAmmo' | 'secondaryReserve'>,
) {
  return player.slot === 'secondary'
    ? player.secondaryReserve
    : player.reserveAmmo;
}
export function horizontalRecoil(weapon: FirearmId, shot: number) {
  const pattern = [-0.35, 0.2, 0.6, 0.85, 0.45, -0.25, -0.7, -0.9];
  return FIREARMS[weapon].recoil * pattern[shot % pattern.length]! * 0.75;
}
export function weaponSpread(
  config: WeaponConfig,
  aimProgress: number,
  grounded: boolean,
  speed: number,
  bloom = 0,
) {
  const progress = Math.max(0, Math.min(1, aimProgress));
  return (
    (config.spread +
      (config.aimedSpread - config.spread) * progress +
      (config.automatic ? bloom : 0)) *
    (grounded ? 1 : 1.4) *
    (1 + Math.min(speed / 18, 1) * 0.4 * (1 - progress))
  );
}
export const KNIFE = {
  ...WEAPONS.rifle,
  name: 'Нож',
  spread: 0,
  aimedSpread: 0,
  damage: 65,
  headMultiplier: 1,
  interval: 0.5,
  range: 2.2,
  pellets: 1,
};

export function lookDirection(yaw: number, pitch: number): Vec3 {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}
// Slab intersection: hitboxes are deliberately independent of visual meshes.
function rayBox(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3): number {
  let near = 0,
    far = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return Infinity;
    } else {
      const a = (min[axis] - origin[axis]) / direction[axis];
      const b = (max[axis] - origin[axis]) / direction[axis];
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return Infinity;
    }
  }
  return near;
}
export function traceShot(
  shooter: PlayerSnapshot,
  targets: (Pick<
    PlayerSnapshot,
    'id' | 'position' | 'health' | 'ready' | 'crouched'
  > & { yaw?: number })[],
  world: CollisionWorld,
  yaw: number,
  pitch: number,
  weapon: FirearmId | 'knife',
  seed: number,
) {
  const config = weapon === 'knife' ? KNIFE : FIREARMS[weapon];
  const origin = {
    ...shooter.position,
    y: shooter.position.y + playerHeight(shooter) - 0.15,
  };
  const hits = new Map<string, { damage: number; headshot: boolean }>();
  const ends: Vec3[] = [];
  const impacts: { position: Vec3; normal: Vec3 }[] = [];
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  const spread = weaponSpread(
    config,
    shooter.aimProgress,
    shooter.grounded,
    Math.hypot(shooter.velocity.x, shooter.velocity.z),
    shooter.bloom,
  );
  for (let pellet = 0; pellet < config.pellets; pellet++) {
    const direction = lookDirection(
      yaw + (random() * 2 - 1) * spread,
      pitch + (random() * 2 - 1) * spread,
    );
    let distance = world.raycast(origin, direction, config.range);
    let targetId: string | undefined;
    let headshot = false;
    let multiplier = 1;
    for (const target of targets) {
      if (target.id === shooter.id || target.health <= 0 || !target.ready)
        continue;
      const height = playerHeight(target);
      const cos = Math.cos(target.yaw ?? 0),
        sin = Math.sin(target.yaw ?? 0);
      const relative = {
        x: origin.x - target.position.x,
        y: origin.y - target.position.y,
        z: origin.z - target.position.z,
      };
      const localOrigin = {
        x: cos * relative.x - sin * relative.z,
        y: relative.y,
        z: sin * relative.x + cos * relative.z,
      };
      const localDirection = {
        x: cos * direction.x - sin * direction.z,
        y: direction.y,
        z: sin * direction.x + cos * direction.z,
      };

      const parts = [
        {
          name: 'head',
          x: 0,
          radius: 0.23,
          low: height - 0.36,
          high: height,
          multiplier: config.headMultiplier,
        },
        {
          name: 'torso',
          x: 0,
          radius: 0.23,
          low: height * 0.42,
          high: height - 0.36,
          multiplier: 1,
        },
        {
          name: 'arms',
          x: -0.31,
          radius: 0.08,
          low: height * 0.42,
          high: height * 0.76,
          multiplier: 0.75,
        },
        {
          name: 'arms',
          x: 0.31,
          radius: 0.08,
          low: height * 0.42,
          high: height * 0.76,
          multiplier: 0.75,
        },
        {
          name: 'legs',
          x: 0,
          radius: 0.23,
          low: 0,
          high: height * 0.42,
          multiplier: 0.65,
        },
      ];
      for (const part of parts) {
        const min = {
          x: part.x - part.radius,
          y: part.low,
          z: -0.23,
        };
        const max = {
          x: part.x + part.radius,
          y: part.high,
          z: 0.23,
        };
        const hit = rayBox(localOrigin, localDirection, min, max);
        if (hit < distance) {
          distance = hit;
          targetId = target.id;
          headshot = part.name === 'head';
          multiplier = weapon === 'knife' ? 1 : part.multiplier;
        }
      }
    }
    ends.push({
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance,
    });
    if (!targetId && distance < config.range) {
      const surface = world.raycastSurface?.(origin, direction, config.range);
      if (surface)
        impacts.push({
          position: { ...ends[ends.length - 1]! },
          normal: surface.normal,
        });
    }
    if (targetId) {
      const falloff =
        weapon === 'shotgun'
          ? Math.max(0.2, Math.min(1, 1 - (distance - 6) / 24))
          : weapon === 'smg'
            ? Math.max(0.45, Math.min(1, 1 - (distance - 12) / 55))
            : 1;
      const damage = config.damage * multiplier * falloff;
      const previous = hits.get(targetId);
      hits.set(targetId, {
        damage: (previous?.damage ?? 0) + damage,
        headshot: headshot || (previous?.headshot ?? false),
      });
    }
  }
  return { origin, ends, hits, impacts };
}
