import type { ServerEvent } from '@fps/protocol';

export type KillEvent = Extract<ServerEvent, { type: 'kill' }>;

export type KillFeedTag = {
  kind: 'headshot' | 'airborne' | 'target-airborne' | 'no-scope' | 'distance';
  label: string;
};

export type KillFeedItem = {
  attacker: string;
  victim: string;
  weapon: KillEvent['weapon'];
  weaponLabel: string;
  weaponName: string;
  tags: KillFeedTag[];
  localKill: boolean;
  localDeath: boolean;
  announcement: string;
  expires: number;
};

const WEAPON_LABELS: Record<KillEvent['weapon'], string> = {
  selfDestruct: 'СБРОС',
  mine: 'МИНА',
  grenade: 'ГРАНАТА',
  sapper: 'САП',
  rifle: 'АВТ',
  smg: 'ПП',
  revolver: 'РЕВ',
  lmg: 'LMG',
  sniper: 'СНП',
  shotgun: 'ДРБ',
  pistol: 'ПСТ',
  knife: 'НОЖ',
};

const WEAPON_NAMES: Record<KillEvent['weapon'], string> = {
  selfDestruct: 'самоуничтожение',
  mine: 'мина сапёра',
  grenade: 'осколочная граната',
  sapper: 'сапёр',
  rifle: 'автомат',
  smg: 'ПП Вектор',
  revolver: 'револьвер',
  lmg: 'пулемёт Титан',
  sniper: 'снайперка',
  shotgun: 'дробовик',
  pistol: 'пистолет',
  knife: 'нож',
};

function meters(value: number) {
  const rounded = Math.max(0, Math.round(value));
  const tens = rounded % 100;
  const ones = rounded % 10;
  const unit =
    tens >= 11 && tens <= 14
      ? 'метров'
      : ones === 1
        ? 'метр'
        : ones >= 2 && ones <= 4
          ? 'метра'
          : 'метров';
  return `${rounded} ${unit}`;
}

export function createKillFeedItem(
  event: KillEvent,
  localId: string,
  expires: number,
): KillFeedItem {
  const tags: KillFeedTag[] = [];
  const selfDestruct = event.weapon === 'selfDestruct';
  if (event.headshot) tags.push({ kind: 'headshot', label: 'В ГОЛОВУ' });
  if (event.attackerAirborne)
    tags.push({ kind: 'airborne', label: 'В ПРЫЖКЕ' });
  if (event.victimAirborne)
    tags.push({ kind: 'target-airborne', label: 'ЦЕЛЬ В ВОЗДУХЕ' });
  if (event.noScope) tags.push({ kind: 'no-scope', label: 'БЕЗ ПРИЦЕЛА' });
  if (!selfDestruct)
    tags.push({
      kind: 'distance',
      label: `${Math.max(0, Math.round(event.distance))} М`,
    });

  const details = tags
    .filter((tag) => tag.kind !== 'distance')
    .map((tag) => tag.label.toLowerCase());
  const suffix = details.length ? `, ${details.join(', ')}` : '';

  return {
    attacker: event.attacker,
    victim: event.victim,
    weapon: event.weapon,
    weaponLabel: WEAPON_LABELS[event.weapon],
    weaponName: WEAPON_NAMES[event.weapon],
    tags,
    localKill: event.playerId === localId && !selfDestruct,
    localDeath: event.targetId === localId,
    announcement: selfDestruct
      ? `${event.victim}: самоуничтожение`
      : `${event.attacker} убил ${event.victim}, ${WEAPON_NAMES[event.weapon]}, ${meters(event.distance)}${suffix}`,
    expires,
  };
}
