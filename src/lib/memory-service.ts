import { getProjectName, getRepoContainerTag } from './container-tag';
import {
  inferMemoryType,
  MemoryType,
  SaveMemoryResult,
  Scope,
} from './memory-domain';
import { SqliteMemoryStore } from './sqlite-store';

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
  constructor(private store: SqliteMemoryStore) {}

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
    return this.store.save({
      content: [
        `File updated: ${relPath}`,
        `Language: ${languageId}`,
        'Snapshot:',
        content,
      ].join('\n'),
      scope: 'project',
      projectId: getRepoContainerTag(context.cwd),
      projectName: getProjectName(context.cwd),
      type: 'file-snapshot',
      tags: ['auto-ingest', 'file-save', relPath],
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