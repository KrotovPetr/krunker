import { PlayerState, MineState, GrenadeState } from '@fps/protocol/schema';
import type { ArenaState } from '@fps/protocol/schema';
import type { GameSnapshot } from '@fps/protocol';
import { emptyControl, emptySquadOrder, emptyMission } from '@fps/game-core';

export function syncState(state: ArenaState, snapshot: GameSnapshot): void {
  const mission = snapshot.mission ?? emptyMission();
  const { cargo, ...missionFields } = mission;
  Object.assign(state.mission, missionFields, {
    cargoX: cargo.x,
    cargoY: cargo.y,
    cargoZ: cargo.z,
  });
  Object.assign(state.control, snapshot.control ?? emptyControl());
  const order = snapshot.squadOrder ?? emptySquadOrder();
  Object.assign(state.squadOrder, {
    kind: order.kind,
    commanderId: order.commanderId,
    x: order.position.x,
    y: order.position.y,
    z: order.position.z,
    remaining: order.remaining,
    serial: order.serial,
  });
  const grenadeIds = new Set(snapshot.grenades.map((g) => g.id));
  for (const id of state.grenades.keys())
    if (!grenadeIds.has(id)) state.grenades.delete(id);
  for (const grenade of snapshot.grenades) {
    let target = state.grenades.get(grenade.id);
    if (!target) {
      target = new GrenadeState();
      state.grenades.set(grenade.id, target);
    }
    Object.assign(target, {
      id: grenade.id,
      ownerId: grenade.ownerId,
      x: grenade.position.x,
      y: grenade.position.y,
      z: grenade.position.z,
      remaining: grenade.remaining,
    });
  }
  const mineIds = new Set(snapshot.mines.map((m) => m.id));
  for (const id of state.mines.keys())
    if (!mineIds.has(id)) state.mines.delete(id);
  for (const mine of snapshot.mines) {
    let target = state.mines.get(mine.id);
    if (!target) {
      target = new MineState();
      state.mines.set(mine.id, target);
    }
    Object.assign(target, {
      id: mine.id,
      ownerId: mine.ownerId,
      armed: mine.armed,
      x: mine.position.x,
      y: mine.position.y,
      z: mine.position.z,
    });
  }
  Object.assign(state.wave, snapshot.wave);
  state.tick = snapshot.tick;
  state.mapId = snapshot.mapId;
  state.mode = snapshot.mode;
  state.hostId = snapshot.hostId;
  state.botCount = snapshot.botCount;
  state.allyCount = snapshot.allyCount;
  state.difficulty = snapshot.difficulty;
  state.phase = snapshot.phase;
  state.round = snapshot.round;
  state.remaining = snapshot.remaining;
  state.winner = snapshot.winner;
  const active = new Set(snapshot.players.map((player) => player.id));
  for (const id of state.players.keys()) {
    if (!active.has(id)) state.players.delete(id);
  }
  for (const player of snapshot.players) {
    let target = state.players.get(player.id);
    if (!target) {
      target = new PlayerState();
      state.players.set(player.id, target);
    }
    target.id = player.id;
    target.colorIndex = player.colorIndex;
    target.bot = player.bot;
    target.supplyCooldown = player.supplyCooldown;
    target.mineCooldown = player.mineCooldown;
    target.grenades = player.grenades;
    target.healthCooldown = player.healthCooldown;
    target.bloom = player.bloom;
    target.secondaryReserve = player.secondaryReserve;
    target.reserveAmmo = player.reserveAmmo;
    target.ally = player.ally;
    Object.assign(target.challenge, player.challenge);
    target.nickname = player.nickname;
    target.x = player.position.x;
    target.y = player.position.y;
    target.z = player.position.z;
    target.vx = player.velocity.x;
    target.vy = player.velocity.y;
    target.vz = player.velocity.z;
    target.yaw = player.yaw;
    target.pitch = player.pitch;
    target.grounded = player.grounded;
    target.crouched = player.crouched;
    target.sliding = player.sliding;
    target.slideRemaining = player.slideRemaining;
    target.slideCooldown = player.slideCooldown;
    target.jumpBuffer = player.jumpBuffer;
    target.coyoteRemaining = player.coyoteRemaining;
    target.jumpWasDown = player.jumpWasDown;
    target.crouchWasDown = player.crouchWasDown;
    target.landed = player.landed;
    target.connected = player.connected;
    target.health = player.health;
    target.maxHealth = player.maxHealth;
    target.ammo = player.ammo;
    target.secondaryAmmo = player.secondaryAmmo;
    target.slot = player.slot;
    target.aimProgress = player.aimProgress;
    target.landingRemaining = player.landingRemaining;
    target.reloadRemaining = player.reloadRemaining;
    target.fireRemaining = player.fireRemaining;
    target.respawnRemaining = player.respawnRemaining;
    target.protectionRemaining = player.protectionRemaining;
    target.kills = player.kills;
    target.deaths = player.deaths;
    target.lifeId = player.lifeId;
    target.ready = player.ready;
    target.weapon = player.weapon;
    target.lastProcessedInput = player.lastProcessedInput;
  }
}
