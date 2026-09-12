import type { InputCommand, PlayerSnapshot } from '@fps/protocol';

/** Player state is flat except these three owned records. Never share mutable
 * records with prediction, render consumers or lag-compensation history. */
export const copyPlayer = (player: PlayerSnapshot): PlayerSnapshot => ({
  ...player,
  position: { ...player.position },
  velocity: { ...player.velocity },
  challenge: { ...player.challenge },
});
export const copyInput = (input: InputCommand): InputCommand => ({
  ...input,
  buttons: { ...input.buttons },
});
