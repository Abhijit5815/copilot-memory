import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MemoryStore } from '../lib/memory-store';

test('onExternalChange fires when another MemoryStore instance writes the same global file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-memory-watch-'));
  const globalDir = path.join(root, 'user-home');
  fs.mkdirSync(globalDir, { recursive: true });

  // Window A's store, with a UI watching it.
  const windowA = new MemoryStore(globalDir);
  let notified = 0;
  const watch = windowA.onExternalChange(() => { notified += 1; });

  try {
    // Window B (or a Language Model Tool call with no UI reference at all)
    // saves to the same underlying file.
    const windowB = new MemoryStore(globalDir);
    windowB.save({ content: 'saved with no UI in the loop', scope: 'global', type: 'manual' });

    // Give the fs watcher + debounce time to fire.
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(notified >= 1, 'expected onExternalChange to fire after another store instance wrote to the shared file');
  } finally {
    watch.dispose();
  }
});
