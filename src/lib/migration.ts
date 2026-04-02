import * as fs from 'node:fs';
import * as path from 'node:path';
import { SqliteMemoryStore, Scope } from './sqlite-store';
import { debugLog } from './settings';

interface LegacyMemory {
  id: string;
  content: string;
  metadata: {
    type: 'manual' | 'project-knowledge';
    project?: string;
    tags?: string[];
  };
  createdAt: string;
}

export function migrateFromJsonl(
  storageDir: string,
  store: SqliteMemoryStore,
): { migrated: number; skipped: number; errors: number } {
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  if (!fs.existsSync(storageDir)) {
    return { migrated, skipped, errors };
  }

  const entries = fs.readdirSync(storageDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const memoriesFile = path.join(storageDir, entry.name, 'memories.jsonl');
    if (!fs.existsSync(memoriesFile)) continue;

    // Skip if already migrated
    if (store.isMigrated(memoriesFile)) {
      debugLog('Skipping already migrated', { source: memoriesFile });
      skipped++;
      continue;
    }

    const scope: Scope = entry.name.startsWith('personal_') ? 'global' : 'project';
    const projectId = scope === 'project' ? entry.name : undefined;

    const content = fs.readFileSync(memoriesFile, 'utf-8');
    const lines = content.trim().split('\n');
    let fileCount = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const legacy = JSON.parse(line) as LegacyMemory;
        store.add({
          content: legacy.content,
          scope,
          projectId,
          projectName: legacy.metadata.project,
          type: legacy.metadata.type,
          tags: legacy.metadata.tags,
        });
        migrated++;
        fileCount++;
      } catch {
        errors++;
      }
    }

    store.markMigrated(memoriesFile, fileCount);
  }

  debugLog('JSONL migration complete', { migrated, skipped, errors });
  return { migrated, skipped, errors };
}
