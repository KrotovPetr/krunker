import type { PlayerSnapshot, WaveSnapshot, WeaponId } from '@fps/protocol';

type EnemyPlayer = Pick<PlayerSnapshot, 'bot' | 'ally' | 'health' | 'weapon'>;

export type EnemyClassSummary = {
  weapon: WeaponId;
  label: string;
  count: number;
};

export type EnemyWaveSummary = {
  remaining: number;
  active: number;
  queued: number;
  defeated: number;
  classes: EnemyClassSummary[];
};

const CLASS_LABELS: Record<WeaponId, string> = {
  sapper: 'ИНЖ',
  rifle: 'АВТ',
  smg: 'ПП',
  shotgun: 'ДРБ',
  revolver: 'РЕВ',
  sniper: 'СНП',
  lmg: 'LMG',
};

const CLASS_ORDER: readonly WeaponId[] = [
  'sapper',
  'rifle',
  'smg',
  'shotgun',
  'revolver',
  'sniper',
  'lmg',
];

export function summarizeEnemyWave(
  players: readonly EnemyPlayer[],
  wave: WaveSnapshot,
): EnemyWaveSummary {
  const counts = new Map<WeaponId, number>();
  for (const player of players) {
    if (!player.bot || player.ally || player.health <= 0) continue;
    counts.set(player.weapon, (counts.get(player.weapon) ?? 0) + 1);
  }
  const classes = CLASS_ORDER.flatMap((weapon) => {
    const count = counts.get(weapon) ?? 0;
    return count ? [{ weapon, label: CLASS_LABELS[weapon], count }] : [];
  });
  const active = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const queued = Math.max(0, wave.queued);
  return {
    remaining: active + queued,
    active,
    queued,
    defeated: Math.max(0, wave.total - active - queued),
    classes,
  };
}
