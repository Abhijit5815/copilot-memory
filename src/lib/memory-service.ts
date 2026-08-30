import { getProjectName, getRepoContainerTag } from './container-tag';
import {
  inferMemoryType,
  MemoryType,
  SaveMemoryResult,
  Scope,
} from './memory-domain';
import { MemoryStore } from './memory-store';
import { redactSecrets } from './secret-scan';
import { debugLog } from './settings';

export interface WorkspaceMemoryContext {
  cwd: string;
}

export interface SaveMemoryRequest {
  content: string;
  scope: Scope;
  type?: MemoryType;
  tags?: string[];
}

export class MemoryService {
  constructor(private store: MemoryStore) {}

  saveFromWorkspace(
    request: SaveMemoryRequest,
    context: WorkspaceMemoryContext,
  ): SaveMemoryResult {
    const projectId = request.scope === 'project' ? getRepoContainerTag(context.cwd) : undefined;
    const projectName = request.scope === 'project' ? getProjectName(context.cwd) : undefined;
    const type = request.type ?? inferMemoryType(
      request.content,
      request.scope === 'project' ? 'architecture-note' : 'manual',
    );

    return this.store.save({
      content: request.content,
      scope: request.scope,
      projectId,
      projectName,
      type,
      tags: request.tags,
    });
  }

  saveFileSnapshot(
    content: string,
    relPath: string,
    languageId: string,
    context: WorkspaceMemoryContext,
  ): SaveMemoryResult {
    // Snapshot strategy stores raw file content verbatim, so unlike the
    // selective/insight path it can't just skip a line that looks like a
    // secret - redact it instead, since the caller (auto-ingest on save)
    // has no other chance to catch it before this becomes a stored memory.
    const { text: safeContent, redactedCount } = redactSecrets(content);
    if (redactedCount > 0) {
      debugLog('Redacted likely secret(s) from file snapshot before saving', { relPath, redactedCount });
    }

    return this.store.save({
      content: [
        `File updated: ${relPath}`,
        `Language: ${languageId}`,
        'Snapshot:',
        safeContent,
      ].join('\n'),
      scope: 'project',
      projectId: getRepoContainerTag(context.cwd),
      projectName: getProjectName(context.cwd),
      type: 'file-snapshot',
      tags: redactedCount > 0
        ? ['auto-ingest', 'file-save', relPath, 'secrets-redacted']
        : ['auto-ingest', 'file-save', relPath],
    });
  }

  saveProjectInsight(
    content: string,
    type: MemoryType,
    tags: string[],
    context: WorkspaceMemoryContext,
  ): SaveMemoryResult {
    return this.store.save({
      content,
      scope: 'project',
      projectId: getRepoContainerTag(context.cwd),
      projectName: getProjectName(context.cwd),
      type,
      tags,
    });
  }
}
