import type {
  MissionSnapshot,
  MissionStage,
  PlayerSnapshot,
  Vec3,
} from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { visible } from '../bots/navigation.js';

type Chapter = {
  title: string;
  task: string;
  radio: string;
  position: Vec3;
  seconds: number;
  deadline?: number;
  enemies: number;
};
const at = (x: number, z: number, y = 0.16): Vec3 => ({ x, y, z });
export const MISSION: Record<MissionStage, Chapter> = {
  idle: {
    title: 'Последний рейс',
    task: 'Соберите отряд и выходите на задание',
    radio: 'Диспетчер пропал. Последний сигнал пришёл со станции Bastion.',
    position: at(18, 3),
    seconds: 0,
    enemies: 0,
  },
  dispatch: {
    title: '01 · Голос со станции',
    task: 'Найдите радиостанцию внутри вокзала. Удерживайте F',
    radio: 'Штаб: Заберите диспетчера. Не вмешивайтесь в работу гидроузла.',
    position: at(19, 3),
    seconds: 4,
    enemies: 4,
  },
  cell: {
    title: '02 · Свет для нижнего квартала',
    task: 'Заберите силовой блок в депо. Удерживайте F',
    radio:
      'Диспетчер: Внизу ещё люди. Помогите запустить трамвай, потом забирайте меня.',
    position: at(-20, -5),
    seconds: 1,
    enemies: 5,
  },
  deliver: {
    title: '02 · Доставьте силовой блок',
    task: 'Несущий блок: вернитесь к щитку у трамвая и удерживайте F',
    radio:
      'Диспетчер: Блок тяжёлый. Прикройте несущего, ему доступен только пистолет.',
    position: at(0.5, 11),
    seconds: 5,
    enemies: 0,
  },
  switch: {
    title: '03 · Откройте маршрут',
    task: 'Переключите стрелку под галереей. Удерживайте F',
    radio:
      'Штаб: Операцию прекратить. Диспетчер: Стрелка ещё закрыта. Решайте сами.',
    position: at(2, -4, 0.03),
    seconds: 7,
    enemies: 6,
  },
  defend: {
    title: '04 · Посадка',
    task: 'Прикройте посадку возле трамвая. Не подпускайте врагов к щитку',
    radio: 'Диспетчер: Двери открыты. Держите улицу, пока люди садятся!',
    position: at(0.5, 11),
    seconds: 65,
    enemies: 10,
  },
  override: {
    title: '05 · Чёрный старт',
    task: 'Питание сорвано! Запустите аварийный привод на станции. Удерживайте F',
    radio:
      'Диспетчер: Контактная сеть погасла! Ручной привод на станции. Без вас мы не тронемся!',
    position: at(19, 3),
    seconds: 10,
    deadline: 100,
    enemies: 8,
  },
  extract: {
    title: '06 · Последний вагон',
    task: 'Всем живым игрокам собраться у последнего вагона',
    radio: 'Диспетчер: Пошло! Возвращайтесь к задней двери. Я не уйду без вас!',
    position: at(-3, 16.5),
    seconds: 4,
    deadline: 75,
    enemies: 8,
  },
  departing: {
    title: 'Последний рейс',
    task: 'Отряд на борту. Трамвай уходит из квартала',
    radio:
      'Штаб: Вы нарушили приказ. Диспетчер: Зато все здесь. Все до одного.',
    position: at(-3, 16.5),
    seconds: 9,
    enemies: 0,
  },
  complete: {
    title: 'Рейс спасён',
    task: 'Люди и отряд выбрались. R: сыграть заново',
    radio:
      'Диспетчер: Нижний квартал позади. Но затворы плотины всё ещё открываются…',
    position: at(-3, 16.5),
    seconds: 0,
    enemies: 0,
  },
  failed: {
    title: 'Связь потеряна',
    task: 'R: повторить контрольный этап. Перезапускает хозяин комнаты',
    radio: 'Диспетчер: Отряд, ответьте! Мы ещё можем успеть.',
    position: at(-3, 20),
    seconds: 0,
    enemies: 0,
  },
};
export const emptyMission = (runId = 0): MissionSnapshot => ({
  stage: 'idle',
  checkpoint: 'dispatch',
  progress: 0,
  remaining: 0,
  elapsed: 0,
  carrierId: '',
  cargo: { ...MISSION.cell.position },
  queued: 0,
  alive: 0,
  runId,
  serial: 0,
  attempts: 0,
  boarded: 0,
  required: 0,
});
export const missionPoint = (s: MissionSnapshot): Vec3 =>
  s.stage === 'cell' ? s.cargo : MISSION[s.stage].position;
export function missionNear(
  p: PlayerSnapshot,
  point: Vec3,
  world: CollisionWorld,
  radius = 2.5,
) {
  return (
    Math.abs(p.position.y - point.y) < 1.2 &&
    Math.hypot(p.position.x - point.x, p.position.z - point.z) <= radius &&
    visible(
      world,
      { ...p.position, y: p.position.y + 0.65 },
      { ...point, y: point.y + 0.65 },
    )
  );
}
export function enterMissionStage(
  s: MissionSnapshot,
  stage: MissionStage,
  humans: number,
) {
  s.stage = stage;
  s.serial++;
  s.progress = 0;
  s.remaining = MISSION[stage].deadline ?? 0;
  s.boarded = 0;
  s.required = 0;
  if (stage !== 'deliver')
    s.queued =
      MISSION[stage].enemies +
      (MISSION[stage].enemies ? Math.max(0, humans - 1) * 2 : 0);
  if (stage === 'cell') {
    s.carrierId = '';
    s.cargo = { ...MISSION.cell.position };
  }
  if (
    ['dispatch', 'cell', 'switch', 'defend', 'override', 'extract'].includes(
      stage,
    )
  )
    s.checkpoint = stage;
}
/** Only server input, distance and map line-of-sight may advance an objective. */
export function stepMission(
  s: MissionSnapshot,
  dt: number,
  players: readonly PlayerSnapshot[],
  interacting: ReadonlySet<string>,
  world: CollisionWorld,
) {
  if (['idle', 'failed', 'complete'].includes(s.stage)) return;
  const humans = players.filter((p) => !p.bot && p.ready && p.connected);
  const squad = players.filter(
    (p) => (!p.bot || p.ally) && p.ready && p.connected && p.health > 0,
  );
  const livingHumans = humans.filter((p) => p.health > 0);
  s.elapsed += dt;
  if (s.stage === 'departing') {
    s.progress += dt;
    if (s.progress >= MISSION.departing.seconds)
      enterMissionStage(s, 'complete', humans.length);
    return;
  }
  if (!livingHumans.length) {
    enterMissionStage(s, 'failed', humans.length);
    return;
  }
  if (s.carrierId) {
    const carrier = squad.find((p) => p.id === s.carrierId);
    if (carrier) s.cargo = { ...carrier.position };
    else {
      // Drop at the last authoritative, occupiable position; never trust a client target.
      s.carrierId = '';
      const origin = { ...s.cargo, y: s.cargo.y + 0.5 };
      const drop = world.raycast(origin, { x: 0, y: -1, z: 0 }, 12);
      const landed = { ...s.cargo, y: origin.y - drop + 0.03 };
      s.cargo =
        drop < 12 && world.canOccupy(landed, 1.8)
          ? landed
          : { ...MISSION.cell.position };
      s.stage = 'cell';
      s.progress = 0;
      s.serial++;
    }
  }
  if (MISSION[s.stage].deadline) {
    s.remaining = Math.max(0, s.remaining - dt);
    if (s.remaining <= 1e-8) {
      enterMissionStage(s, 'failed', humans.length);
      return;
    }
  }
  const target = missionPoint(s);
  if (s.stage === 'defend') {
    const enemyNear = players.some(
      (p) =>
        p.bot &&
        !p.ally &&
        p.ready &&
        p.connected &&
        p.health > 0 &&
        missionNear(p, target, world, 4),
    );
    if (!enemyNear && squad.some((p) => missionNear(p, target, world, 9)))
      s.progress += dt;
    if (s.progress >= MISSION.defend.seconds)
      enterMissionStage(s, 'override', humans.length);
    return;
  }
  if (s.stage === 'extract') {
    s.required = livingHumans.length;
    s.boarded = livingHumans.filter((p) =>
      missionNear(p, target, world, 3.5),
    ).length;
    if (s.boarded === s.required) s.progress += dt;
    else s.progress = 0;
    if (s.progress >= MISSION.extract.seconds)
      enterMissionStage(s, 'departing', humans.length);
    return;
  }
  const operator = livingHumans.find(
    (p) =>
      interacting.has(p.id) &&
      missionNear(p, target, world) &&
      (s.stage !== 'deliver' || s.carrierId === p.id),
  );
  if (!operator) return;
  s.progress +=
    dt *
    (operator.weapon === 'sapper' &&
    ['deliver', 'switch', 'override'].includes(s.stage)
      ? 1.3
      : 1);
  if (s.progress + 1e-8 < MISSION[s.stage].seconds) return;
  if (s.stage === 'dispatch') enterMissionStage(s, 'cell', humans.length);
  else if (s.stage === 'cell') {
    s.carrierId = operator.id;
    enterMissionStage(s, 'deliver', humans.length);
  } else if (s.stage === 'deliver') {
    s.carrierId = '';
    enterMissionStage(s, 'switch', humans.length);
  } else if (s.stage === 'switch')
    enterMissionStage(s, 'defend', humans.length);
  else if (s.stage === 'override')
    enterMissionStage(s, 'extract', humans.length);
}
