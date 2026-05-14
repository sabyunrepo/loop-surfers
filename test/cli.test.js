import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../src/cli.js';

test('CLI start and progress write state file', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'agent-loop-kit-'));
  const stdout = capture();

  await runCli(['start', 'do useful work'], {
    cwd,
    stdin: Readable.from([]),
    stdout,
    stderr: capture()
  });
  await runCli(['progress', 'created tests'], {
    cwd,
    stdin: Readable.from([]),
    stdout: capture(),
    stderr: capture()
  });

  const raw = await readFile(path.join(cwd, '.agent-loop', 'state.json'), 'utf8');
  const state = JSON.parse(raw);
  assert.equal(state.objective, 'do useful work');
  assert.equal(state.evidence.items[0].summary, 'created tests');
  assert.match(stdout.text, /Loop started/);
});

test('CLI stop hook emits continuation JSON', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'agent-loop-kit-'));
  await runCli(['start', 'continue safely'], {
    cwd,
    stdin: Readable.from([]),
    stdout: capture(),
    stderr: capture()
  });

  const stdout = capture();
  await runCli(['hook', 'stop'], {
    cwd,
    stdin: Readable.from([JSON.stringify({ cwd, hook_event_name: 'Stop' })]),
    stdout,
    stderr: capture()
  });

  const output = JSON.parse(stdout.text);
  assert.equal(output.decision, 'block');
  assert.match(output.reason, /continue safely/);
});

function capture() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  Object.defineProperty(stream, 'text', {
    get() {
      return Buffer.concat(chunks).toString('utf8');
    }
  });
  return stream;
}
