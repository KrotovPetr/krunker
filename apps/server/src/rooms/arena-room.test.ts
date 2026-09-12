import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client, CloseCode } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import {
  CLIENT_MESSAGE,
  SERVER_EVENT,
  PROTOCOL_VERSION,
  ROOM_TYPE,
} from '@fps/protocol';
import type { ServerEvent } from '@fps/protocol';
import type { ArenaState } from '@fps/protocol/schema';
import { createServer } from '../runtime/server.js';
import { EMPTY_BUTTONS, DEFAULT_CONFIG } from '@fps/game-core';

describe('arena over real WebSockets', () => {
  const runtime = createServer({
    config: { ...DEFAULT_CONFIG, respawnSeconds: 0.3, protectionSeconds: 0 },
    seed: 0,
  });
  let endpoint: string;
  let client: Client;
  let rooms: Room<ArenaState>[] = [];

  beforeAll(async () => {
    await runtime.server.listen(0, '127.0.0.1');
    const address = runtime.transport.server?.address();
    if (!address || typeof address === 'string')
      throw new Error('No server address');
    endpoint = `http://127.0.0.1:${address.port}`;
    client = new Client(endpoint);
  });
  afterEach(async () => {
    await Promise.all(rooms.map((room) => room.leave()));
    rooms = [];
    await expect
      .poll(async () => (await matchMaker.query({ name: ROOM_TYPE })).length)
      .toBe(0);
  });
  afterAll(async () => {
    await runtime.server.gracefullyShutdown(false);
  });

  async function join(nickname: string, roomId?: string) {
    const options = { nickname, protocolVersion: PROTOCOL_VERSION };
    const room = roomId
      ? await client.joinById<ArenaState>(roomId, options)
      : await client.create<ArenaState>(ROOM_TYPE, options);
    room.onMessage(SERVER_EVENT, () => {});
    rooms.push(room);
    return room;
  }

  it('synchronizes a map change and new spawn positions to every client', async () => {
    const first = await join('Host');
    const second = await join('Guest', first.roomId);
    await expect.poll(() => first.state?.players.size).toBe(2);
    first.send(CLIENT_MESSAGE, { type: 'setMap', mapId: 'bastion' });
    await expect.poll(() => first.state?.mapId).toBe('bastion');
    await expect.poll(() => second.state?.mapId).toBe('bastion');
    await expect
      .poll(() => second.state?.players.get(first.sessionId)?.z)
      .toBeGreaterThan(14);
    first.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'parkour' });
    await expect.poll(() => second.state?.mapId).toBe('switchyard');
    await expect.poll(() => second.state?.mode).toBe('parkour');
  });
  it('shares mission state with late teammates and rejects guest restart and mode changes', async () => {
    const host = await join('Host');
    await expect.poll(() => host.state?.players.size).toBe(1);
    host.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'mission' });
    host.send(CLIENT_MESSAGE, { type: 'ready', ready: true });
    await expect.poll(() => host.state?.mission.stage).toBe('dispatch');
    const guest = await join('Friend', host.roomId);
    await expect.poll(() => guest.state?.mission.stage).toBe('dispatch');
    expect(guest.state.mission.runId).toBe(host.state.mission.runId);
    expect(guest.state.mapId).toBe('bastion');
    guest.send(CLIENT_MESSAGE, { type: 'restartMission' });
    guest.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'arena' });
    await expect.poll(() => guest.state?.mode).toBe('mission');
    host.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'control' });
    await expect.poll(() => guest.state?.mission.stage).toBe('idle');
    expect(guest.state.mission.carrierId).toBe('');
  });

  it('exposes health without creating a room', async () => {
    const response = await fetch(`${endpoint}/health`);
    expect(await response.json()).toEqual({
      status: 'ok',
      protocolVersion: PROTOCOL_VERSION,
    });
  });
  it('replicates control mode and the shared squad order to a late friend, then clears them', async () => {
    const host = await join('Commander');
    await expect.poll(() => host.state?.players.size).toBe(1);
    host.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'control' });
    host.send(CLIENT_MESSAGE, { type: 'ready', ready: true });
    await expect.poll(() => host.state?.phase).toBe('active');
    expect(host.state.mapId).toBe('bastion');
    expect(host.state.allyCount).toBe(2);
    host.send(CLIENT_MESSAGE, {
      type: 'squadOrder',
      kind: 'follow',
      yaw: 0,
      pitch: 0,
    });
    await expect.poll(() => host.state?.squadOrder.kind).toBe('follow');
    const guest = await join('Friend', host.roomId);
    await expect.poll(() => guest.state?.squadOrder.kind).toBe('follow');
    expect(guest.state.squadOrder.commanderId).toBe(host.sessionId);
    expect(guest.state.control.owner).toBe(host.state.control.owner);
    guest.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'arena' });
    await expect.poll(() => host.state?.mode).toBe('control');
    host.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'arena' });
    await expect.poll(() => guest.state?.mode).toBe('arena');
    await expect.poll(() => guest.state?.squadOrder.kind).toBe('auto');
    expect(guest.state.control.allyScore).toBe(0);
  });
  it('synchronizes sapper mines to a late squad member and clears them on map changes', async () => {
    const host = await join('Engineer');
    await expect.poll(() => host.state?.players.size).toBe(1);
    host.send(CLIENT_MESSAGE, { type: 'setMap', mapId: 'bastion' });
    host.send(CLIENT_MESSAGE, { type: 'setMode', mode: 'waves' });
    host.send(CLIENT_MESSAGE, { type: 'setAllies', count: 2 });
    host.send(CLIENT_MESSAGE, { type: 'selectWeapon', weapon: 'sapper' });
    host.send(CLIENT_MESSAGE, { type: 'ready', ready: true });
    await expect
      .poll(() => host.state?.players.get(host.sessionId)?.grounded)
      .toBe(true);
    await expect.poll(() => host.state?.wave.status).toBe('preparing');
    host.send(CLIENT_MESSAGE, { type: 'deployMine' });
    await expect.poll(() => host.state?.mines.size).toBe(1);
    const guest = await join('Friend', host.roomId);
    await expect.poll(() => guest.state?.mines.size).toBe(1);
    expect(guest.state.mines.values().next().value?.ownerId).toBe(
      host.sessionId,
    );
    expect(
      guest.state.players.get(host.sessionId)?.mineCooldown,
    ).toBeGreaterThan(0);
    expect(
      [...guest.state.players.values()].filter((p) => p.ally),
    ).toHaveLength(2);
    host.send(CLIENT_MESSAGE, { type: 'setMap', mapId: 'sandgate' });
    await expect.poll(() => guest.state?.mapId).toBe('sandgate');
    await expect.poll(() => guest.state?.mines.size).toBe(0);
  });
  it('syncs two players, accepts valid intent and removes departed players', async () => {
    const first = await join('  Alice  ');
    const second = await join('Bob', first.roomId);
    await expect.poll(() => first.state?.players.size).toBe(2);
    await expect.poll(() => second.state?.players.size).toBe(2);
    expect(
      [...second.state.players.values()].map((p) => p.nickname).sort(),
    ).toEqual(['Alice', 'Bob']);
    first.send(CLIENT_MESSAGE, { type: 'ready', ready: true });
    await expect
      .poll(() => second.state.players.get(first.sessionId)?.ready)
      .toBe(true);
    await second.leave();
    rooms = [first];
    await expect.poll(() => first.state.players.size).toBe(1);
  });
  it('rejects unknown fields and keeps ticking after a bad command', async () => {
    const room = await join('Alice');
    await expect.poll(() => room.state?.players.size).toBe(1);
    const events: ServerEvent[] = [];
    room.onMessage<ServerEvent>(SERVER_EVENT, (event) => events.push(event));
    const tick = room.state.tick;
    room.send(CLIENT_MESSAGE, {
      type: 'ready',
      ready: true,
      x: 999,
      damage: 100,
    });
    await expect
      .poll(() => events.some((e) => e.type === 'commandRejected'))
      .toBe(true);
    expect(room.state.players.get(room.sessionId)?.ready).toBe(false);
    await expect.poll(() => room.state.tick).toBeGreaterThan(tick);
  });
  it('rejects invalid admission without affecting an existing room', async () => {
    const room = await join('Alice');
    await expect(
      client.joinById(room.roomId, { nickname: 'Bob', protocolVersion: 999 }),
    ).rejects.toThrow();
    await expect(
      client.joinById(room.roomId, {
        nickname: ' ',
        protocolVersion: PROTOCOL_VERSION,
      }),
    ).rejects.toThrow();
    await expect.poll(() => room.state?.players.size).toBe(1);
  });
  it('admits eight players and refuses a ninth', async () => {
    const first = await join('Player 1');
    for (let i = 2; i <= 8; i++) await join(`Player ${i}`, first.roomId);
    await expect.poll(() => first.state?.players.size).toBe(8);
    await expect(join('Player 9', first.roomId)).rejects.toThrow();
    expect(first.state.players.size).toBe(8);
  });
  it('syncs a real shot, kill, score and respawn to both clients', async () => {
    const first = await join('Sniper');
    const second = await join('Target', first.roomId);
    await expect.poll(() => second.state?.players.size).toBe(2);
    first.send(CLIENT_MESSAGE, { type: 'selectWeapon', weapon: 'sniper' });
    first.send(CLIENT_MESSAGE, { type: 'ready', ready: true });
    second.send(CLIENT_MESSAGE, { type: 'ready', ready: true });
    await expect.poll(() => first.state.phase).toBe('active');
    let seq = 1;
    const moving = setInterval(
      () =>
        second.send(CLIENT_MESSAGE, {
          type: 'input',
          seq: seq++,
          yaw: 0,
          pitch: 0,
          buttons: { ...EMPTY_BUTTONS, back: true },
        }),
      50,
    );
    try {
      await expect
        .poll(() => second.state.players.get(second.sessionId)!.z, {
          timeout: 5000,
          interval: 30,
        })
        .toBeGreaterThan(9.5);
    } finally {
      clearInterval(moving);
    }
    second.send(CLIENT_MESSAGE, {
      type: 'input',
      seq: seq++,
      yaw: 0,
      pitch: 0,
      buttons: EMPTY_BUTTONS,
    });
    await expect
      .poll(() => Math.abs(first.state.players.get(second.sessionId)!.vz))
      .toBeLessThan(0.1);
    const a = first.state.players.get(first.sessionId)!,
      b = first.state.players.get(second.sessionId)!;
    const life = b.lifeId;
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    const pitch = Math.atan2(
      b.y + 1.65 - a.y - 1.65,
      Math.hypot(b.x - a.x, b.z - a.z),
    );
    let aimSeq = 1;
    const aim = setInterval(
      () =>
        first.send(CLIENT_MESSAGE, {
          type: 'input',
          seq: aimSeq++,
          yaw,
          pitch,
          aiming: true,
          buttons: EMPTY_BUTTONS,
        }),
      30,
    );
    try {
      await expect
        .poll(() => first.state.players.get(first.sessionId)?.aimProgress)
        .toBe(1);
      first.send(CLIENT_MESSAGE, {
        type: 'fire',
        inputSeq: aimSeq - 1,
        yaw,
        pitch,
      });
    } finally {
      clearInterval(aim);
    }
    await expect
      .poll(() => first.state.players.get(first.sessionId)?.kills)
      .toBe(1);
    await expect
      .poll(() => second.state.players.get(second.sessionId)?.deaths)
      .toBe(1);
    await expect
      .poll(() => second.state.players.get(second.sessionId)?.lifeId)
      .toBe(life + 1);
    expect(second.state.players.get(second.sessionId)?.health).toBe(100);
    expect(first.state.players.get(first.sessionId)?.ammo).toBe(4);
  });
  it('resumes a dropped socket with the same player and ready state', async () => {
    const first = await join('Reconnect');
    const second = await join('Observer', first.roomId);
    await expect.poll(() => first.state?.players.size).toBe(2);
    first.send(CLIENT_MESSAGE, { type: 'ready', ready: true });
    await expect
      .poll(() => second.state.players.get(first.sessionId)?.ready)
      .toBe(true);
    first.reconnection.minUptime = 0;
    first.reconnection.delay = 150;
    first.reconnection.minDelay = 150;
    let drops = 0,
      reconnects = 0;
    first.onDrop(() => drops++);
    first.onReconnect(() => reconnects++);
    const sessionId = first.sessionId;
    first.connection.close(CloseCode.MAY_TRY_RECONNECT, 'test network drop');
    await expect.poll(() => drops).toBe(1);
    await expect.poll(() => reconnects).toBe(1);
    await expect
      .poll(() => second.state.players.get(sessionId)?.connected)
      .toBe(true);
    expect(first.sessionId).toBe(sessionId);
    expect(first.state.players.size).toBe(2);
    expect(first.state.players.get(sessionId)?.ready).toBe(true);
  });
  it('broadcasts server-simulated movement to a second player', async () => {
    const first = await join('Walker');
    const second = await join('Observer', first.roomId);
    await expect.poll(() => second.state?.players.size).toBe(2);
    const startZ = second.state.players.get(first.sessionId)!.z;
    first.send(CLIENT_MESSAGE, {
      type: 'input',
      seq: 1,
      yaw: 0,
      pitch: 0,
      buttons: { ...EMPTY_BUTTONS, forward: true },
    });
    await expect
      .poll(() => second.state.players.get(first.sessionId)?.lastProcessedInput)
      .toBe(1);
    await expect
      .poll(() => second.state.players.get(first.sessionId)!.z)
      .toBeLessThan(startZ - 0.1);
    first.send(CLIENT_MESSAGE, {
      type: 'input',
      seq: 2,
      yaw: 0,
      pitch: 0,
      buttons: EMPTY_BUTTONS,
      position: { x: 999, y: 999, z: 999 },
    });
    await expect
      .poll(() => first.state.players.get(first.sessionId)!.vz)
      .toBeGreaterThan(-0.01);
    expect(second.state.players.get(first.sessionId)!.z).toBeGreaterThan(
      startZ - 4,
    );
  });
});
