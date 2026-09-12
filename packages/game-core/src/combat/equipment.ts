import type { GameSnapshot, PlayerSnapshot } from '@fps/protocol';
import { challengeActive } from '../training/challenges.js';

export function equipmentAllowed(
  match: Pick<GameSnapshot, 'phase' | 'mode'>,
  player: Pick<PlayerSnapshot, 'ready' | 'connected' | 'health' | 'challenge'>,
) {
  return (
    match.phase !== 'results' &&
    match.mode !== 'parkour' &&
    player.ready &&
    player.connected &&
    player.health > 0 &&
    !challengeActive(player.challenge)
  );
}
