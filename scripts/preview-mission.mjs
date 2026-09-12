// Visual fixture only. Requires pnpm dev; never sends commands to a game room.
/* global document, window */
import { firefox } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const output = 'test-results/mission-visual';
await mkdir(output, { recursive: true });
const browser = await firefox.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#mission-play').waitFor({ state: 'visible' });
  await page.evaluate(async (workspace) => {
    const core = await import(
      `/@fs${workspace}/packages/game-core/src/index.ts`
    );
    const { createScene } = await import('/src/render/scene.ts');
    const { createMissionUI } = await import('/src/ui/mission-ui.ts');
    await core.initializePhysics();
    const game = core.createGame(
      core.DEFAULT_CONFIG,
      core.getMap('bastion'),
      0,
    );
    game.enqueue({ type: 'join', playerId: 'preview', nickname: 'Отряд' });
    game.step(1 / 60);
    const snapshot = game.snapshot();
    game.dispose();
    snapshot.mode = 'mission';
    snapshot.phase = 'active';
    snapshot.hostId = 'preview';
    snapshot.players[0].ready = true;
    snapshot.players[0].position = { x: 18, y: 0.16, z: 8 };
    const container = document.getElementById('scene');
    container.replaceChildren();
    const scene = createScene(container, () => true, 'low');
    scene.setFirstPerson(true);
    const ui = createMissionUI();
    document.getElementById('app').classList.add('playing');
    document.getElementById('movement-hud').hidden = false;
    let serial = 0;
    window.missionPreview = (stage, progress = 0) => {
      snapshot.mission = core.emptyMission(1);
      core.enterMissionStage(snapshot.mission, stage, 4);
      snapshot.mission.serial = ++serial;
      snapshot.mission.progress = progress;
      scene.update(snapshot, 'preview');
      ui.snapshot(snapshot, 'preview');
    };
  }, process.cwd());
  for (const [stage, progress] of [
    ['dispatch', 0],
    ['override', 2],
    ['departing', 3],
    ['complete', 0],
  ]) {
    await page.evaluate(
      ([stage, progress]) => window.missionPreview(stage, progress),
      [stage, progress],
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/${stage}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Mission visual fixtures: ${output}`);
} finally {
  await browser.close();
}
