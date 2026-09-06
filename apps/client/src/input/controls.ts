import { EMPTY_BUTTONS } from '@fps/game-core';
import type { InputCommand } from '@fps/protocol';

const STORAGE_KEY = 'fps.mouseSensitivity';
export function createControls(
  canvas: HTMLCanvasElement,
  onLock: (locked: boolean) => void,
  onError: (message: string) => void,
) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const keys = new Set<string>();
  let yaw = 0,
    pitch = 0,
    sensitivity = 0.002;
  let jumpQueued = false;
  let primary = false,
    shotQueued = false,
    knifeQueued = false,
    reloadQueued = false,
    aimHeld = false,
    aimToggled = false;
  let slotQueued: 'primary' | 'secondary' | 'toggle' | undefined;
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (stored >= 0.0005 && stored <= 0.006) sensitivity = stored;
  } catch {
    /* Settings remain usable when storage is unavailable. */
  }
  const locked = () => document.pointerLockElement === canvas;
  const aiming = () => (aimHeld || aimToggled) && locked();
  const clear = () => {
    keys.clear();
    jumpQueued = false;
    slotQueued = undefined;
    primary =
      shotQueued =
      knifeQueued =
      reloadQueued =
      aimHeld =
      aimToggled =
        false;
  };
  const handled = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'Space',
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'KeyC',
    'KeyR',
    'KeyV',
    'Tab',
    'KeyQ',
    'KeyE',
    'Digit1',
    'Digit2',
  ]);
  document.addEventListener(
    'keydown',
    (event) => {
      if (!locked()) return;
      if (event.code === 'Escape') {
        release();
        return;
      }
      if (!handled.has(event.code)) return;
      event.preventDefault();
      if (event.code === 'Space' && !keys.has('Space')) jumpQueued = true;
      if (!event.repeat && event.code === 'KeyR') reloadQueued = true;
      if (!event.repeat && event.code === 'KeyV') knifeQueued = true;
      if (!event.repeat && event.code === 'KeyQ') aimToggled = !aimToggled;
      if (!event.repeat && ['KeyE', 'Digit1', 'Digit2'].includes(event.code)) {
        slotQueued =
          event.code === 'Digit1'
            ? 'primary'
            : event.code === 'Digit2'
              ? 'secondary'
              : 'toggle';
        aimHeld = aimToggled = false;
      }
      keys.add(event.code);
    },
    options,
  );
  document.addEventListener(
    'keyup',
    (event) => {
      keys.delete(event.code);
    },
    options,
  );
  canvas.addEventListener(
    'contextmenu',
    (event) => event.preventDefault(),
    options,
  );
  document.addEventListener(
    'mousedown',
    (event) => {
      if (!locked()) return;
      if (event.button === 0) {
        primary = true;
        shotQueued = true;
      }
      if (event.button === 2) aimHeld = true;
    },
    options,
  );
  document.addEventListener(
    'mouseup',
    (event) => {
      if (event.button === 0) primary = false;
      if (event.button === 2) aimHeld = false;
    },
    options,
  );
  document.addEventListener(
    'mousemove',
    (event) => {
      if (!locked()) return;
      yaw = Math.atan2(
        Math.sin(yaw - event.movementX * sensitivity * (aiming() ? 0.4 : 1)),
        Math.cos(yaw - event.movementX * sensitivity * (aiming() ? 0.4 : 1)),
      );
      pitch = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(
          Math.PI / 2 - 0.01,
          pitch - event.movementY * sensitivity * (aiming() ? 0.4 : 1),
        ),
      );
    },
    options,
  );
  document.addEventListener(
    'pointerlockchange',
    () => {
      clear();
      onLock(locked());
    },
    options,
  );
  document.addEventListener(
    'pointerlockerror',
    () =>
      onError(
        'Браузер не разрешил захват мыши. Нажми «Выйти на арену» ещё раз.',
      ),
    options,
  );
  const release = () => {
    clear();
    if (locked()) document.exitPointerLock();
  };
  window.addEventListener('blur', release, options);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) release();
    },
    options,
  );
  return {
    get aiming() {
      return aiming();
    },
    get scoreboard() {
      return keys.has('Tab') && locked();
    },
    get locked() {
      return locked();
    },
    actions() {
      const result = {
        primary,
        pressed: shotQueued,
        knife: knifeQueued,
        reload: reloadQueued,
        slot: slotQueued,
      };
      shotQueued = knifeQueued = reloadQueued = false;
      slotQueued = undefined;
      return result;
    },
    recoil(amount: number, horizontal = 0) {
      yaw = Math.atan2(Math.sin(yaw + horizontal), Math.cos(yaw + horizontal));
      pitch = Math.min(Math.PI / 2 - 0.01, pitch + amount);
    },
    get sensitivity() {
      return sensitivity;
    },
    setSensitivity(value: number) {
      if (!Number.isFinite(value)) return;
      sensitivity = Math.max(0.0005, Math.min(0.006, value));
      try {
        localStorage.setItem(STORAGE_KEY, String(sensitivity));
      } catch {
        /* Optional persistence. */
      }
    },
    async lock() {
      try {
        await canvas.requestPointerLock();
      } catch {
        onError('Не удалось захватить мышь. Нажми «Выйти на арену» ещё раз.');
      }
    },
    release,
    resetLook() {
      yaw = 0;
      pitch = 0;
    },
    look() {
      return { yaw, pitch };
    },
    sample(seq: number): InputCommand {
      const active = locked();
      const buttons = active
        ? {
            forward: keys.has('KeyW'),
            back: keys.has('KeyS'),
            left: keys.has('KeyA'),
            right: keys.has('KeyD'),
            jump: keys.has('Space') || jumpQueued,
            crouch: [
              'ShiftLeft',
              'ShiftRight',
              'ControlLeft',
              'ControlRight',
              'KeyC',
            ].some((key) => keys.has(key)),
          }
        : { ...EMPTY_BUTTONS };
      jumpQueued = false;
      return { type: 'input', seq, yaw, pitch, buttons, aiming: aiming() };
    },
    dispose() {
      release();
      abort.abort();
    },
  };
}
