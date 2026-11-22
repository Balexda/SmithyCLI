import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { platform, release, arch } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [root, claude] = process.argv.slice(2).map(path => realpathSync(path));
const cwd = join(root, 'checkout');
const home = join(root, 'home');
const argvFile = join(root, 'argv');
const store = join(root, 'store');
const env = {
  HOME: home,
  CLAUDE_CONFIG_DIR: join(home, '.claude'),
  PATH: join(root, 'bin') + ':' + process.env.PATH,
  SHELL: '/bin/bash',
  GIT_CONFIG_NOSYSTEM: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_AUTOUPDATER: '1',
  ANTHROPIC_API_KEY: 'local-probe-only',
};
const settings = {
  permissions: { allow: ['Bash(smithy probe-query)', 'Bash(smithy probe-write)'] },
  sandbox: { enabled: false },
};
const flags = [
  '--bare', '--setting-sources', '', '--settings', JSON.stringify(settings),
  '--permission-mode', 'dontAsk', '--tools', 'Bash', '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}', '--output-format', 'stream-json',
  '--verbose', '--max-turns', '3', '-p',
];

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function git(repo, ...args) {
  return execFileSync('git', ['-C', join(root, repo), ...args], { env, encoding: 'utf8' });
}

function snapshot() {
  const [storeHead, storeParent = null] = git('store', 'rev-list', '--parents', '-n1', 'HEAD').trim().split(' ');
  return {
    checkoutHead: git('checkout', 'rev-parse', 'HEAD').trim(),
    checkoutIndexSha256: sha256(join(cwd, '.git/index')),
    storeHead,
    storeParent,
    storePaths: git('store', 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').trim(),
    storeContent: git('store', 'show', 'HEAD:probe.txt'),
  };
}

// The endpoint supplies requests only. Claude Code owns authorization and execution.
let command;
const server = createServer(async (request, response) => {
  if (request.url.split('?')[0] !== '/v1/messages') {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const { messages, model, stream } = JSON.parse(Buffer.concat(chunks));
  const completed = messages.some(({ content }) =>
    Array.isArray(content) && content.some(block => block.type === 'tool_result'));
  const usage = { input_tokens: 1, output_tokens: 1 };
  const message = {
    id: 'msg_probe', type: 'message', role: 'assistant', model, content: [],
    stop_reason: null, stop_sequence: null, usage,
  };
  const reason = completed ? 'end_turn' : 'tool_use';
  const input = { command, description: 'Run fixture operation' };
  const block = completed
    ? { type: 'text', text: 'Probe finished.' }
    : { type: 'tool_use', id: 'toolu_probe', name: 'Bash', input };
  if (!stream) {
    response.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ ...message, content: [block], stop_reason: reason }));
    return;
  }
  const events = [
    ['message_start', { message }],
    ['content_block_start', { index: 0, content_block: completed ? { ...block, text: '' } : { ...block, input: {} } }],
    ['content_block_delta', { index: 0, delta: completed
      ? { type: 'text_delta', text: block.text }
      : { type: 'input_json_delta', partial_json: JSON.stringify(input) } }],
    ['content_block_stop', { index: 0 }],
    ['message_delta', { delta: { stop_reason: reason, stop_sequence: null }, usage }],
    ['message_stop', {}],
  ];
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    .end(events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`).join(''));
});

const record = {
  utc: new Date().toISOString(),
  platform: { os: platform(), release: release(), arch: arch() },
  version: execFileSync(claude, ['--version'], { cwd, env, encoding: 'utf8' }).trim(),
  runtime: { path: claude, sha256: sha256(claude) },
  standIn: { path: join(root, 'bin/smithy'), sha256: sha256(join(root, 'bin/smithy')) },
  cwd,
  store,
  settings,
  flags,
  modelEndpoint: 'loopback scripted Bash requests',
  operations: [],
};

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
try {
  for (const operation of ['probe-query', 'probe-write', 'probe-unrelated']) {
    command = `smithy ${operation}`;
    rmSync(argvFile, { force: true });
    const before = snapshot();
    const process = run(claude, [...flags, `Run exactly this Bash command: ${command}`], {
      cwd, env, timeout: 45_000,
    });
    process.child.stdin.end();
    const result = await process.catch(error => error);
    const events = (result.stdout ?? '').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const init = events.find(event => event.type === 'system' && event.subtype === 'init');
    const request = events.flatMap(event => event.message?.content ?? [])
      .find(block => block.type === 'tool_use' && block.name === 'Bash' && block.input.command === command);
    const toolResult = events.flatMap(event => event.message?.content ?? [])
      .find(block => block.type === 'tool_result' && request && block.tool_use_id === request.id);
    const final = events.find(event => event.type === 'result');
    const denial = final?.permission_denials?.find(entry => entry.tool_input?.command === command);
    const argv = existsSync(argvFile) ? readFileSync(argvFile, 'utf8').split('\0').slice(0, -1) : null;
    record.operations.push({
      command,
      argv,
      ruleDecision: denial ? 'denied' : argv && request ? 'allowed' : 'unobserved',
      approval: 'none supplied (noninteractive dontAsk)',
      exitCode: result.code ?? (result.signal ? null : 0),
      signal: result.signal ?? null,
      observedPermissionMode: init?.permissionMode ?? null,
      toolRequest: request ?? null,
      toolResult: toolResult ?? null,
      permissionDenial: denial ?? null,
      sessionResult: final ? { subtype: final.subtype, result: final.result, errors: final.errors } : null,
      stderr: result.stderr ?? '',
      before,
      after: snapshot(),
    });
  }
} finally {
  server.close();
  const [query, write, unrelated] = record.operations;
  const isolated = record.operations.every(({ before, after, observedPermissionMode }) =>
    observedPermissionMode === 'dontAsk' && before.checkoutHead === after.checkoutHead &&
    before.checkoutIndexSha256 === after.checkoutIndexSha256);
  const completed = record.operations.length === 3 && record.operations.every(operation => operation.toolResult);
  const passed = completed && isolated &&
    query.ruleDecision === 'allowed' && query.argv.join(' ') === 'probe-query' &&
    !query.toolResult.is_error && query.toolResult.content === store &&
    query.before.storeHead === query.after.storeHead &&
    write.ruleDecision === 'allowed' && write.argv.join(' ') === 'probe-write' &&
    !write.toolResult.is_error && write.after.storeHead !== write.before.storeHead &&
    write.after.storeParent === write.before.storeHead && write.after.storePaths === 'probe.txt' &&
    write.after.storeContent === 'probe write completed\n' &&
    unrelated.ruleDecision === 'denied' && unrelated.argv === null && unrelated.toolResult.is_error &&
    unrelated.before.storeHead === unrelated.after.storeHead;
  record.outcome = passed ? 'pass' : completed ? 'fail' : 'incomplete';
  console.log(JSON.stringify(record, null, 2));
  if (!passed) process.exitCode = 1;
}
