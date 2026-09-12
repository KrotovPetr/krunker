import { ARENA } from './arena.js';
import { CITY } from './city.js';
import { SANDGATE } from './sandgate.js';
import { SPILLWAY } from './spillway.js';
import type { MapDefinition } from './arena.js';
export const MAPS: Readonly<Record<string, MapDefinition>> = {
  switchyard: ARENA,
  bastion: CITY,
  sandgate: SANDGATE,
  spillway: SPILLWAY,
};
export function getMap(id: string): MapDefinition {
  return MAPS[id] ?? ARENA;
}
