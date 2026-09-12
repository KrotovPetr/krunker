import type {
  BotDifficulty,
  InputCommand,
  PlayerSnapshot,
  Vec3,
} from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { EMPTY_BUTTONS, playerHeight } from '../movement/controller.js';

import { visible } from './navigation.js';
import type { createNavigation } from './navigation.js';
export { createNavigation, visible } from './navigation.js';
import { choosePosition, preferredRange } from './tactics.js';
import type { BotContext, BotState, BotGoal } from './tactics.js';
import { WEAPONS } from '../combat/weapons.js';

const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

export function createBotBrain(id: number) {
  let path: Vec3[] = [],
    goal: BotGoal | undefined;
  let state: BotState = 'patrol',
    life = -1;
  let replan = 0,
    seenFor = 0,
    targetId = '',
    jumpCooldown = 0;
  let lastSeen: Vec3 | undefined,
    memory = 0,
    burst = 0,
    pause = 0,
    cursor = id;
  let stalled = 0,
    bestWaypointDistance = Infinity,
    moving = false;
  let hold = 0,
    coverCooldown = 0,
    coverRemaining = 0;
  let avoid: Vec3 | undefined,
    avoidRemaining = 0;
  const excluded = new Map<string, number>();
  let directiveKey = '';
  const settings = {
    easy: { reaction: 0.95, error: 0.05, turn: 1.3 },
    normal: { reaction: 0.7, error: 0.027, turn: 1.8 },
    hard: { reaction: 0.45, error: 0.014, turn: 2.4 },
  };
  const clearGoal = () => {
    path = [];
    goal = undefined;
    stalled = 0;
    bestWaypointDistance = Infinity;
    moving = false;
    replan = 0;
    hold = 0;
  };
  return {
    intent(): { state: BotState; destination?: Vec3; goalId?: string } {
      return {
        state,
        ...(goal
          ? { destination: { ...goal.position }, goalId: goal.key }
          : {}),
      };
    },
    update(
      player: PlayerSnapshot,
      players: PlayerSnapshot[],
      world: CollisionWorld,
      navigation: ReturnType<typeof createNavigation>,
      difficulty: BotDifficulty,
      dt: number,
      tick: number,
      context: BotContext = {},
    ): { input: InputCommand; fire: boolean; reload: boolean } {
      if (life !== player.lifeId) {
        clearGoal();
        excluded.clear();
        lastSeen = undefined;
        memory = 0;
        seenFor = 0;
        targetId = '';
        burst = pause = coverCooldown = coverRemaining = 0;
        avoid = undefined;
        avoidRemaining = 0;
        state = 'patrol';
        life = player.lifeId;
      }
      const input: InputCommand = {
        type: 'input',
        seq: player.lastProcessedInput + 1,
        yaw: player.yaw,
        pitch: player.pitch,
        buttons: { ...EMPTY_BUTTONS },
      };
      if (player.health <= 0) return { input, fire: false, reload: false };
      const candidates = players
        .filter(
          (p) => p.id !== player.id && p.ready && p.connected && p.health > 0,
        )
        .sort(
          (a, b) =>
            distance(a.position, player.position) -
            distance(b.position, player.position),
        );
      const eye = {
        ...player.position,
        y: player.position.y + playerHeight(player) - 0.15,
      };
      const body = (p: PlayerSnapshot) => ({
        ...p.position,
        y: p.position.y + playerHeight(p) * 0.55,
      });
      const target = candidates.find((p) => {
        const bearing = Math.atan2(
          -(p.position.x - eye.x),
          -(p.position.z - eye.z),
        );
        return (
          (Math.abs(angle(bearing - player.yaw)) < 1.2 ||
            distance(p.position, player.position) < 5) &&
          visible(world, eye, body(p))
        );
      });
      const canSee = !!target;
      memory = Math.max(0, memory - dt);
      pause = Math.max(0, pause - dt);
      coverCooldown = Math.max(0, coverCooldown - dt);
      coverRemaining = Math.max(0, coverRemaining - dt);
      avoidRemaining = Math.max(0, avoidRemaining - dt);
      if (!avoidRemaining) avoid = undefined;
      for (const [key, seconds] of excluded) {
        if (seconds <= dt) excluded.delete(key);
        else excluded.set(key, seconds - dt);
      }
      if (target) {
        if (targetId !== target.id) {
          seenFor = 0;
          burst = 0;
          replan = 0;
        }
        targetId = target.id;
        lastSeen = { ...target.position };
        memory = 3;
      } else seenFor = 0;
      const threat = memory > 0 ? lastSeen : undefined;
      const needsSupply =
        player.reserveAmmo === 0 &&
        player.ammo < 3 &&
        player.supplyCooldown <= 0;
      if (
        target &&
        coverCooldown === 0 &&
        (player.health < player.maxHealth * 0.35 ||
          player.reloadRemaining > 0 ||
          player.ammo === 0)
      ) {
        coverRemaining = 3;
        coverCooldown = 9;
      }
      const desiredState: BotState = needsSupply
        ? 'resupply'
        : coverRemaining > 0 && threat
          ? 'cover'
          : target
            ? 'engage'
            : threat
              ? 'search'
              : context.team === 'attackers'
                ? 'advance'
                : 'patrol';
      if (desiredState !== state) {
        state = desiredState;
        clearGoal();
      }
      const directive =
        state !== 'cover' && state !== 'resupply'
          ? context.directive
          : undefined;
      if ((directive?.key ?? '') !== directiveKey) {
        directiveKey = directive?.key ?? '';
        clearGoal();
      }
      // Progress is measured between waypoints, not by distance walked. Running
      // circles or retrying the same path cannot reset this timer.
      if (moving && path[0]) {
        const remaining = distance(player.position, path[0]);
        if (remaining < bestWaypointDistance - 0.2) {
          bestWaypointDistance = remaining;
          stalled = 0;
        } else stalled += dt;
        if (stalled >= 2.5) {
          avoid = path[0];
          avoidRemaining = 6;
          if (goal) excluded.set(goal.key, 6);
          clearGoal();
          cursor++;
        }
      }
      replan -= dt;
      jumpCooldown -= dt;
      while (
        path[0] &&
        distance(player.position, path[0]) < (state === 'resupply' ? 0.2 : 0.65)
      ) {
        path.shift();
        stalled = 0;
        bestWaypointDistance = Infinity;
      }
      const range = distance(
        player.position,
        target?.position ?? threat ?? player.position,
      );
      const preferred = preferredRange(player);
      const mustMove = directive
        ? distance(player.position, directive.position) > directive.radius
        : state !== 'engage' || range > preferred || range < preferred * 0.45;
      if (
        directive &&
        goal &&
        replan <= 0 &&
        distance(goal.position, directive.position) > 2
      )
        clearGoal();
      if (directive && goal && !path.length && mustMove && replan <= 0)
        clearGoal();
      if (!path.length && goal && !directive) {
        if (
          distance(player.position, goal.position) <
          (state === 'resupply' ? 0.3 : 1)
        ) {
          hold += dt;
          if (
            hold > (state === 'cover' ? 2 : player.weapon === 'sniper' ? 3 : 1)
          ) {
            excluded.set(goal.key, 8);
            clearGoal();
            cursor++;
          }
        } else clearGoal();
      }
      if (mustMove && replan <= 0 && !goal) {
        const blocked = new Set(excluded.keys());
        if (directive) {
          const offsets = [
            [-0.7, 0.5],
            [0.7, 0.5],
            [0, -0.7],
          ];
          const [dx, dz] = offsets[id % offsets.length]!;
          const spread = {
            ...directive.position,
            x: directive.position.x + dx!,
            z: directive.position.z + dz!,
          };
          const destination = world.canOccupy(spread, 1.8)
            ? spread
            : directive.position;
          const route = navigation.plan(player.position, destination, avoid);
          if (route)
            goal = { key: directive.key, position: route.destination, route };
        } else if (state === 'resupply') {
          const supply = navigation.supply(player.position, avoid);
          const key = supply ? 'supply:' + supply.x + ':' + supply.z : '';
          const route =
            supply && !blocked.has(key)
              ? navigation.plan(player.position, supply, avoid)
              : undefined;
          if (route) goal = { key, position: route.destination, route };
        } else if (state === 'search' && threat && !blocked.has('last-seen')) {
          const route = navigation.plan(player.position, threat, avoid);
          if (route) goal = { key: 'last-seen', position: threat, route };
        }
        if (!directive)
          goal ??= choosePosition(
            player,
            navigation,
            world,
            state,
            cursor,
            blocked,
            context,
            threat,
            avoid,
          );
        if (goal) {
          path = [...goal.route.waypoints];
          bestWaypointDistance = Infinity;
          stalled = 0;
        }
        replan = 0.8 + (id % 5) * 0.05;
        if (!goal) cursor++;
      }
      const waypoint = path[0];
      const look = target
        ? body(target)
        : waypoint
          ? { ...waypoint, y: eye.y }
          : {
              x: eye.x - Math.sin(player.yaw + 0.5),
              y: eye.y,
              z: eye.z - Math.cos(player.yaw + 0.5),
            };
      const dx = look.x - eye.x,
        dz = look.z - eye.z;
      const cfg = settings[difficulty];
      const error = Math.sin(tick * 0.071 + id * 13) * cfg.error;
      const desiredYaw = Math.atan2(-dx, -dz) + error;
      const desiredPitch =
        Math.atan2(look.y - eye.y, Math.hypot(dx, dz)) + error * 0.4;
      input.yaw = angle(
        player.yaw +
          Math.max(
            -cfg.turn * dt,
            Math.min(cfg.turn * dt, angle(desiredYaw - player.yaw)),
          ),
      );
      input.pitch =
        player.pitch +
        Math.max(
          -cfg.turn * dt,
          Math.min(cfg.turn * dt, desiredPitch - player.pitch),
        );
      input.aiming = canSee && state !== 'cover' && state !== 'resupply';
      moving = !!waypoint && mustMove;
      if (moving && waypoint) {
        const mx = waypoint.x - player.position.x,
          mz = waypoint.z - player.position.z;
        const length = Math.max(0.01, Math.hypot(mx, mz));
        const forward =
          (-Math.sin(input.yaw) * mx - Math.cos(input.yaw) * mz) / length;
        const right =
          (Math.cos(input.yaw) * mx - Math.sin(input.yaw) * mz) / length;
        input.buttons.forward = forward > 0.35;
        input.buttons.back = forward < -0.35;
        input.buttons.right = right > 0.35;
        input.buttons.left = right < -0.35;
        if (
          player.grounded &&
          jumpCooldown <= 0 &&
          stalled > 0.45 &&
          Math.hypot(player.velocity.x, player.velocity.z) < 0.75 &&
          waypoint.y > player.position.y + 0.25
        ) {
          input.buttons.jump = true;
          jumpCooldown = 1;
        }
      } else if (
        !directive &&
        canSee &&
        state === 'engage' &&
        player.weapon !== 'lmg'
      ) {
        const strafe = Math.sin(tick / 65 + id * 2);
        input.buttons.left =
          id % 3 !== 0 && player.weapon !== 'sniper' && strafe < -0.4;
        input.buttons.right =
          id % 3 !== 0 && player.weapon !== 'sniper' && strafe > 0.4;
      }
      const settled =
        Math.abs(angle(desiredYaw - input.yaw)) < 0.12 &&
        Math.abs(desiredPitch - input.pitch) < 0.12;
      seenFor = canSee && settled ? seenFor + dt : 0;
      const fire =
        !!target &&
        state !== 'resupply' &&
        state !== 'cover' &&
        target.protectionRemaining <= 0 &&
        seenFor >= cfg.reaction &&
        pause <= 0 &&
        settled &&
        player.ammo > 0 &&
        player.reloadRemaining === 0;
      if (fire && player.fireRemaining <= dt) {
        burst++;
        if (
          burst >=
          (player.weapon === 'lmg'
            ? 10
            : player.weapon === 'smg'
              ? 5
              : player.weapon === 'rifle'
                ? 3
                : 1)
        ) {
          pause = player.weapon === 'sniper' ? 1.3 : 0.55 + (id % 3) * 0.12;
          burst = 0;
        }
      }
      return {
        input,
        fire,
        reload:
          player.reserveAmmo > 0 &&
          player.reloadRemaining === 0 &&
          (player.ammo === 0 ||
            (state === 'cover' &&
              player.ammo < WEAPONS[player.weapon].magazine * 0.5)),
      };
    },
  };
}
