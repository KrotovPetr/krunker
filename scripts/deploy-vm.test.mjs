import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sha = 'a'.repeat(40);
const source = readFileSync(new URL('./deploy-vm.sh', import.meta.url), 'utf8');

function run(t, command = `deploy ${sha}`, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'krunker-deploy-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['bin', 'app/.git', 'app/apps/client', 'static'])
    mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, 'app/apps/client/.env.production'),
    'VITE_SERVER_URL=https://example.com\n',
  );
  const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
  writeFileSync(
    join(dir, 'deploy.sh'),
    source
      .replace('APP_DIR=/opt/krunker', `APP_DIR=${quote(join(dir, 'app'))}`)
      .replace(
        'STATIC_DIR=/var/www/krunker',
        `STATIC_DIR=${quote(join(dir, 'static'))}`,
      ),
  );
  // External effects are replaced; parsing, ordering and failure handling run
  // through the actual deployment script. No network or system services run.
  const mock = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify([name, ...args]) + '\\n');
if (name === 'git') {
  if (args[0] === 'diff' && process.env.DIRTY === '1') process.exit(1);
  if (args[0] === 'rev-parse') console.log(process.env.MAIN_SHA);
  if (args[0] === 'show') console.log(args[1].endsWith(':.nvmrc') ? process.versions.node : JSON.stringify({packageManager: 'pnpm@10.34.5'}));
}
if (name === 'pnpm') {
  if (args[0] === '--version') console.log('10.34.5');
  if (args[0] === 'build' && process.env.FAIL_BUILD === '1') process.exit(1);
}
if (name === 'curl' && process.env.FAIL_HEALTH === '1') process.exit(22);
`;
  for (const name of ['git', 'flock', 'pnpm', 'sudo', 'rsync', 'curl', 'chmod'])
    writeFileSync(join(dir, 'bin', name), mock, { mode: 0o755 });
  const log = join(dir, 'calls.jsonl');
  writeFileSync(log, '');
  const result = spawnSync('bash', [join(dir, 'deploy.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}/bin:${process.env.PATH}`,
      CALL_LOG: log,
      SSH_ORIGINAL_COMMAND: command,
      MAIN_SHA: sha,
      ...overrides,
    },
  });
  return {
    ...result,
    calls: readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
}

test('accepts only a deployment SHA, never arbitrary SSH commands', (t) => {
  for (const command of [
    '',
    'bash',
    `deploy ${sha}; id`,
    `deploy ${sha} extra`,
  ]) {
    const result = run(t, command);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
});
test('skips stale successful runs without stopping the current game', (t) => {
  const result = run(t, `deploy ${'b'.repeat(40)}`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.calls.some(([name]) => name === 'sudo' || name === 'rsync'),
    false,
  );
});
test('refuses local modifications before stopping the service', (t) => {
  const result = run(t, `deploy ${sha}`, { DIRTY: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(
    result.calls.some(([name]) => name === 'sudo'),
    false,
  );
});
test('checks out the tested commit and publishes only after building', (t) => {
  const result = run(t);
  assert.equal(result.status, 0, result.stderr);
  const operations = result.calls.map((args) => args.join(' '));
  const index = (prefix) => operations.findIndex((op) => op.startsWith(prefix));
  assert.ok(
    index('sudo -n /usr/bin/systemctl stop') <
      index(`git checkout --detach ${sha}`),
  );
  assert.ok(index('pnpm build') < index('rsync'));
  assert.ok(index('rsync') < index('sudo -n /usr/bin/systemctl start'));
  assert.ok(index('sudo -n /usr/bin/systemctl start') < index('curl'));
  assert.match(result.stdout, new RegExp(`Deployed ${sha}`));
});
test('a failed build never publishes files or starts a partial application', (t) => {
  const result = run(t, `deploy ${sha}`, { FAIL_BUILD: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(
    result.calls.some(([name]) => name === 'rsync'),
    false,
  );
  assert.equal(
    result.calls.some((args) => args.includes('start')),
    false,
  );
});
test('a failed health check fails the deployment instead of reporting success', (t) => {
  const result = run(t, `deploy ${sha}`, { FAIL_HEALTH: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Deployed/);
});
