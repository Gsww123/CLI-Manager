import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const source = readFileSync(new URL('../src-tauri/src/features/extensions/inventory.rs', import.meta.url), 'utf8');
const script = source.match(/const WSL_SCAN: &str = r#"([\s\S]*?)"#;/)?.[1];
assert.ok(script, 'Execute the real embedded WSL scanner, not a reimplementation');
const python = process.platform === 'win32' ? 'python' : 'python3';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cli-manager-inventory-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function addSkill(path) {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'SKILL.md'), '---\nname: fixture\n---\n');
}

function deepBranch(root, directory) {
  let path = join(root, '00-unrelated-cache');
  for (let depth = 2; depth <= 8; depth += 1) path = join(path, `level-${depth}`);
  mkdirSync(path, { recursive: true });
  if (directory) mkdirSync(join(path, 'level-9'));
  else writeFileSync(join(path, 'ordinary.txt'), 'not a Skill');
}

function scan(root) {
  const child = spawnSync(python, ['-c', script, root, 'claude', 'plugin'], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test('ordinary deep files do not suppress shallow sibling Skills', (t) => {
  const root = fixture(t);
  deepBranch(root, false);
  addSkill(join(root, '99-valid-skill'));
  const result = scan(root);
  assert.equal(result.limited, false);
  assert.deepEqual(result.entries.map((entry) => entry.name), ['99-valid-skill']);
});

test('real depth truncation retains partial entries and its warning flag', (t) => {
  const root = fixture(t);
  deepBranch(root, true);
  addSkill(join(root, '99-valid-skill'));
  const result = scan(root);
  assert.equal(result.limited, true);
  assert.deepEqual(result.entries.map((entry) => entry.name), ['99-valid-skill']);
});

test('depth-eight Skills are included but depth-nine directories are not traversed', (t) => {
  const root = fixture(t);
  let allowed = join(root, 'allowed');
  let blocked = join(root, 'blocked');
  for (let depth = 2; depth <= 8; depth += 1) {
    allowed = join(allowed, `level-${depth}`);
    blocked = join(blocked, `level-${depth}`);
  }
  addSkill(allowed);
  addSkill(join(blocked, 'too-deep'));
  const result = scan(root);
  assert.equal(result.limited, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].path, allowed);
});

test('output remains capped at 500 entries', (t) => {
  const root = fixture(t);
  for (let index = 0; index <= 500; index += 1) {
    addSkill(join(root, `skill-${String(index).padStart(4, '0')}`));
  }
  const result = scan(root);
  assert.equal(result.limited, true);
  assert.equal(result.entries.length, 500);
});

test('path budget bounds scans even when every entry is an ordinary file', (t) => {
  const root = fixture(t);
  for (let index = 0; index < 10000; index += 1) {
    writeFileSync(join(root, `file-${index}.txt`), 'fixture');
  }
  const result = scan(root);
  assert.equal(result.limited, true);
  assert.deepEqual(result.entries, []);
});

test('missing root is an empty complete scan', (t) => {
  const root = fixture(t);
  assert.deepEqual(scan(join(root, 'missing')), { entries: [], limited: false });
});

test('directory links and dangling links are discovered without recursion', {
  skip: process.platform === 'win32' ? 'POSIX symlink test; real WSL transport not exercised here' : false,
}, (t) => {
  const root = fixture(t);
  symlinkSync(root, join(root, 'loop'), 'dir');
  symlinkSync(join(root, 'missing'), join(root, 'dangling'), 'dir');
  const result = scan(root);
  assert.equal(result.limited, false);
  assert.equal(result.entries.length, 2);
  assert.ok(result.entries.some((entry) => entry.status === 'missing'));
});
