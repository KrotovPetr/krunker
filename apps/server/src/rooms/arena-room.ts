import { randomInt } from 'node:crypto';
import { Room, ServerError } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import {
  createGame,
  DEFAULT_CONFIG,
  ARENA,
  initializePhysics,
  createFixedStepper,
} from '@fps/game-core';
import type { Game, GameConfig, MapDefinition } from '@fps/game-core';
import {
  CLIENT_MESSAGE,
  SERVER_EVENT,
  MAX_PLAYERS,
  SNAPSHOT_RATE,
  TICK_RATE,
  clientCommandSchema,
  joinOptionsSchema,
} from '@fps/protocol';
import type { ServerEvent } from '@fps/protocol';
import { ArenaState } from '@fps/protocol/schema';
import { syncState } from '../network/sync-state.js';

export class ArenaRoom extends Room<{ state: ArenaState }> {
  override state = new ArenaState();
  override maxClients = MAX_PLAYERS;
  override patchRate = 1000 / SNAPSHOT_RATE;
  override maxMessagesPerSecond = 120;
  private game!: Game;
  constructor(
    private readonly config: GameConfig = DEFAULT_CONFIG,
    private readonly map: MapDefinition = ARENA,
    private readonly seed?: number,
  ) {
    super();
  }

  override async onCreate(): Promise<void> {
    await initializePhysics();
    this.game = createGame(
      this.config,
      this.map,
      this.seed ?? randomInt(0x100000000),
    );
    this.onMessage(CLIENT_MESSAGE, (client, payload: unknown) => {
      const parsed = clientCommandSchema.safeParse(payload);
      if (!parsed.success) {
        this.reject(client, 'invalidCommand');
        return;
      }
      const command = parsed.data;
      this.game.enqueue({
        type: 'playerCommand',
        playerId: client.sessionId,
        command,
      });
    });
    this.onMessage('*', (client) => this.reject(client, 'invalidCommand'));

    const stepper = createFixedStepper(TICK_RATE);
    const stepMs = 1000 / TICK_RATE;
    this.setSimulationInterval((deltaMs) => {
      stepper.advance(deltaMs / 1000, (dt) => {
        const events = this.game.step(dt);
        syncState(this.state, this.game.snapshot());
        for (const event of events) {
          if (event.type === 'commandRejected')
            this.clients
              .find((c) => c.sessionId === event.playerId)
              ?.send(SERVER_EVENT, event);
          else this.broadcast(SERVER_EVENT, event);
        }
      });
    }, stepMs);
  }

  override onAuth(_client: Client, options: unknown): boolean {
    if (!joinOptionsSchema.safeParse(options).success) {
      throw new ServerError(400, 'Invalid nickname or protocol version');
    }
    if (
      this.state.mode === 'waves' &&
      this.clients.length >= Math.min(4, this.config.maxPlayers - 1)
    )
      throw new ServerError(409, 'Wave squad is full');
    return true;
  }

  override onJoin(client: Client, options: unknown): void {
    const { nickname } = joinOptionsSchema.parse(options);
    this.game.enqueue({ type: 'join', playerId: client.sessionId, nickname });
  }

  override onDrop(client: Client): void {
    this.game.enqueue({
      type: 'connection',
      playerId: client.sessionId,
      connected: false,
    });
    void this.allowReconnection(client, 10);
  }

  override onReconnect(client: Client): void {
    this.game.enqueue({
      type: 'connection',
      playerId: client.sessionId,
      connected: true,
    });
  }

  override onLeave(client: Client): void {
    this.game.enqueue({ type: 'leave', playerId: client.sessionId });
  }

  override onDispose(): void {
    this.game?.dispose();
  }

  private reject(
    client: Client,
    reason: Extract<ServerEvent, { type: 'commandRejected' }>['reason'],
  ): void {
    const event: ServerEvent = { type: 'commandRejected', reason };
    client.send(SERVER_EVENT, event);
  }
}
