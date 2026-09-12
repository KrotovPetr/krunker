import { isTeamMode } from '@fps/protocol';
import { createMinimap } from './ui/minimap.js';
import { createSoloUI } from './ui/solo-ui.js';
import { createMissionUI } from './ui/mission-ui.js';
import { modeSchema, difficultySchema, mapIdSchema } from '@fps/protocol';
import './ui/styles.css';
import './ui/entry.css';
import './ui/mission.css';
import { nicknameSchema } from '@fps/protocol';
import type { GameSnapshot, PlayerSnapshot } from '@fps/protocol';
import { Connection } from './network/connection.js';
import { createScene } from './render/scene.js';
import { createControls } from './input/controls.js';
import {
  emptyWave,
  createFixedStepper,
  initializePhysics,
  FIREARMS,
  KNIFE,
  horizontalRecoil,
  equippedWeapon,
  magazineAmmo,
} from '@fps/game-core';
import { selectableWeaponSchema } from '@fps/protocol';
import { createPresentation } from './network/presentation.js';
import { createGameUI } from './ui/game-ui.js';
import { createSound } from './audio/sound.js';
import { playerColor } from './render/player-colors.js';
import { invitationRoom } from './ui/entry.js';
import { TICK_RATE } from '@fps/protocol';
import {
  loadGraphicsQuality,
  saveGraphicsQuality,
  type GraphicsQuality,
} from './render/graphics-quality.js';

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing element: ${selector}`);
  return result;
}
const form = element<HTMLFormElement>('#join-form');
const joinButton = element<HTMLButtonElement>('#join');
const nickname = element<HTMLInputElement>('#nickname');
const session = element('#session');
const message = element('#message');
const status = element('#status');
const invite = element<HTMLInputElement>('#invite');
const playButton = element<HTMLButtonElement>('#play');
const hud = element('#movement-hud');
let connected = false;
let sequence = 1;
let localId = '';
let latest: GameSnapshot | undefined;
let local: PlayerSnapshot | undefined;
let presentation: ReturnType<typeof createPresentation> | undefined;
const gameUI = createGameUI();
const soloUI = createSoloUI();
const missionUI = createMissionUI();
const minimap = createMinimap();
const sound = createSound();
let shotCooldown = 0;
void initializePhysics()
  .then(() => {
    presentation = createPresentation();
    if (latest) presentation.receive(latest, localId);
    playButton.disabled = !local || !controls;
    element<HTMLButtonElement>('#quick-play').disabled =
      !controls || joinButton.disabled;
    element<HTMLButtonElement>('#mission-play').disabled =
      element<HTMLButtonElement>('#control-play').disabled =
      element<HTMLButtonElement>('#coop-play').disabled =
        !controls || joinButton.disabled;
    if (!connected && controls && !joinButton.disabled)
      status.textContent = 'Можно играть';
  })
  .catch(() => {
    message.textContent = 'Не удалось загрузить физику. Обнови страницу.';
  });
const stepper = createFixedStepper(TICK_RATE);
let roomId = new URL(location.href).searchParams.get('room');
let scene: ReturnType<typeof createScene> | undefined;
const graphicsQuality = element<HTMLSelectElement>('#graphics-quality');
const initialGraphicsQuality = loadGraphicsQuality(window.localStorage);
graphicsQuality.value = initialGraphicsQuality;
try {
  scene = createScene(
    element('#scene'),
    (from, to) => presentation?.hasSight(from, to) ?? false,
    initialGraphicsQuality,
  );
} catch {
  message.textContent =
    'Не удалось запустить WebGL. Проверь поддержку графики в браузере.';
}
graphicsQuality.addEventListener('change', () => {
  const quality = graphicsQuality.value as GraphicsQuality;
  saveGraphicsQuality(window.localStorage, quality);
  scene?.setGraphicsQuality(quality);
});
const controls = scene
  ? createControls(
      scene.canvas,
      (locked) => {
        element('#app').classList.toggle('playing', locked);
        hud.hidden = !locked;
        scene?.setFirstPerson(locked);
        sound.setActive(locked);
        stepper.reset();
        if (connected) sendInput();
      },
      (text) => {
        message.textContent = text;
      },
    )
  : undefined;
if (controls) {
  const sensitivity = element<HTMLInputElement>('#sensitivity');
  const value = element<HTMLOutputElement>('#sensitivity-value');
  sensitivity.value = String(controls.sensitivity * 1000);
  value.value = Number(sensitivity.value).toFixed(1);
  sensitivity.addEventListener('input', () => {
    controls.setSensitivity(Number(sensitivity.value) / 1000);
    value.value = Number(sensitivity.value).toFixed(1);
  });
}
const volume = element<HTMLInputElement>('#volume');
volume.value = String(Math.round(sound.volume * 100));
volume.addEventListener('input', () =>
  sound.setVolume(Number(volume.value) / 100),
);
function sendInput() {
  if (!controls) return;
  const command = controls.sample(sequence++);
  if (local?.reloadRemaining || local?.slot === 'knife') command.aiming = false;
  presentation?.input(command);
  connection.send(command);
}
const selfDestructHint = element('#self-destruct-hint');
scene?.onFrame((dt) => {
  gameUI.frame(
    controls?.scoreboard ?? false,
    controls?.aiming ?? false,
    controls?.locked ?? false,
    controls?.look().yaw,
  );
  if (!connected || !controls) return;
  shotCooldown = Math.max(0, shotCooldown - dt);
  const alpha = stepper.advance(dt, sendInput);
  const actions = controls.actions();
  const destructProgress = controls.selfDestructProgress;
  const destructAllowed =
    local?.ready &&
    local.health > 0 &&
    latest &&
    (latest.phase === 'active' ||
      (latest.phase === 'waiting' &&
        (latest.mode === 'training' || latest.mode === 'parkour'))) &&
    !(
      latest.mode === 'mission' &&
      ['departing', 'complete', 'failed'].includes(latest.mission?.stage ?? '')
    );
  selfDestructHint.hidden = !destructAllowed || destructProgress <= 0;
  if (!selfDestructHint.hidden) {
    const text = `Самоуничтожение через ${(1.5 * (1 - destructProgress)).toFixed(1)} с · отпусти K для отмены`;
    if (selfDestructHint.textContent !== text)
      selfDestructHint.textContent = text;
  }
  if (actions.selfDestruct && destructAllowed)
    connection.send({ type: 'selfDestruct' });
  if (actions.order)
    connection.send({
      type: 'squadOrder',
      kind: actions.order,
      ...controls.look(),
    });
  if (actions.grenade)
    connection.send({ type: 'throwGrenade', ...controls.look() });
  if (actions.mine) connection.send({ type: 'deployMine' });
  if (actions.slot && local) {
    const slot =
      actions.slot === 'toggle'
        ? local.slot === 'primary'
          ? 'secondary'
          : 'primary'
        : actions.slot;
    connection.send({ type: 'selectSlot', slot });
    shotCooldown = Math.max(shotCooldown, 0.22);
  }
  if (actions.reload) {
    if (
      latest?.mode === 'mission' &&
      ['failed', 'complete'].includes(latest.mission?.stage ?? '') &&
      latest.hostId === localId
    )
      connection.send({ type: 'restartMission' });
    else if (
      latest?.mode === 'waves' &&
      latest.wave.status === 'defeat' &&
      latest.hostId === localId
    )
      connection.send({ type: 'restartWaves' });
    else connection.send({ type: 'reload' });
  }
  if (
    local &&
    local.health > 0 &&
    latest &&
    latest.phase !== 'results' &&
    latest.mode !== 'parkour' &&
    local.challenge.status !== 'countdown' &&
    local.ready &&
    shotCooldown <= 0 &&
    local.reloadRemaining <= 0
  ) {
    const weapon = equippedWeapon(local);
    const knife = weapon === 'knife';
    const primary = knife
      ? actions.pressed && local.challenge.status !== 'running'
      : magazineAmmo(local) > 0 &&
        (actions.pressed || (actions.primary && FIREARMS[weapon].automatic));
    if (primary) {
      connection.send({
        type: 'fire',
        inputSeq: Math.max(0, sequence - 1),
        ...controls.look(),
        attack: knife ? 'knife' : 'primary',
        viewTick: presentation?.viewTick,
      });
      shotCooldown = knife ? KNIFE.interval : FIREARMS[weapon].interval;
      scene?.shotFeedback(knife);
      sound.shot(knife ? 'knife' : weapon);
      if (!knife)
        controls.recoil(
          FIREARMS[weapon].recoil,
          horizontalRecoil(
            weapon,
            FIREARMS[weapon].magazine - magazineAmmo(local),
          ),
        );
    }
  }
  scene?.setLook(controls.look());
  if (local)
    scene?.setAiming(
      controls.aiming &&
        local.slot !== 'knife' &&
        local.health > 0 &&
        local.reloadRemaining <= 0 &&
        latest?.phase !== 'results',
    );
  const frame = presentation?.frame(dt, alpha);
  if (frame) {
    scene?.update(frame, localId);
    minimap.update(frame, localId, controls.look());
    sound.update(frame, localId);
  }
});
playButton.addEventListener('click', () => {
  void sound.unlock();
  connection.send({ type: 'ready', ready: true });
  void controls?.lock();
});
element<HTMLSelectElement>('#ally-count').addEventListener(
  'change',
  (event) => {
    connection.send({
      type: 'setAllies',
      count: Number((event.target as HTMLSelectElement).value),
    });
  },
);
element('#ready').addEventListener('click', () =>
  connection.send({ type: 'ready', ready: true }),
);
element<HTMLSelectElement>('#weapon-select').addEventListener(
  'change',
  (event) => {
    connection.send({
      type: 'selectWeapon',
      weapon: selectableWeaponSchema.parse(
        (event.target as HTMLSelectElement).value,
      ),
    });
  },
);

element<HTMLSelectElement>('#assault-loadout').addEventListener(
  'change',
  (event) => {
    connection.send({
      type: 'selectWeapon',
      weapon: selectableWeaponSchema.parse(
        (event.target as HTMLSelectElement).value,
      ),
    });
  },
);

function startChallenge() {
  if (!connected || (latest?.mode !== 'training' && latest?.mode !== 'parkour'))
    return;
  controls?.resetLook();
  shotCooldown = 0;
  connection.send({ type: 'startChallenge' });
  void sound.unlock();
  void controls?.lock();
}
element<HTMLSelectElement>('#map-select').addEventListener(
  'change',
  (event) => {
    controls?.resetLook();
    connection.send({
      type: 'setMap',
      mapId: mapIdSchema.parse((event.target as HTMLSelectElement).value),
    });
  },
);
element('#restart-waves').addEventListener('click', () => {
  connection.send({ type: 'restartWaves' });
  void sound.unlock();
  void controls?.lock();
});
element('#start-challenge').addEventListener('click', startChallenge);
element('#cancel-challenge').addEventListener('click', () =>
  connection.send({ type: 'cancelChallenge' }),
);
element<HTMLSelectElement>('#mode-select').addEventListener(
  'change',
  (event) => {
    controls?.resetLook();
    connection.send({
      type: 'setMode',
      mode: modeSchema.parse((event.target as HTMLSelectElement).value),
    });
  },
);
for (const selector of ['#bot-count', '#bot-difficulty'])
  element(selector).addEventListener('change', () => {
    connection.send({
      type: 'setBots',
      count: Number(element<HTMLSelectElement>('#bot-count').value),
      difficulty: difficultySchema.parse(
        element<HTMLSelectElement>('#bot-difficulty').value,
      ),
    });
  });
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' && controls?.locked && !event.repeat) {
    event.preventDefault();
    minimap.toggle();
  }
  if (event.code === 'KeyF' && controls?.locked && !event.repeat) {
    event.preventDefault();
    if (latest?.mode !== 'mission') startChallenge();
  }
});
let rosterKey = '';
function renderPlayers(snapshot: GameSnapshot, id: string) {
  localId = id;
  latest = snapshot;
  local = snapshot.players.find((player) => player.id === id);
  if (local) sequence = Math.max(sequence, local.lastProcessedInput + 1);
  presentation?.receive(snapshot, id);
  gameUI.snapshot(snapshot, id);
  soloUI.snapshot(snapshot, id);
  missionUI.snapshot(snapshot, id);
  const nextRosterKey = JSON.stringify([
    id,
    snapshot.mode,
    snapshot.players.map((p) => [
      p.id,
      p.nickname,
      p.colorIndex,
      p.bot,
      p.ally,
    ]),
  ]);
  if (nextRosterKey !== rosterKey) {
    rosterKey = nextRosterKey;
    const list = element('#players');
    list.replaceChildren(
      ...snapshot.players.map((player) => {
        const item = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = player.id === localId ? 'dot local' : 'dot';
        dot.style.backgroundColor =
          '#' +
          playerColor(
            player.colorIndex,
            player.id === localId ||
              (isTeamMode(snapshot.mode) && (!player.bot || player.ally)),
          )
            .toString(16)
            .padStart(6, '0');
        const name = document.createElement('span');
        name.textContent = player.nickname;
        item.append(dot, name);
        if (player.id === localId) {
          const self = document.createElement('small');
          self.textContent = 'ТЫ';
          item.append(self);
        }
        return item;
      }),
    );
  }
  element('#player-count').textContent = `${snapshot.players.length} / 8`;
  element('#empty-roster').hidden = snapshot.players.length > 0;
  if (!presentation) scene?.update(snapshot, localId);
  playButton.disabled = !local || !controls || !presentation;
  if (local) {
    element('#speed').textContent = Math.hypot(
      local.velocity.x,
      local.velocity.z,
    ).toFixed(1);
    element('#stance').textContent = local.sliding
      ? 'Скольжение'
      : !local.grounded
        ? 'В воздухе'
        : local.crouched
          ? 'Приседание'
          : 'На земле';
    hud.dataset.tick = String(snapshot.tick);
    hud.dataset.x = String(local.position.x);
    hud.dataset.y = String(local.position.y);
    hud.dataset.z = String(local.position.z);
    hud.dataset.grounded = String(local.grounded);
    hud.dataset.crouched = String(local.crouched);
    hud.dataset.sliding = String(local.sliding);
    hud.dataset.yaw = String(local.yaw);
    hud.dataset.pitch = String(local.pitch);
    hud.dataset.aim = String(local.aimProgress);
  }
}

function updateJoinButton() {
  joinButton.textContent = roomId ? 'Войти в комнату' : 'Создать комнату';
  element('#app').classList.toggle('invited', !!roomId);
  element('#invitation-notice').hidden = !roomId;
  element('#invited-room').textContent = roomId ?? '';
  element('#quick-start-options').hidden = !!roomId;
  element('#solo-start-option').hidden = !!roomId;
  element('#custom-room-note').hidden = !!roomId;
  element('#friend-entry').hidden = !!roomId;
  element('#new-room-link').hidden = !roomId;
  element('#title').innerHTML = roomId
    ? 'Игра по<br /><span>приглашению.</span>'
    : 'Собери отряд.<br /><span>Держи оборону.</span>';
  element('.intro').textContent = roomId
    ? 'Введи ник и присоединяйся. Настройки комнаты сохранятся.'
    : 'Спаси последний рейс из Bastion, удерживай точку или отбивай волны на плотине. Начни с ботами, друзей пригласи по ссылке из игры.';
  element('#entry-eyebrow').textContent = roomId
    ? 'ИГРА С ДРУЗЬЯМИ'
    : 'БЕЗ РЕГИСТРАЦИИ · СРАЗУ В ИГРУ';
  element('#map-name').textContent = roomId
    ? 'ПРИГЛАШЕНИЕ / НАСТРОЙКИ КОМНАТЫ'
    : 'SPILLWAY / СУХОЙ ВОДОСБРОС';
}
updateJoinButton();

const connection = new Connection({
  snapshot: renderPlayers,
  event(event) {
    scene?.event(event);
    minimap.event(event, localId);
    gameUI.event(event, localId);
    sound.event(event, localId);
  },
  reconnecting(active) {
    connected = !active;
    element('#network-banner').hidden = !active;
    status.textContent = active ? 'Переподключение…' : 'В комнате';
    stepper.reset();
    presentation?.reset();
    if (active) controls?.release();
    else {
      shotCooldown = 0;
      message.textContent = 'Связь восстановлена. Можно вернуться на арену.';
    }
  },
  error(text) {
    message.textContent = text;
  },
  leave() {
    connected = false;
    presentation?.reset();
    gameUI.reset();
    soloUI.reset();
    missionUI.reset();
    minimap.reset();
    sound.reset();
    element('#network-banner').hidden = true;
    controls?.release();
    controls?.resetLook();
    scene?.setFirstPerson(false);
    element('#app').classList.remove('playing', 'in-room', 'map-preview');
    element('#close-map-preview').hidden = true;
    hud.hidden = true;
    stepper.reset();
    form.hidden = false;
    session.hidden = true;
    joinButton.disabled = false;
    status.textContent = 'Не подключён';
    status.classList.remove('connected');
    message.textContent =
      'Соединение закрыто. Можно создать комнату или войти по ссылке.';
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    roomId = null;
    updateJoinButton();
    renderPlayers(
      {
        tick: 0,
        wave: emptyWave(),
        mapId: 'spillway',
        mode: 'arena',
        hostId: '',
        botCount: 3,
        allyCount: 0,
        difficulty: 'normal',
        phase: 'waiting',
        round: 0,
        remaining: 0,
        winner: '',
        players: [],
        mines: [],
        grenades: [],
      },
      '',
    );
    scene?.update(
      {
        tick: 0,
        wave: emptyWave(),
        mapId: 'spillway',
        mode: 'arena',
        hostId: '',
        botCount: 3,
        allyCount: 0,
        difficulty: 'normal',
        phase: 'waiting',
        round: 0,
        remaining: 0,
        winner: '',
        players: [],
        mines: [],
        grenades: [],
      },
      '',
    );
    gameUI.reset();
    soloUI.reset();
    minimap.reset();
    missionUI.reset();
    sound.reset();
  },
});

function quickPlay(
  allies: number,
  mode: 'waves' | 'control' | 'mission' = 'waves',
) {
  if (joinButton.disabled || !controls || !presentation) return;
  const invited = !!roomId;
  if (!nickname.value.trim()) nickname.value = 'Игрок';
  void sound.unlock();
  void controls.lock();
  void join().then(() => {
    if (!connected) {
      controls.release();
      return;
    }
    if (!invited) {
      if (mode === 'waves')
        connection.send({ type: 'setMap', mapId: 'spillway' });
      connection.send({ type: 'setMode', mode });
      connection.send({ type: 'setAllies', count: allies });
    }
    connection.send({ type: 'ready', ready: true });
  });
}
element('#quick-play').addEventListener('click', () => quickPlay(0));
element('#coop-play').addEventListener('click', () => quickPlay(2));
element('#control-play').addEventListener('click', () =>
  quickPlay(2, 'control'),
);
element('#mission-play').addEventListener('click', () =>
  quickPlay(2, 'mission'),
);
element('#restart-mission').addEventListener('click', () =>
  connection.send({ type: 'restartMission' }),
);
function previewMap(open: boolean) {
  element('#app').classList.toggle('map-preview', open);
  element('#close-map-preview').hidden = !open;
  if (open) element('#close-map-preview').focus();
  else element(connected ? '#map-preview' : '#landing-preview').focus();
}
element('#map-preview').addEventListener('click', () => previewMap(true));
element('#landing-preview').addEventListener('click', () => previewMap(true));
element('#close-map-preview').addEventListener('click', () =>
  previewMap(false),
);
document.addEventListener('keydown', (event) => {
  if (
    event.code === 'Escape' &&
    element('#app').classList.contains('map-preview')
  )
    previewMap(false);
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void join();
});
const friendLink = element<HTMLInputElement>('#friend-link');
function joinFriend() {
  if (joinButton.disabled) return;
  const invitedRoom = invitationRoom(friendLink.value, location.href);
  if (!invitedRoom) {
    element('#friend-error').textContent =
      'Вставь ссылку с ?room=… или код комнаты из меню игры.';
    friendLink.setAttribute('aria-invalid', 'true');
    friendLink.focus();
    return;
  }
  element('#friend-error').textContent = '';
  friendLink.removeAttribute('aria-invalid');
  roomId = invitedRoom;
  updateJoinButton();
  void join();
}
element('#join-friend').addEventListener('click', joinFriend);
friendLink.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    joinFriend();
  }
});
async function join() {
  if (joinButton.disabled) return;
  if (!nickname.value.trim()) nickname.value = 'Игрок';
  const parsed = nicknameSchema.safeParse(nickname.value);
  if (!parsed.success) {
    message.textContent = 'Введи ник от 1 до 20 символов.';
    return;
  }
  joinButton.disabled = true;
  element<HTMLButtonElement>('#quick-play').disabled = true;
  element<HTMLButtonElement>('#mission-play').disabled =
    element<HTMLButtonElement>('#control-play').disabled =
    element<HTMLButtonElement>('#coop-play').disabled =
      true;
  element<HTMLButtonElement>('#join-friend').disabled = true;
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'Подключаемся…';
  message.textContent = '';
  try {
    roomId = await connection.join(parsed.data, roomId);
    connected = true;
    sequence = 1;
    shotCooldown = 0;
    stepper.reset();
    const url = new URL(location.href);
    url.searchParams.set('room', roomId);
    history.replaceState(null, '', url);
    invite.value = url.toString();
    element('#room-id').textContent = roomId;
    form.hidden = true;
    session.hidden = false;
    element('#app').classList.add('in-room');
    status.textContent = 'В комнате';
    status.classList.add('connected');
  } catch {
    status.textContent = 'Не подключён';
    message.textContent = roomId
      ? 'Комната недоступна или заполнена. Проверь ссылку или нажми Browser FPS, чтобы создать новую.'
      : 'Сервер недоступен. Проверь, что он запущен, и попробуй ещё раз.';
  } finally {
    joinButton.disabled = false;
    element<HTMLButtonElement>('#quick-play').disabled =
      !controls || !presentation;
    element<HTMLButtonElement>('#mission-play').disabled =
      element<HTMLButtonElement>('#control-play').disabled =
      element<HTMLButtonElement>('#coop-play').disabled =
        !controls || !presentation;
    element<HTMLButtonElement>('#join-friend').disabled = false;
    form.removeAttribute('aria-busy');
  }
}
element('#copy').addEventListener('click', () => {
  if (!navigator.clipboard) {
    invite.select();
    message.textContent = 'Скопируй выделенную ссылку.';
    return;
  }
  void navigator.clipboard.writeText(invite.value).then(
    () => {
      message.textContent = 'Ссылка скопирована.';
    },
    () => {
      invite.select();
      message.textContent = 'Скопируй выделенную ссылку.';
    },
  );
});
element('#leave').addEventListener('click', () => {
  void connection.leave().catch(() => {
    message.textContent = 'Не удалось закрыть соединение.';
  });
});
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    connected = false;
    controls?.dispose();
    scene?.dispose();
    sound.dispose();
    presentation?.dispose();
    void connection.leave();
  });
}
