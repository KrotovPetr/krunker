import type { SelectableWeaponId, WeaponId } from '@fps/protocol';

/** Roles group loadouts; the selected primary already identifies the role on the wire. */
export const PLAYER_CLASSES = [
  { id: 'assault', name: 'Штурмовик', weapons: ['rifle', 'shotgun'] },
  { id: 'scout', name: 'Разведчик', weapons: ['smg'] },
  { id: 'sniper', name: 'Снайпер', weapons: ['sniper'] },
  { id: 'support', name: 'Пулемётчик', weapons: ['lmg'] },
  { id: 'engineer', name: 'Инженер', weapons: ['sapper'] },
] as const satisfies readonly {
  id: string;
  name: string;
  weapons: readonly SelectableWeaponId[];
}[];

export const PLAYABLE_WEAPONS: readonly SelectableWeaponId[] =
  PLAYER_CLASSES.flatMap((role) => [...role.weapons]);

export function roleForWeapon(weapon: WeaponId) {
  return PLAYER_CLASSES.find((role) =>
    (role.weapons as readonly WeaponId[]).includes(weapon),
  );
}

export function isPlayableWeapon(
  weapon: WeaponId,
): weapon is SelectableWeaponId {
  return PLAYABLE_WEAPONS.includes(weapon as SelectableWeaponId);
}
