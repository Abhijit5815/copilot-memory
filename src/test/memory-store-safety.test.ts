import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MemoryStore } from '../lib/memory-store';

test('project memory never falls back to a hardcoded encryption key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-memory-nokey-'));
  const repoDir = path.join(root, 'repo');
  const globalDir = path.join(root, 'user-home');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });

  const previousEnvKey = process.env.COPILOT_MEMORY_KEY;
  const previousNewEnvKey = process.env.MEMORY_BOOK_KEY;
  delete process.env.COPILOT_MEMORY_KEY;
  delete process.env.MEMORY_BOOK_KEY;

  try {
    const store = new MemoryStore(globalDir, repoDir, undefined);

    assert.throws(
      () => store.save({
        content: 'Decision: this should never be written with a known key',
        scope: 'project',
        projectId: 'repo_abc',
        projectName: 'shared-repo',
        type: 'decision',
      }),
      /encryption key is missing/i,
    );

    // No project store file should exist - the extension must fail loudly
    // rather than silently encrypting with a well-known default.
    assert.equal(fs.existsSync(path.join(repoDir, '.memory-book', 'project-memory.enc.json')), false);
  } finally {
    if (previousEnvKey !== undefined) process.env.COPILOT_MEMORY_KEY = previousEnvKey;
    if (previousNewEnvKey !== undefined) process.env.MEMORY_BOOK_KEY = previousNewEnvKey;
  }
});

test('two stores sharing the same directory do not lose each other\'s writes (lost-update race)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-memory-race-'));
  const globalDir = path.join(root, 'user-home');
  fs.mkdirSync(globalDir, { recursive: true });

  // Simulates two VS Code windows both holding a global-scope store pointed
  // at the same directory (no project root involved, so no key needed).
  const windowA = new MemoryStore(globalDir);
  const windowB = new MemoryStore(globalDir);

  windowA.save({ content: 'Memory from window A', scope: 'global', type: 'manual' });
  // windowB's in-memory state was loaded before windowA's save. Without a
  // reload-before-write, this save would overwrite windowA's entry on disk.
  windowB.save({ content: 'Memory from window B', scope: 'global', type: 'manual' });

  const windowC = new MemoryStore(globalDir);
  const contents = windowC.getAll('global').map((m) => m.content).sort();

  assert.deepEqual(contents, ['Memory from window A', 'Memory from window B']);
});
