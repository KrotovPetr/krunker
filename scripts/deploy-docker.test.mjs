import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sha = 'a'.repeat(40);
const old = 'b'.repeat(40);
const source = readFileSync(new URL('./deploy-docker.sh', import.meta.url), 'utf8');
const sshSource = readFileSync(
  new URL('./deploy-docker-ssh.sh', import.meta.url),
  'utf8',
);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

function fixture(t, { args = [sha], previous = old, ...env } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'krunker-docker-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['bin', 'config', 'state']) mkdirSync(join(dir, name));
  writeFileSync(
    join(dir, 'config/deploy.env'),
    'KRUNKER_IMAGE_PREFIX=ghcr.io/example/game\n',
  );
  writeFileSync(join(dir, 'config/compose.yaml'), 'services: {}\n');
  if (previous) writeFileSync(join(dir, 'state/current.sha'), previous + '\n');
  const log = join(dir, 'calls.jsonl');
  writeFileSync(log, '');
  writeFileSync(join(dir, 'bin/flock'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(
    join(dir, 'bin/docker'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const tag = process.env.KRUNKER_IMAGE_TAG;
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({args, tag}) + '\\n');
if (args.includes('pull') && process.env.FAIL_PULL === '1') process.exit(1);
if (args.includes('up') && tag === process.env.NEW_SHA && process.env.FAIL_UP === '1') process.exit(1);
if (args.includes('up') && tag === process.env.OLD_SHA && process.env.FAIL_ROLLBACK === '1') process.exit(1);
`,
    { mode: 0o755 },
  );
  // Replace privileged paths and the root check in this disposable fixture only.
  // No real Docker, SSH, sudo, registry or systemd command is executed.
  writeFileSync(
    join(dir, 'deploy.sh'),
    source
      .replace('export PATH=/usr/sbin:/usr/bin:/sbin:/bin', '# Use fixture PATH')
      .replace('[[ $EUID == 0 ]]', '[[ 0 == 0 ]]')
      .replace('CONFIG_DIR=/etc/krunker', `CONFIG_DIR=${quote(join(dir, 'config'))}`)
      .replace(
        'STATE_DIR=/var/lib/krunker-deploy',
        `STATE_DIR=${quote(join(dir, 'state'))}`,
      )
      .replace('DOCKER=/usr/bin/docker', `DOCKER=${quote(join(dir, 'bin/docker'))}`),
  );
  const result = spawnSync('bash', [join(dir, 'deploy.sh'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}/bin:${process.env.PATH}`,
      CALL_LOG: log,
      NEW_SHA: sha,
      OLD_SHA: old,
      ...env,
    },
  });
  const current = join(dir, 'state/current.sha');
  return {
    ...result,
    current: existsSync(current) ? readFileSync(current, 'utf8').trim() : null,
    calls: readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
}

test('rejects malformed or extra arguments before invoking Docker', (t) => {
  for (const args of [[], ['latest'], [`${sha}; id`], [sha, 'extra']]) {
    const result = fixture(t, { args });
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
});

test('pulls before replacing containers and records success', (t) => {
  const result = fixture(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.current, sha);
  assert.ok(
    result.calls.findIndex((c) => c.args.includes('pull')) <
      result.calls.findIndex((c) => c.args.includes('up')),
  );
  assert.ok(result.calls.every((c) => c.args.includes('--env-file')));
});

test('pull failure leaves containers and successful version untouched', (t) => {
  const result = fixture(t, { FAIL_PULL: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(result.current, old);
  assert.ok(!result.calls.some((c) => c.args.includes('up')));
});

test('failed health check restores the previous pair and still fails the job', (t) => {
  const result = fixture(t, { FAIL_UP: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(result.current, old);
  assert.deepEqual(
    result.calls.filter((c) => c.args.includes('up')).map((c) => c.tag),
    [sha, old],
  );
  assert.match(result.stderr, /Rolled back/);
});

test('first-deploy failure cannot claim a rollback', (t) => {
  const result = fixture(t, { previous: null, FAIL_UP: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(result.current, null);
  assert.equal(result.calls.filter((c) => c.args.includes('up')).length, 1);
});

test('rollback failure remains visible', (t) => {
  const result = fixture(t, { FAIL_UP: '1', FAIL_ROLLBACK: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Rollback also failed/);
});

test('SSH rejects shell commands and forwards only a SHA', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'krunker-docker-ssh-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'ssh.sh');
  writeFileSync(file, sshSource.replace('/usr/bin/sudo', '/usr/bin/printf'));
  for (const command of ['', 'bash', `deploy ${sha}; id`, `deploy ${sha} extra`]) {
    const result = spawnSync('bash', [file], {
      encoding: 'utf8',
      env: { ...process.env, SSH_ORIGINAL_COMMAND: command },
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
  // The accepted branch is covered by a harmless argv recorder, not sudo.
  const mock = join(dir, 'sudo');
  writeFileSync(mock, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  writeFileSync(file, sshSource.replace('/usr/bin/sudo', quote(mock)));
  const result = spawnSync('bash', [file], {
    encoding: 'utf8',
    env: { ...process.env, SSH_ORIGINAL_COMMAND: `deploy ${sha}` },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `-n\n/usr/local/sbin/krunker-docker-deploy\n${sha}\n`);
});
