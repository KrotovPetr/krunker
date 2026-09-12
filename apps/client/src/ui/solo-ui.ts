import type { ChallengeResult, GameSnapshot } from '@fps/protocol';
import { isTeamMode } from '@fps/protocol';
import {
  PARKOUR_CHECKPOINTS,
  challengeActive,
  challengeResult,
  COURSE_VERSION,
  getMap,
} from '@fps/game-core';
import { loadRecord, saveRecord, trainingScore } from './records.js';

const el = (id: string) => document.getElementById(id)!;
const names = {
  arena: 'Арена',
  waves: 'Оборона',
  control: 'Удержание точки',
  mission: 'Последний рейс',
  training: 'Испытание полигона',
  bots: 'Бой с ботами',
  parkour: 'Паркур на время',
};
const time = (seconds: number) => `${seconds.toFixed(2)} с`;
export function resultText(result: ChallengeResult) {
  if (result.kind === 'parkour') return time(result.elapsed);
  return `${trainingScore(result)} очков · ${result.hits}/${result.shots} · ${result.shots ? Math.round((result.hits / result.shots) * 100) : 0}% · реакция ${Math.round(result.reactionMs)} мс`;
}
export function createSoloUI() {
  let lastRun = '';
  let best: ChallengeResult | undefined;
  let recordKey = '';
  let newRecord = false;
  return {
    snapshot(snapshot: GameSnapshot, id: string) {
      const local = snapshot.players.find((p) => p.id === id);
      const solo = snapshot.mode === 'training' || snapshot.mode === 'parkour';
      const host = snapshot.hostId === id;
      const mode = el('mode-select') as HTMLSelectElement;
      mode.value = snapshot.mode;
      const mapSelect = el('map-select') as HTMLSelectElement;
      mapSelect.value = snapshot.mapId;
      mapSelect.disabled =
        !host ||
        solo ||
        snapshot.mode === 'control' ||
        snapshot.mode === 'mission' ||
        (snapshot.mode === 'arena' && snapshot.phase === 'active');
      const map = getMap(snapshot.mapId);
      el('map-name').textContent = (map.name ?? map.id).toUpperCase();
      el('map-description').textContent = solo
        ? 'Испытания проходят на Switchyard.'
        : (map.description ?? '');
      mode.disabled =
        !host || (snapshot.mode === 'arena' && snapshot.phase === 'active');
      el('mode-owner').textContent = !host
        ? 'Режим выбирает хозяин комнаты'
        : mode.disabled
          ? 'Режим можно сменить после раунда'
          : 'Ты выбираешь режим комнаты';
      el('ally-settings').hidden = !isTeamMode(snapshot.mode);
      const defenders = snapshot.players.filter((p) => !p.bot || p.ally);
      el('squad-summary').textContent =
        `Отряд: ${defenders.filter((p) => !p.bot).length}/4 друзей · ${defenders.filter((p) => p.ally).length} союзных ботов · ${defenders.filter((p) => p.ready && p.connected && p.health > 0).length} в строю`;
      (el('ally-count') as HTMLSelectElement).value = String(
        snapshot.allyCount,
      );
      (el('ally-count') as HTMLSelectElement).disabled = !host;
      el('bot-settings').hidden =
        snapshot.mode !== 'bots' && !isTeamMode(snapshot.mode);
      el('bot-count-label').textContent =
        snapshot.mode === 'waves' ? 'Одновременно на карте' : 'Соперники';
      for (const key of ['bot-count', 'bot-difficulty'])
        (el(key) as HTMLSelectElement).disabled = !host;
      (el('bot-count') as HTMLSelectElement).value = String(snapshot.botCount);
      (el('bot-difficulty') as HTMLSelectElement).value = snapshot.difficulty;
      el('challenge-actions').hidden = !solo;
      el('ready').hidden = solo;
      el('play').textContent = solo ? 'Свободная тренировка' : 'Выйти на арену';
      el('scores').hidden = solo;
      el('solo-hud').hidden = !solo;
      el('mode-description').textContent =
        snapshot.mode === 'mission'
          ? 'Последний рейс: найдите диспетчера, запитайте трамвай и выведите отряд. Удерживайте F возле цели. Погибшие возвращаются на контрольных этапах. После поражения хозяин повторяет этап на R. До 4 друзей, союзные боты прикрывают. T: боты к заданию.'
          : snapshot.mode === 'control'
            ? 'Точка A под галереей Bastion. Захват 5 с, победа за 90 очков, матч 3 минуты. При сопернике на точке очки не идут. Возрождение через 3 с. Z: за мной, X: удерживать место под прицелом, T: к точке. Приказ действует 30 с. Союзный огонь выключен.'
            : snapshot.mode === 'training'
              ? '30 секунд. Стреляй по зелёной мишени с линии огня. R — перезарядка. Оружие фиксируется на попытку.'
              : snapshot.mode === 'parkour'
                ? 'Пройди 11 колец по порядку за 120 секунд. Зелёное кольцо — следующая точка. Прыжки и скольжение сохраняют скорость.'
                : snapshot.mode === 'waves'
                  ? 'До 4 защитников против волн. Враги приходят со входов, союзники не наносят урон. Погибшие возвращаются между волнами. В паузе можно сменить класс.'
                  : snapshot.mode === 'bots'
                    ? 'Матч начнётся с одним готовым игроком. Боты целятся, обходят укрытия и возрождаются.'
                    : 'Свободная пристрелка до матча. Для старта нужны двое готовых игроков.';
      const wavesOption = mode.querySelector<HTMLOptionElement>(
        'option[value=waves]',
      );
      if (wavesOption)
        wavesOption.disabled =
          snapshot.players.filter((p) => !p.bot).length > 4;
      const controlOption = mode.querySelector<HTMLOptionElement>(
        'option[value=control]',
      );
      if (controlOption)
        controlOption.disabled =
          snapshot.players.filter((p) => !p.bot).length > 4;
      const missionOption = mode.querySelector<HTMLOptionElement>(
        'option[value=mission]',
      );
      if (missionOption)
        missionOption.disabled =
          snapshot.players.filter((p) => !p.bot).length > 4;
      el('restart-waves').hidden =
        snapshot.mode !== 'waves' || snapshot.wave.status !== 'defeat';
      (el('restart-waves') as HTMLButtonElement).disabled = !host;
      if (!local) return;
      const c = local.challenge;
      if (solo) {
        el('match-time').textContent = names[snapshot.mode];
        const busy = challengeActive(c);
        (el('weapon-select') as HTMLSelectElement).disabled = busy;
        (el('cancel-challenge') as HTMLButtonElement).disabled = !busy;
        el('start-challenge').textContent = busy
          ? 'Начать заново'
          : c.status === 'idle'
            ? 'Начать испытание'
            : 'Повторить испытание';
        el('solo-hud').dataset.status = c.status;
        el('solo-hud').dataset.checkpoint = String(c.checkpoint);
        el('solo-hud').dataset.target = String(c.targetIndex);
        el('solo-hud').dataset.shots = String(c.shots);
        el('solo-hud').dataset.hits = String(c.hits);
        el('solo-hud').dataset.run = String(c.runId);
        el('solo-title').textContent =
          c.status === 'countdown'
            ? `На старт · ${Math.ceil(c.remaining)}`
            : c.status === 'running'
              ? c.kind === 'training'
                ? `${c.remaining.toFixed(1)} с`
                : time(c.elapsed)
              : c.status === 'finished'
                ? 'Финиш!'
                : c.status === 'failed'
                  ? 'Попытка завершена'
                  : 'Готов к испытанию?';
        el('solo-details').textContent =
          c.status === 'idle'
            ? 'F — старт · Esc — меню'
            : c.kind === 'parkour'
              ? `${c.checkpoint} / ${PARKOUR_CHECKPOINTS.length} точек · F — заново`
              : `${resultText(challengeResult(c))} · F — заново`;
        const preview = {
          ...challengeResult(c),
          kind: snapshot.mode,
          weapon: busy || c.status === 'finished' ? c.weapon : local.weapon,
          course: COURSE_VERSION,
          duration: snapshot.mode === 'training' ? c.duration || 30 : 120,
        } as ChallengeResult;
        const key = `${preview.kind}:${preview.weapon}:${preview.duration}`;
        if (key !== recordKey) {
          recordKey = key;
          best = loadRecord(preview);
        }
        const run = `${id}:${c.runId}`;
        if (c.status === 'finished' && lastRun !== run) {
          lastRun = run;
          const saved = saveRecord(challengeResult(c));
          best = saved.best;
          newRecord = saved.improved;
        }
        if (c.status === 'countdown' || c.status === 'idle') newRecord = false;
        const record = best
          ? `Рекорд · ${resultText(best)}`
          : 'Первый рекорд ещё впереди';
        el('solo-best').textContent =
          `${newRecord ? 'Новый личный рекорд! ' : ''}${record}`;
        el('record-summary').textContent =
          c.status === 'finished'
            ? `Результат · ${resultText(challengeResult(c))}. ${record}`
            : record;
        el('personal-score').textContent =
          c.kind === 'parkour'
            ? 'Прыгай · Скользи · Ускоряйся'
            : `${c.headshots} в голову`;
      }
    },
    reset() {
      lastRun = '';
      recordKey = '';
      best = undefined;
      newRecord = false;
      el('solo-hud').hidden = true;
    },
  };
}
