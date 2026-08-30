import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MemoryStore } from '../lib/memory-store';
import { projectMemoryFileExists, verifyProjectMemoryKey } from '../lib/memory-store';

function makeRepoDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-memory-keysync-'));
  const repoDir = path.join(root, 'repo');
  const globalDir = path.join(root, 'user-home');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });
  return { repoDir, globalDir };
}

test('projectMemoryFileExists reflects whether project memory has ever been saved', () => {
  const { repoDir, globalDir } = makeRepoDirs();

  assert.equal(projectMemoryFileExists(repoDir), false);

  const store = new MemoryStore(globalDir, repoDir, 'a-real-key');
  store.save({ content: 'first project memory', scope: 'project', projectId: 'repo_x', type: 'decision' });

  assert.equal(projectMemoryFileExists(repoDir), true);
});

test('verifyProjectMemoryKey: true for a fresh repo (nothing to verify against), true for the right key, false for the wrong key', () => {
  const { repoDir, globalDir } = makeRepoDirs();

  // Nothing saved yet - any key is "fine" because there's nothing to unlock.
  assert.equal(verifyProjectMemoryKey(repoDir, 'whatever'), true);

  const store = new MemoryStore(globalDir, repoDir, 'correct-horse-battery-staple');
  store.save({ content: 'decision: use the correct key', scope: 'project', projectId: 'repo_x', type: 'decision' });

  assert.equal(verifyProjectMemoryKey(repoDir, 'correct-horse-battery-staple'), true);
  assert.equal(verifyProjectMemoryKey(repoDir, 'a-totally-different-key'), false);
});

test('two teammates independently generating different keys cannot silently read/write each other\'s data - it fails loudly instead', () => {
  const { repoDir, globalDir } = makeRepoDirs();

  // Teammate A sets up project memory with their own key (simulating "Generate a new key").
  const teammateA = new MemoryStore(globalDir, repoDir, 'teammate-a-key');
  teammateA.save({ content: 'we use trunk-based development', scope: 'project', projectId: 'repo_x', type: 'decision' });

  // Teammate B pulls the repo, never coordinated on a key, and independently
  // generates their own (the exact scenario the fix in lib/secrets.ts now
  // blocks at the UI layer by checking projectMemoryFileExists() first).
  // At the storage layer, this must fail clearly rather than corrupt/lose A's data.
  assert.throws(
    () => new MemoryStore(globalDir, repoDir, 'teammate-b-different-key'),
    /does not match|corrupted/i,
  );

  // A's data must still be intact and readable with the correct key.
  const reopenedAsA = new MemoryStore(globalDir, repoDir, 'teammate-a-key');
  const memories = reopenedAsA.getAll('project', 'repo_x');
  assert.equal(memories.length, 1);
  assert.equal(memories[0].content, 'we use trunk-based development');
});
