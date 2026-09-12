import type { GameSnapshot } from '@fps/protocol';
import { MISSION, missionPoint } from '@fps/game-core';

const el = (id: string) => document.getElementById(id)!;
export function createMissionUI() {
  let radioKey = '';
  const reset = () => {
    for (const id of ['mission-hud', 'mission-radio', 'mission-cinema'])
      el(id).hidden = true;
    document.getElementById('app')?.classList.remove('mission-finale');
    radioKey = '';
  };
  return {
    reset,
    snapshot(snapshot: GameSnapshot, id: string) {
      const mission = snapshot.mission;
      if (snapshot.mode !== 'mission' || !mission) {
        reset();
        return;
      }
      const chapter = MISSION[mission.stage];
      const local = snapshot.players.find((p) => p.id === id);
      const target = missionPoint(mission);
      const distance = local
        ? Math.round(
            Math.hypot(
              local.position.x - target.x,
              local.position.z - target.z,
            ),
          )
        : 0;
      el('mission-hud').hidden = false;
      el('mission-hud').dataset.stage = mission.stage;
      el('mission-hud').dataset.progress = String(mission.progress);
      el('mission-title').textContent = chapter.title;
      el('mission-task').textContent = chapter.task;
      const progress = el('mission-progress') as HTMLProgressElement;
      progress.value = chapter.seconds
        ? Math.min(1, mission.progress / chapter.seconds)
        : 0;
      const carrier = snapshot.players.find((p) => p.id === mission.carrierId);
      el('mission-status').textContent = [
        ['departing', 'complete'].includes(mission.stage)
          ? 'ЭВАКУАЦИЯ ПОДТВЕРЖДЕНА'
          : local?.health === 0 && snapshot.phase === 'active'
            ? 'Вы погибли. Возврат на следующем этапе'
            : `${distance} м до цели`,
        mission.remaining > 0
          ? `${Math.ceil(mission.remaining)} с до закрытия маршрута`
          : '',
        mission.stage === 'extract'
          ? `У вагона ${mission.boarded}/${mission.required}`
          : '',
        carrier ? `Блок: ${carrier.nickname}` : '',
        mission.stage === 'defend'
          ? 'Посадка идёт, пока отряд рядом, а щиток свободен от врагов'
          : '',
        ['complete', 'failed'].includes(mission.stage)
          ? `Попытка ${mission.attempts + 1} · ${Math.floor(mission.elapsed / 60)}:${String(Math.floor(mission.elapsed % 60)).padStart(2, '0')}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const key = `${mission.runId}:${mission.serial}`;
      if (key !== radioKey) {
        radioKey = key;
        el('mission-radio-text').textContent = chapter.radio;
      }
      el('mission-radio').hidden = false;
      const cinematic =
        mission.stage === 'departing' || mission.stage === 'complete';
      el('mission-cinema').hidden = !cinematic;
      el('app').classList.toggle('mission-finale', cinematic);
      const restart = el('restart-mission') as HTMLButtonElement;
      restart.hidden = !['complete', 'failed'].includes(mission.stage);
      restart.disabled = snapshot.hostId !== id;
      restart.textContent =
        mission.stage === 'complete'
          ? 'Сыграть заново · R'
          : 'Повторить этап · R';
      el('match-time').textContent = 'ПОСЛЕДНИЙ РЕЙС';
    },
  };
}
