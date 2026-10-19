const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { resolve } = require('node:path');

const port = Number(process.env.PORT || 3001);
const healthPath = '/api/v1/health';
const pidFile = path.join(os.tmpdir(), `finora-api-${port}.pid`);

function checkPort() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function checkHealth() {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: healthPath, timeout: 1500 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        resolve(response.statusCode === 200 && body.includes('"status":"ok"'));
      });
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => request.destroy());
  });
}

function readManagedProcess(file = pidFile) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      Number.isInteger(record.pid) &&
      record.pid > 0 &&
      Number.isInteger(record.port) &&
      typeof record.command === 'string'
    ) {
      return record;
    }
  } catch {
    // Missing or malformed state is not proof that this script owns a process.
  }
  return null;
}

function writeManagedProcess(record, file = pidFile) {
  const temporaryFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(record), { flag: 'w' });
  fs.renameSync(temporaryFile, file);
}

function removeManagedProcess(pid, file = pidFile) {
  const record = readManagedProcess(file);
  if (record?.pid !== pid) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // The process may have exited while another invocation cleaned up.
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function getProcessCommandLine(pid) {
  try {
    if (process.platform === 'win32') {
      const { execFileSync } = require('node:child_process');
      const query = `$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; if ($p) { $p.CommandLine }`;
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    }
    const { execFileSync } = require('node:child_process');
    return execFileSync('ps', ['-p', String(pid), '-o', 'args='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function isManagedProcess(record) {
  if (!record || !isProcessAlive(record.pid)) return false;
  const actual = getProcessCommandLine(record.pid).replaceAll('\\', '/').toLowerCase();
  const expected = path.resolve(record.command).replaceAll('\\', '/').toLowerCase();
  return actual.includes(expected);
}

function killProcessTree(pid, signal) {
  if (process.platform === 'win32') {
    const { execFileSync } = require('node:child_process');
    try {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      if (isProcessAlive(pid)) throw new Error(`Unable to stop managed API process ${pid}.`);
    }
    return;
  }

  try {
    // The managed Nest process starts in its own process group on POSIX.
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code === 'ESRCH') return;
    try {
      process.kill(pid, signal);
    } catch (fallbackError) {
      if (fallbackError.code !== 'ESRCH') throw fallbackError;
    }
  }
}

async function waitForExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isProcessAlive(pid);
}

async function stopManagedProcess({
  port: requestedPort = port,
  file = pidFile,
  log = console.log,
  error = console.error,
} = {}) {
  const record = readManagedProcess(file);
  if (!record || record.port !== requestedPort) {
    log(`[Finora API] No managed API process is recorded for port ${requestedPort}.`);
    return 'absent';
  }
  if (!isManagedProcess(record)) {
    removeManagedProcess(record.pid, file);
    error('[Finora API] Refusing to stop an unverified process; no process was terminated.');
    return 'unverified';
  }

  try {
    killProcessTree(record.pid, 'SIGTERM');
    if (!(await waitForExit(record.pid))) {
      killProcessTree(record.pid, 'SIGKILL');
      await waitForExit(record.pid, 1000);
    }
  } catch (stopError) {
    error(`[Finora API] Could not stop the managed process: ${stopError.message}`);
    return 'error';
  }
  removeManagedProcess(record.pid, file);
  log(`[Finora API] Stopped the managed API process on port ${requestedPort}.`);
  return 'stopped';
}

async function main() {
  const nestCli = resolve(__dirname, '..', 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
  const record = readManagedProcess();
  if (record && record.port === port) {
    if (!isManagedProcess(record)) {
      removeManagedProcess(record.pid);
    } else if (await checkHealth()) {
      console.log(`[Finora API] The managed API process responds to the liveness endpoint at http://localhost:${port}`);
      process.exitCode = 0;
      return;
    } else {
      console.error(`[Finora API] A managed API process (pid ${record.pid}) exists but its liveness endpoint is not responding.`);
      process.exitCode = 1;
      return;
    }
  }

  if (await checkPort()) {
    if (await checkHealth()) {
      console.log(`[Finora API] An endpoint responds to the liveness check at http://localhost:${port}; process ownership is not verified.`);
      console.log('[Finora API] No process was started or stopped.');
      process.exitCode = 0;
      return;
    }
    console.error(`[Finora API] Port ${port} is already used by another service.`);
    console.error(`[Finora API] Stop that process yourself or run with another PORT before starting Finora.`);
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, [nestCli, 'start'], {
    stdio: 'inherit',
    shell: false,
    detached: process.platform !== 'win32',
  });

  child.once('spawn', () => {
    if (child.pid) {
      writeManagedProcess({ pid: child.pid, port, command: nestCli });
    }
  });
  child.once('exit', (code, signal) => {
    if (child.pid) removeManagedProcess(child.pid);
    process.exitCode = signal ? 1 : code ?? 1;
  });
  child.once('error', (error) => {
    if (child.pid) removeManagedProcess(child.pid);
    console.error(`[Finora API] Could not start Nest: ${error.message}`);
    process.exitCode = 1;
  });

  const stopOnSignal = () => {
    void stopManagedProcess().then((result) => {
      process.exitCode = result === 'stopped' ? 130 : 1;
    });
  };
  process.once('SIGINT', stopOnSignal);
  process.once('SIGTERM', stopOnSignal);
}

if (require.main === module) {
  void main();
}

module.exports = {
  checkHealth,
  checkPort,
  getProcessCommandLine,
  isManagedProcess,
  readManagedProcess,
  stopManagedProcess,
  writeManagedProcess,
};
