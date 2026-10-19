const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { stopManagedProcess, writeManagedProcess } = require('./start-local.cjs');

const server = http.createServer((request, response) => {
  if (request.url === '/api/v1/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"status":"ok"}');
    return;
  }
  response.writeHead(404);
  response.end();
});

let port;
after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

test('a healthy unverified listener is described as liveness only', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  const script = path.join(__dirname, 'start-local.cjs');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /liveness check/);
  assert.match(result.stdout, /ownership is not verified/);
  assert.doesNotMatch(result.stdout, /Already running and healthy/);
  assert.doesNotMatch(result.stderr, /stop/i);
  assert.equal(server.listening, true);
});

test('stop terminates only a process whose command matches the owned PID record', async (t) => {
  const fixture = path.join(__dirname, 'process-test-child.cjs');
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-api-process-test-'));
  const pidFile = path.join(temporaryDirectory, 'api.pid');
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const child = spawn(process.execPath, [fixture], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  const childExited = new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  });

  writeManagedProcess({ pid: child.pid, port: 3011, command: fixture }, pidFile);
  let stopError = '';
  const stopped = await stopManagedProcess({
    port: 3011,
    file: pidFile,
    log: () => {},
    error: (message) => { stopError = message; },
  });
  assert.equal(stopped, 'stopped', stopError);
  await childExited;

  const unrelated = spawn(process.execPath, [fixture], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    unrelated.once('spawn', resolve);
    unrelated.once('error', reject);
  });
  t.after(async () => {
    if (unrelated.exitCode === null && unrelated.signalCode === null) {
      const exited = new Promise((resolve) => unrelated.once('exit', resolve));
      unrelated.kill();
      await exited;
    }
  });
  writeManagedProcess({ pid: unrelated.pid, port: 3011, command: `${fixture}.not-owned` }, pidFile);
  const refused = await stopManagedProcess({
    port: 3011,
    file: pidFile,
    log: () => {},
    error: () => {},
  });
  assert.equal(refused, 'unverified');
  assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
  const unrelatedExited = new Promise((resolve) => unrelated.once('exit', resolve));
  unrelated.kill('SIGTERM');
  await unrelatedExited;
});
