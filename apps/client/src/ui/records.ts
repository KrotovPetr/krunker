import type { ChallengeResult } from '@fps/protocol';
import { challengeResultSchema as resultSchema } from '@fps/protocol';
const key = (r: ChallengeResult) =>
  `fps.record.${r.course}.${r.kind}.${r.weapon}.${r.duration}`;
export const trainingScore = (r: ChallengeResult) =>
  r.hits * 100 + r.headshots * 25;
const valid = (r: ChallengeResult) =>
  r.hits <= r.shots && r.headshots <= r.hits;
export function loadRecord(
  result: ChallengeResult,
): ChallengeResult | undefined {
  try {
    const parsed = resultSchema.safeParse(
      JSON.parse(localStorage.getItem(key(result)) ?? 'null'),
    );
    if (
      parsed.success &&
      valid(parsed.data) &&
      key(parsed.data) === key(result)
    )
      return parsed.data;
  } catch {
    /* Storage can be disabled or contain an old format. */
  }
  return undefined;
}
export function saveRecord(result: ChallengeResult): {
  best: ChallengeResult;
  improved: boolean;
} {
  const previous = loadRecord(result);

  const improved =
    !previous ||
    (result.kind === 'parkour'
      ? result.elapsed < previous.elapsed
      : trainingScore(result) > trainingScore(previous) ||
        (trainingScore(result) === trainingScore(previous) &&
          result.shots < previous.shots));
  if (improved && resultSchema.safeParse(result).success && valid(result)) {
    try {
      localStorage.setItem(key(result), JSON.stringify(result));
    } catch {
      /* Keep this session playable without storage. */
    }
  }
  return { best: improved ? result : previous!, improved };
}
