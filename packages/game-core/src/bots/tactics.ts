import type { PlayerSnapshot, Vec3 } from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { visible } from './navigation.js';
import type { createNavigation, NavigationRoute } from './navigation.js';

export type BotState =
  'patrol' | 'advance' | 'engage' | 'search' | 'cover' | 'resupply';
export interface BotContext {
  directive?: { key: string; position: Vec3; radius: number };
  team?: 'attackers' | 'defenders';
  occupied?: readonly Vec3[];
}
export interface BotGoal {
  key: string;
  position: Vec3;
  route: NavigationRoute;
}
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function preferredRange(player: PlayerSnapshot) {
  return player.weapon === 'shotgun'
    ? 7
    : player.weapon === 'smg'
      ? 10
      : player.weapon === 'sniper'
        ? 30
        : player.weapon === 'lmg'
          ? 24
          : 19;
}

/** Scores only authored positions and a known threat. Hidden enemy snapshots
 * never enter tactical planning. Path searches are limited to four candidates. */
export function choosePosition(
  player: PlayerSnapshot,
  navigation: ReturnType<typeof createNavigation>,
  world: CollisionWorld,
  state: BotState,
  cursor: number,
  excluded: ReadonlySet<string>,
  context: BotContext,
  threat?: Vec3,
  avoid?: Vec3,
): BotGoal | undefined {
  const points = navigation.positions;
  const desiredRange = preferredRange(player);
  const candidates = points
    .flatMap((point, index) => {
      if (
        excluded.has(point.id) ||
        distance(player.position, point.position) < 1.5
      )
        return [];
      const travel = distance(player.position, point.position);
      const exposed =
        threat &&
        visible(
          world,
          { ...point.position, y: point.position.y + 1.6 },
          { ...threat, y: threat.y + 1 },
        );
      if (state === 'cover' && (!threat || exposed)) return [];
      let score = travel * 0.12;
      score += (context.occupied ?? []).reduce(
        (sum, p) => sum + (distance(p, point.position) < 3 ? 80 : 0),
        0,
      );
      if (threat && state !== 'cover') {
        score +=
          Math.abs(distance(point.position, threat) - desiredRange) * 0.7;
        score += exposed ? -8 : 4;
        if (state === 'search') score += distance(point.position, threat) * 0.8;
      } else if (state === 'cover') {
        score += travel * 0.4;
      } else {
        score +=
          ((index - (cursor % points.length) + points.length) % points.length) *
          1.5;
        if (context.team && navigation.defenseCenter)
          score += distance(point.position, navigation.defenseCenter) * 0.4;
      }
      if (player.weapon === 'sniper' && point.role === 'overwatch') score -= 8;
      if (
        player.weapon === 'lmg' &&
        (point.role === 'guard' || point.role === 'overwatch')
      )
        score -= 6;
      if (
        (player.weapon === 'smg' || player.weapon === 'shotgun') &&
        point.role === 'flank'
      )
        score -= 5;
      if (context.team === 'defenders' && point.role === 'guard') score -= 6;
      if (context.team === 'attackers' && point.role === 'advance') score -= 5;
      return [{ point, score }];
    })
    .sort((a, b) => a.score - b.score);
  for (const { point } of candidates.slice(0, 4)) {
    const route = navigation.plan(player.position, point.position, avoid);
    if (route) return { key: point.id, position: point.position, route };
  }
  return undefined;
}
