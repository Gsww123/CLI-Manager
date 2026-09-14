import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(relative) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
    .replace('from "zustand"', `from "${pathToFileURL(require.resolve('zustand')).href}"`);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { pendingMcpClis, applyMcpTargets, saveMcpRevisionTargets } = await load('../src/features/extensions/lib/mcpPending.ts');
const { useMcpPendingStore: store, trackMcpMutation, beginMcpOperation, finishMcpOperation,
  acknowledgeMcpSave } = await load('../src/features/extensions/state/mcpPendingStore.ts');

test('Track one CLI, retain on navigation, and acknowledge only the target Home', async () => {
  store.setState({ revisions: { claude: 0, codex: 0, grok: 0 }, applied: {}, operation: null, epoch: 0 });
  await trackMcpMutation(['claude'], async () => 'saved desired state');
  assert.deepEqual(pendingMcpClis(store.getState().revisions), ['claude']);
  // Changing views has no store reset; applying Home A never acknowledges Home B.
  acknowledgeMcpSave('home-a', 'claude', 1);
  assert.deepEqual(pendingMcpClis(store.getState().revisions, store.getState().applied['home-a']), []);
  assert.deepEqual(pendingMcpClis(store.getState().revisions, store.getState().applied['home-b']), ['claude']);
  await trackMcpMutation(['claude'], async () => true);
  assert.deepEqual(pendingMcpClis(store.getState().revisions, store.getState().applied['home-a']), ['claude']);
});

test('Failed edits and Skills-only imports do not mark MCP dirty', async () => {
  const before = store.getState().revisions;
  await assert.rejects(trackMcpMutation(['codex'], async () => { throw Error('failed'); }));
  await trackMcpMutation(['claude', 'codex', 'grok'], async () => ({ mcp: false }), result => result.mcp);
  assert.deepEqual(store.getState().revisions, before);
  assert.equal(store.getState().operation, null);
});

test('Save lock prevents edit races; read-only page entry cannot create pending revisions', async () => {
  beginMcpOperation('save');
  await assert.rejects(trackMcpMutation(['codex'], async () => true), /operation_busy/);
  acknowledgeMcpSave('home-a', 'claude', store.getState().revisions.claude);
  finishMcpOperation();
  assert.deepEqual(pendingMcpClis(store.getState().revisions, store.getState().applied['home-a']), []);
  const workflow = readFileSync(new URL('../src/features/extensions/api/mcpSaving.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /noteNativeMcpDifference|preview\.changed/);
  store.setState({ revisions: { claude: 0, codex: 0, grok: 0 }, applied: {} });
  assert.deepEqual(pendingMcpClis(store.getState().revisions), []);
});

test('Save partial success acknowledges successes and retries only failures', async () => {
  store.setState({ revisions: { claude: 1, codex: 1, grok: 1 }, applied: {}, operation: null });
  const calls = [];
  const failures = await applyMcpTargets(['claude', 'codex', 'grok'], async cli => {
    calls.push(cli);
    if (cli === 'codex') throw Error('conflict');
    acknowledgeMcpSave('home-a', cli, 1);
  });
  assert.deepEqual(calls, ['claude', 'codex', 'grok']);
  assert.deepEqual(failures.map(item => item.cli), ['codex']);
  assert.deepEqual(pendingMcpClis(store.getState().revisions, store.getState().applied['home-a']), ['codex']);
});

test('All requested settings leave routes use the same guard', () => {
  const modal = readFileSync(new URL('../src/features/settings/api/SettingsModal.tsx', import.meta.url), 'utf8');
  assert.match(modal, /mcpSave\.requestLeave\(onClose\)/);
  assert.match(modal, /mcpSave\.requestLeave\(change\)/);
  assert.match(modal, /mcpSave\.requestLeave\(\(\) => setExtensionTab/);
  const workflow = readFileSync(new URL('../src/features/extensions/api/mcpSaving.tsx', import.meta.url), 'utf8');
  assert.match(workflow, /if \(ok\) leave\(\)/);
  assert.match(workflow, /current\.operation/);
});

test('Native save uses captured fingerprints and acknowledges only verified writes', async () => {
  const calls = [];
  const acknowledged = [];
  const errors = await saveMcpRevisionTargets('home-a', { claude: 4, codex: 2, grok: 0 }, ['claude', 'codex'], {
    homeIdentity: async () => 'home-a',
    preview: async cli => ({ fingerprint: `preview-${cli}` }),
    apply: async (cli, fingerprint) => { calls.push([cli, fingerprint]); if (cli === 'codex') throw Error('external conflict'); },
    acknowledge: (cli, revision) => acknowledged.push([cli, revision]),
  });
  assert.deepEqual(calls, [['claude', 'preview-claude'], ['codex', 'preview-codex']]);
  assert.deepEqual(acknowledged, [['claude', 4]]);
  assert.deepEqual(errors.map(item => item.cli), ['codex']);
});

test('Changing Home after preview prevents native writes and acknowledgements', async () => {
  let identity = 'home-a';
  const errors = await saveMcpRevisionTargets('home-a', { claude: 1, codex: 0, grok: 0 }, ['claude'], {
    homeIdentity: async () => identity,
    preview: async () => { identity = 'home-b'; return { fingerprint: 'old-preview' }; },
    apply: async () => assert.fail('must not write to a different Home'),
    acknowledge: () => assert.fail('must remain pending'),
  });
  assert.equal(errors.length, 1);
});
