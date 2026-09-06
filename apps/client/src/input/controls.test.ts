import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createControls } from './controls.js';
let doc: EventTarget & {
  pointerLockElement: unknown;
  hidden: boolean;
  exitPointerLock: () => void;
};
let win: EventTarget;
let controls: ReturnType<typeof createControls>;
const emit = (type: string, properties: Record<string, unknown>) => {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties))
    Object.defineProperty(event, key, { value });
  doc.dispatchEvent(event);
};
beforeEach(() => {
  const canvas = new EventTarget();
  doc = Object.assign(new EventTarget(), {
    pointerLockElement: canvas as unknown,
    hidden: false,
    exitPointerLock() {
      doc.pointerLockElement = null;
      doc.dispatchEvent(new Event('pointerlockchange'));
    },
  });
  win = new EventTarget();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  controls = createControls(
    canvas as HTMLCanvasElement,
    () => {},
    () => {},
  );
});
afterEach(() => {
  controls.dispose();
  vi.unstubAllGlobals();
});
it('toggles the optical sight with Q and clears it when leaving the arena', () => {
  emit('keydown', { code: 'KeyQ', repeat: false });
  emit('keyup', { code: 'KeyQ' });
  expect(controls.aiming).toBe(true);
  emit('keydown', { code: 'KeyQ', repeat: true });
  expect(controls.aiming).toBe(true);
  emit('keydown', { code: 'KeyQ', repeat: false });
  expect(controls.aiming).toBe(false);
  emit('keydown', { code: 'KeyQ', repeat: false });
  win.dispatchEvent(new Event('blur'));
  expect(controls.aiming).toBe(false);
});
it('preserves a short trackpad click until the next animation frame', () => {
  emit('mousedown', { button: 0 });
  emit('mouseup', { button: 0 });
  expect(controls.actions()).toMatchObject({ primary: false, pressed: true });
  expect(controls.actions().pressed).toBe(false);
});
it.each(['KeyR', 'KeyV', 'Tab', 'KeyQ'])(
  '%s does not activate crouch',
  (code) => {
    emit('keydown', { code, repeat: false });
    expect(controls.sample(1).buttons.crouch).toBe(false);
  },
);

it('switches weapon slots by 1, 2 and E without crouching or retaining aim', () => {
  emit('keydown', { code: 'KeyQ', repeat: false });
  emit('keydown', { code: 'Digit2', repeat: false });
  expect(controls.actions().slot).toBe('secondary');
  expect(controls.aiming).toBe(false);
  expect(controls.sample(1).buttons.crouch).toBe(false);
  emit('keydown', { code: 'Digit1', repeat: false });
  expect(controls.actions().slot).toBe('primary');
  emit('keydown', { code: 'KeyE', repeat: false });
  expect(controls.actions().slot).toBe('toggle');
  expect(controls.actions().slot).toBeUndefined();
});
