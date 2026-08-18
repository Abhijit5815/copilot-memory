import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MemoryStore } from '../lib/memory-store';

test('project memories are encrypted and stored in the repo-scoped memory directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-memory-project-'));
  const repoDir = path.join(root, 'repo');
  const globalDir = path.join(root, 'user-home');

  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });

  const key = '0123456789abcdef0123456789abcdef';
  const store = new MemoryStore(globalDir, repoDir, key);

  const result = store.save({
    content: 'Decision: use encrypted project memory storage',
    scope: 'project',
    projectId: 'repo_abc',
    projectName: 'shared-repo',
    type: 'decision',
    tags: ['shared', 'decision'],
  });

  assert.equal(result.status, 'created');

  const projectFile = path.join(repoDir, '.copilot-memory', 'project-memory.enc.json');
  assert.ok(fs.existsSync(projectFile));

  const raw = fs.readFileSync(projectFile, 'utf8');
  assert.match(raw, /"iv"/);
  assert.match(raw, /"ciphertext"/);
  assert.doesNotMatch(raw, /Decision: use encrypted project memory storage/);

  const reloaded = new MemoryStore(globalDir, repoDir, key);
  const memories = reloaded.getAll('project', 'repo_abc');
  assert.equal(memories.length, 1);
  assert.equal(memories[0].content, 'Decision: use encrypted project memory storage');
});
