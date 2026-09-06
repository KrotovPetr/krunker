import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import {
  PROTOCOL_VERSION,
  ROOM_TYPE,
  SERVER_EVENT,
  CLIENT_MESSAGE,
} from '@fps/protocol';
import type { GameSnapshot, ServerEvent, ClientCommand } from '@fps/protocol';
import { toSnapshot } from '@fps/protocol/schema';
import type { ArenaState } from '@fps/protocol/schema';

export interface ConnectionHandlers {
  snapshot(snapshot: GameSnapshot, sessionId: string): void;
  leave(): void;
  reconnecting(active: boolean): void;
  event(event: ServerEvent): void;
  error(message: string): void;
}

export class Connection {
  private client: Client;
  private online = false;
  private room: Room<ArenaState> | undefined;

  constructor(private handlers: ConnectionHandlers) {
    const endpoint =
      import.meta.env.VITE_SERVER_URL ||
      `${location.protocol}//${location.hostname}:2567`;
    this.client = new Client(endpoint);
  }

  async join(nickname: string, roomId: string | null): Promise<string> {
    const options = { nickname, protocolVersion: PROTOCOL_VERSION };
    const room = roomId
      ? await this.client.joinById<ArenaState>(roomId, options)
      : await this.client.create<ArenaState>(ROOM_TYPE, options);
    this.room = room;
    room.reconnection.minUptime = 0;
    room.reconnection.maxDelay = 2000;
    this.online = true;
    room.onDrop(() => {
      if (this.room !== room) return;
      this.online = false;
      this.handlers.reconnecting(true);
    });
    room.onReconnect(() => {
      if (this.room !== room) {
        void room.leave();
        return;
      }
      this.online = true;
      this.handlers.reconnecting(false);
    });
    room.onStateChange((state) => {
      if (this.room === room)
        this.handlers.snapshot(toSnapshot(state), room.sessionId);
    });
    room.onMessage<ServerEvent>(SERVER_EVENT, (event) => {
      if (this.room !== room) return;
      this.handlers.event(event);
      if (event.type === 'commandRejected')
        this.handlers.error(
          event.reason === 'squadFull'
            ? 'Для обороны нужно не больше четырёх игроков.'
            : event.reason === 'hostOnly'
              ? 'Режим выбирает хозяин комнаты.'
              : event.reason === 'matchRunning'
                ? 'Дождись конца раунда, чтобы сменить режим.'
                : 'Команда отклонена сервером.',
        );
    });
    room.onError(() => {
      if (this.room === room)
        this.handlers.error('Ошибка соединения с комнатой.');
    });
    room.onLeave(() => {
      if (this.room !== room) return;
      this.room = undefined;
      this.online = false;
      this.handlers.leave();
    });
    return room.roomId;
  }

  async leave(): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (!this.online) {
      this.room = undefined;
      this.handlers.leave();
      return;
    }
    await room.leave();
  }

  send(input: ClientCommand): void {
    if (this.online) this.room?.send(CLIENT_MESSAGE, input);
  }
}
