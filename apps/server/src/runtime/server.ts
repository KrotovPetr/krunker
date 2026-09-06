import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_TYPE, PROTOCOL_VERSION } from '@fps/protocol';
import type { GameConfig, MapDefinition } from '@fps/game-core';
import { ArenaRoom } from '../rooms/arena-room.js';

export function createServer(
  options: { config?: GameConfig; map?: MapDefinition; seed?: number } = {},
) {
  const transport = new WebSocketTransport({ maxPayload: 4096 });
  const server = new Server({
    transport,
    greet: false,
    gracefullyShutdown: false,
    express(app) {
      app.disable('x-powered-by');
      app.get('/health', (_request, response) => {
        response.json({ status: 'ok', protocolVersion: PROTOCOL_VERSION });
      });
    },
  });
  class ConfiguredArenaRoom extends ArenaRoom {
    constructor() {
      super(options.config, options.map, options.seed);
    }
  }
  server.define(ROOM_TYPE, ConfiguredArenaRoom);
  return { server, transport };
}
