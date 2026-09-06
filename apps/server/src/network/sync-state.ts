import { PlayerState } from '@fps/protocol/schema';
import type { ArenaState } from '@fps/protocol/schema';
import type { GameSnapshot } from '@fps/protocol';

export function syncState(state: ArenaState, snapshot: GameSnapshot): void {
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
    target.bot = player.bot;
    target.supplyCooldown = player.supplyCooldown;
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
