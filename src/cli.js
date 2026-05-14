import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  completeLoop,
  createInitialState,
  defaultStatePath,
  loadState,
  recordProgress,
  saveState,
  stopLoop,
  summarizeState
} from './kernel/state.js';
import { classifyStopFailure, createDeferredTask, deferTask } from './kernel/blockers.js';
import { evaluateStop, formatStopHookOutput } from './kernel/scheduler.js';
import { buildUserPromptContext } from './kernel/prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runCli(args, io) {
  const [command, ...rest] = args;

  switch (command) {
    case 'start':
      return startCommand(rest, io);
    case 'stop':
      return stopCommand(rest, io);
    case 'status':
      return statusCommand(rest, io);
    case 'deferred':
      return deferredCommand(rest, io);
    case 'progress':
      return progressCommand(rest, io);
    case 'defer':
      return deferCommand(rest, io);
    case 'complete':
      return completeCommand(rest, io);
    case 'hook':
      return hookCommand(rest, io);
    case 'install':
      return installCommand(rest, io);
    case 'help':
    case '-h':
    case '--help':
    case undefined:
      io.stdout.write(helpText());
      return;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

async function startCommand(args, io) {
  const options = parseOptions(args);
  const objective = options.positionals.join(' ').trim();
  const cwd = path.resolve(options.cwd ?? io.cwd);
  const statePath = path.resolve(options.state ?? defaultStatePath(cwd));
  const state = createInitialState({
    objective,
    cwd,
    budgets: {
      maxContinuations: options.maxContinuations,
      maxWallMinutes: options.maxWallMinutes,
      maxNoProgressRepeats: options.maxNoProgressRepeats
    }
  });

  await saveState(statePath, state);
  io.stdout.write(`Loop started.\nstate: ${statePath}\n`);
}

async function stopCommand(args, io) {
  const options = parseOptions(args);
  const statePath = resolveStatePath(options, io);
  const state = await requireState(statePath);
  stopLoop(state, options.reason ?? 'manual stop');
  await saveState(statePath, state);
  io.stdout.write(`Loop stopped.\nstate: ${statePath}\n`);
}

async function completeCommand(args, io) {
  const options = parseOptions(args);
  const statePath = resolveStatePath(options, io);
  const state = await requireState(statePath);
  completeLoop(state, options.reason ?? (options.positionals.join(' ') || 'completed'));
  await saveState(statePath, state);
  io.stdout.write(`Loop completed.\nstate: ${statePath}\n`);
}

async function statusCommand(args, io) {
  const options = parseOptions(args);
  const statePath = resolveStatePath(options, io);
  const state = await loadState(statePath);
  if (options.json) {
    io.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }
  io.stdout.write(`${summarizeState(state, {
    statePath,
    deferredOnly: Boolean(options.deferred || options.followUp || options.followup)
  })}\n`);
}

async function deferredCommand(args, io) {
  const options = parseOptions(args);
  const statePath = resolveStatePath(options, io);
  const state = await loadState(statePath);
  if (options.json) {
    io.stdout.write(`${JSON.stringify({
      ready: state?.queues?.ready ?? [],
      deferred: state?.queues?.deferred ?? []
    }, null, 2)}\n`);
    return;
  }
  io.stdout.write(`${summarizeState(state, {
    statePath,
    deferredOnly: true
  })}\n`);
}

async function progressCommand(args, io) {
  const options = parseOptions(args);
  const statePath = resolveStatePath(options, io);
  const state = await requireState(statePath);
  const summary = options.summary ?? options.positionals.join(' ');
  recordProgress(state, summary, { artifact: options.artifact ?? null });
  await saveState(statePath, state);
  io.stdout.write('Progress recorded.\n');
}

async function deferCommand(args, io) {
  const options = parseOptions(args);
  const statePath = resolveStatePath(options, io);
  const state = await requireState(statePath);
  const title = options.task ?? options.title ?? options.positionals.join(' ');
  const task = createDeferredTask({
    title,
    type: options.type ?? 'unknown',
    scope: options.scope ?? 'task',
    provider: options.provider ?? 'local',
    evidence: options.evidence ?? '',
    blockedCapability: options.blockedCapability ?? options.capability ?? null,
    retryAt: options.retryAt ?? null,
    retryAfterSeconds: options.retryAfterSeconds ?? null,
    requiresUserAction: Boolean(options.manual ?? options.requiresUserAction),
    maxAttempts: options.maxAttempts ?? 5
  });
  deferTask(state, task);
  await saveState(statePath, state);
  io.stdout.write(`Task deferred.\nid: ${task.id}\nstatus: ${task.status}\n`);
}

function resolveStatePath(options, io) {
  const cwd = path.resolve(options.cwd ?? io.cwd);
  return path.resolve(options.state ?? defaultStatePath(cwd));
}

async function hookCommand(args, io) {
  const [hookEvent, ...rest] = args;
  const options = parseOptions(rest);
  const input = await readJsonFromStdin(io.stdin);
  const cwd = path.resolve(options.cwd ?? input.cwd ?? io.cwd);
  const statePath = path.resolve(options.state ?? defaultStatePath(cwd));
  const state = await loadState(statePath);

  if (hookEvent === 'stop') {
    const result = evaluateStop(state, input, { statePath });
    if (result.state) {
      await saveState(statePath, result.state);
    }
    io.stdout.write(formatStopHookOutput(result));
    return;
  }

  if (hookEvent === 'stop-failure') {
    if (state?.active) {
      const task = classifyStopFailure(input);
      deferTask(state, task);
      if (task.blocker.scope === 'global') {
        state.currentTask = null;
      }
      await saveState(statePath, state);
    }
    if (options.json) {
      io.stdout.write(`${JSON.stringify({ recorded: Boolean(state?.active) })}\n`);
    }
    return;
  }

  if (hookEvent === 'user-prompt-submit') {
    const context = buildUserPromptContext(state, statePath);
    if (context) {
      io.stdout.write(`${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: context
        }
      })}\n`);
    }
    return;
  }

  throw new Error(`unknown hook event: ${hookEvent}`);
}

async function installCommand(args, io) {
  const options = parseOptions(args);
  const host = options.host ?? options.positionals[0];
  if (!host || !['claude', 'codex', 'all'].includes(host)) {
    throw new Error('install requires --host claude, --host codex, or --host all');
  }

  const target = path.resolve(options.target ?? io.cwd);
  const agentLoopCommand = options.agentLoopCommand ?? options.command ?? defaultAgentLoopCommand();
  const hosts = host === 'all' ? ['claude', 'codex'] : [host];
  for (const item of hosts) {
    await copyTemplate(item, target, {
      AGENT_LOOP_COMMAND: agentLoopCommand
    }, {
      force: Boolean(options.force)
    });
  }

  io.stdout.write([
    `Installed Agent Loop Kit templates for ${hosts.join(', ')}.`,
    `target: ${target}`,
    `command: ${agentLoopCommand}`,
    'Review the generated *.example files and merge the hook config into your agent settings.',
    ''
  ].join('\n'));
}

async function copyTemplate(host, target, replacements, options = {}) {
  const src = path.join(__dirname, 'templates', host);
  const exists = await stat(src).then(() => true, () => false);
  if (!exists) {
    throw new Error(`missing template directory for host: ${host}`);
  }
  await mkdir(target, { recursive: true });
  await copyDirectory(src, target, replacements, options);
}

async function copyDirectory(src, dest, replacements, options) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, replacements, options);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    await copyTextFile(srcPath, destPath, replacements, options);
  }
}

async function copyTextFile(srcPath, destPath, replacements, options) {
  const [raw, metadata] = await Promise.all([
    readFile(srcPath, 'utf8'),
    stat(srcPath)
  ]);
  const rendered = renderTemplate(raw, replacements);
  await mkdir(path.dirname(destPath), { recursive: true });
  try {
    await writeFile(destPath, rendered, {
      mode: metadata.mode,
      flag: options.force ? 'w' : 'wx'
    });
  } catch (error) {
    if (error?.code === 'EEXIST' && !options.force) {
      return;
    }
    throw error;
  }
  await chmod(destPath, metadata.mode);
}

function renderTemplate(value, replacements) {
  return Object.entries(replacements).reduce((current, [key, replacement]) => {
    return current.replaceAll(`{{${key}}}`, replacement);
  }, value);
}

function defaultAgentLoopCommand() {
  const binPath = path.resolve(__dirname, '..', 'bin', 'agent-loop.js');
  return `node ${shellQuote(binPath)}`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function requireState(statePath) {
  const state = await loadState(statePath);
  if (!state) {
    throw new Error(`loop state not found: ${statePath}`);
  }
  return state;
}

async function readJsonFromStdin(stdin) {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function parseOptions(args) {
  const options = { positionals: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) {
      options.positionals.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    const key = toCamelCase(rawKey);
    if (inlineValue !== undefined) {
      options[key] = coerceValue(inlineValue);
      continue;
    }

    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = coerceValue(next);
    index += 1;
  }
  return options;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function coerceValue(value) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
}

function helpText() {
  return `Agent Loop Kit

Usage:
  agent-loop start [options] "<objective>"
  agent-loop stop [--reason "<reason>"]
  agent-loop status [--json] [--deferred]
  agent-loop deferred [--json]
  agent-loop progress "<evidence>"
  agent-loop defer --task "<task>" [--type rate_limit] [--retry-after-seconds 60]
  agent-loop complete --reason "<summary>"
  agent-loop hook stop
  agent-loop hook stop-failure
  agent-loop hook user-prompt-submit
  agent-loop install --host claude|codex|all [--target .] [--force]

Common options:
  --state <path>                    Override .agent-loop/state.json
  --max-continuations <n>           Default: 20
  --max-wall-minutes <n>            Default: 240
  --max-no-progress-repeats <n>     Default: 2
`;
}
