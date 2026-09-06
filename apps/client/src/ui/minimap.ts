import type { GameSnapshot, ServerEvent } from '@fps/protocol';
import { getMap, PARKOUR_CHECKPOINTS } from '@fps/game-core';
import type { MapDefinition } from '@fps/game-core';

export function createMinimap() {
  const container = document.getElementById('minimap')!;
  const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const base = document.createElement('canvas');
  base.width = base.height = canvas.width;
  const bg = base.getContext('2d')!;
  let mapId = '',
    level = -1,
    lastFrame = 0,
    hidden = false;
  let map: MapDefinition;
  const shots = new Map<string, { x: number; z: number; expires: number }>();
  const size = canvas.width,
    padding = 22;
  let scale = 1,
    cx = 0,
    cz = 0;
  const point = (x: number, z: number) => ({
    x: size / 2 + (x - cx) * scale,
    y: size / 2 + (z - cz) * scale,
  });
  const rebuild = () => {
    const floor = map.blocks.find((b) => b.id === 'floor')!;
    scale = (size - padding * 2) / Math.max(floor.size.x, floor.size.z);
    cx = floor.position.x;
    cz = floor.position.z;
    bg.clearRect(0, 0, size, size);
    bg.fillStyle = '#182d36';
    bg.fillRect(0, 0, size, size);
    const origin = point(cx - floor.size.x / 2, cz - floor.size.z / 2);
    bg.fillStyle = '#36515b';
    bg.fillRect(origin.x, origin.y, floor.size.x * scale, floor.size.z * scale);
    const slice = level === 1 ? (map.upperLevel ?? 2.7) + 1.4 : 1.8;
    for (const block of map.blocks) {
      if (block.id === 'floor' || block.position.y - block.size.y / 2 > slice)
        continue;
      const p = point(block.position.x, block.position.z),
        top = block.position.y + block.size.y / 2;
      bg.save();
      bg.translate(p.x, p.y);
      bg.rotate(-block.yaw);
      bg.fillStyle =
        top < slice - 1.4 ? '#536b6d' : top < slice ? '#80928b' : '#bac3ae';
      bg.fillRect(
        (-block.size.x * scale) / 2,
        (-block.size.z * scale) / 2,
        block.size.x * scale,
        block.size.z * scale,
      );
      if (top >= slice) {
        bg.strokeStyle = '#152b33';
        bg.lineWidth = 1;
        bg.strokeRect(
          (-block.size.x * scale) / 2,
          (-block.size.z * scale) / 2,
          block.size.x * scale,
          block.size.z * scale,
        );
      }
      bg.restore();
    }
    bg.fillStyle = '#e0d9c1';
    bg.font = 'bold 17px sans-serif';
    bg.textAlign = 'center';
    bg.fillText('N', size / 2, 17);
    for (const zone of map.zones ?? []) {
      if (zone.level !== undefined && zone.level !== level) continue;
      bg.font =
        zone.name.length < 3 ? 'bold 25px sans-serif' : 'bold 14px sans-serif';
      const p = point(zone.x, zone.z);
      bg.fillStyle = '#e2bc78';
      bg.strokeStyle = '#162d36';
      bg.lineWidth = 3;
      bg.strokeText(zone.name, p.x, p.y);
      bg.fillText(zone.name, p.x, p.y);
    }
    document.getElementById('minimap-name')!.textContent =
      map.name ?? 'Switchyard';
    document.getElementById('minimap-level')!.textContent = level
      ? 'ВЕРХНИЙ УРОВЕНЬ'
      : 'ПЕРВЫЙ УРОВЕНЬ';
    canvas.dataset.map = map.id;
    canvas.dataset.level = String(level);
  };
  return {
    toggle() {
      hidden = !hidden;
      container.hidden = hidden;
    },
    event(event: ServerEvent, localId: string) {
      if (
        event.type === 'shot' &&
        event.playerId !== localId &&
        event.weapon !== 'knife'
      ) {
        shots.set(event.playerId, {
          x: event.origin.x,
          z: event.origin.z,
          expires: performance.now() + 1100,
        });
        if (shots.size > 8) shots.delete(shots.keys().next().value!);
      }
    },
    update(snapshot: GameSnapshot, localId: string, look: { yaw: number }) {
      const now = performance.now();
      if (now - lastFrame < 50 || hidden) return;
      lastFrame = now;
      const player = snapshot.players.find((p) => p.id === localId);
      if (!player) return;
      const nextLevel =
        player.position.y > (getMap(snapshot.mapId).upperLevel ?? 2.7) ? 1 : 0;
      if (mapId !== snapshot.mapId || level !== nextLevel) {
        if (mapId !== snapshot.mapId) shots.clear();
        mapId = snapshot.mapId;
        map = getMap(mapId);
        level = nextLevel;
        rebuild();
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(base, 0, 0);
      const local = point(player.position.x, player.position.z);
      const zone = map.zones
        ?.filter((z) => z.level === undefined || z.level === level)
        .map((z) => ({
          z,
          distance: Math.hypot(
            z.x - player.position.x,
            z.z - player.position.z,
          ),
        }))
        .filter((p) => p.distance <= p.z.radius)
        .sort((a, b) => a.distance - b.distance)[0]?.z;
      document.getElementById('location-name')!.textContent =
        zone?.name ?? map.name ?? map.id;
      canvas.dataset.zone = zone?.name ?? '';
      if (snapshot.mode === 'waves') {
        for (const gate of map.defense?.enemies ?? []) {
          const p = point(gate.x, gate.z);
          ctx.fillStyle = '#ef9479';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 6);
          ctx.lineTo(p.x + 5, p.y + 4);
          ctx.lineTo(p.x - 5, p.y + 4);
          ctx.fill();
        }
        for (const mate of snapshot.players.filter(
          (p) =>
            (!p.bot || p.ally) && p.id !== localId && p.ready && p.health > 0,
        )) {
          const p = point(mate.position.x, mate.position.z);
          ctx.fillStyle = '#82d9f4';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (snapshot.mode === 'parkour') {
        const target = PARKOUR_CHECKPOINTS[player.challenge.checkpoint];
        if (target) {
          const p = point(target.x, target.z);
          ctx.strokeStyle = '#7dffaf';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      for (const supply of map.supplies ?? []) {
        const p = point(supply.x, supply.z);
        ctx.fillStyle = '#9cdbaf';
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }
      for (const [id, shot] of shots) {
        if (
          snapshot.mode === 'waves' &&
          snapshot.players.some((p) => p.id === id && (!p.bot || p.ally))
        )
          continue;
        if (shot.expires < now) {
          shots.delete(id);
          continue;
        }
        if (
          Math.hypot(shot.x - player.position.x, shot.z - player.position.z) >
          35
        )
          continue;
        const p = point(shot.x, shot.z);
        ctx.globalAlpha = Math.min(1, (shot.expires - now) / 500);
        ctx.fillStyle = '#ff866e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(local.x, local.y);
      ctx.rotate(-look.yaw);
      ctx.fillStyle = '#8ce4c033';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 44, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#92ffc6';
      ctx.strokeStyle = '#102c32';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 7);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      canvas.dataset.x = player.position.x.toFixed(2);
      canvas.dataset.z = player.position.z.toFixed(2);
    },
    reset() {
      shots.clear();
      mapId = '';
      level = -1;
      ctx.clearRect(0, 0, size, size);
    },
  };
}
