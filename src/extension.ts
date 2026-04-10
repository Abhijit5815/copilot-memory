import * as vscode from 'vscode';
import { Memory, MemoryType } from './lib/memory-domain';
import { extractHighSignalInsights } from './lib/ingest-policy';
import { MemoryService } from './lib/memory-service';
import { SqliteMemoryStore } from './lib/sqlite-store';
import { SearchEngine } from './lib/search-engine';
import { createEmbeddingProvider } from './lib/embeddings';
import { getSettings, getOutputChannel, debugLog } from './lib/settings';
import { getRepoContainerTag, getProjectName } from './lib/container-tag';

export function activate(context: vscode.ExtensionContext) {
  const settings = getSettings();
  const store = new SqliteMemoryStore(settings.storageDir || undefined);

  const embeddingProvider = createEmbeddingProvider({
    provider: settings.embeddingProvider,
    apiKey: settings.embeddingApiKey || undefined,
    model: settings.embeddingModel || undefined,
    dimensions: settings.embeddingDimensions || undefined,
    baseUrl: settings.embeddingBaseUrl || undefined,
  });

  const searchEngine = new SearchEngine(store, embeddingProvider);
  const memoryService = new MemoryService(store);

  // --- Language Model Tools ---

  context.subscriptions.push(
    vscode.lm.registerTool('copilot-memory_save', new SaveMemoryTool(store, memoryService)),
    vscode.lm.registerTool('copilot-memory_search', new SearchMemoryTool(store, searchEngine)),
    vscode.lm.registerTool('copilot-memory_list', new ListMemoriesTool(store)),
    vscode.lm.registerTool('copilot-memory_delete', new DeleteMemoryTool(store)),
    vscode.lm.registerTool('copilot-memory_refresh', new RefreshMemoryTool(store)),
  );

  setupAutoIngestOnSave(context, memoryService);

  // --- Command Palette ---

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.saveSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage('No active editor.');

      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) return vscode.window.showWarningMessage('No text selected.');

      const cwd = getWorkspaceCwd();
      const scope = settings.defaultSaveScope;
      const result = memoryService.saveFromWorkspace({
        content: selection,
        scope,
        type: 'manual',
      }, { cwd });
      const verb = result.status === 'created' ? 'saved' : 'updated';
      vscode.window.showInformationMessage(`Memory ${verb} in ${scope} (${getProjectName(cwd)})`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search your memories',
        placeHolder: 'e.g., auth flow, bug fix',
      });
      if (!query) return;

      const cwd = getWorkspaceCwd();
      const projectId = getRepoContainerTag(cwd);
      const results = await searchEngine.search(query, {
        projectId,
        limit: 10,
        mode: settings.searchMode,
      });

      const content = results.length
        ? results.map(r =>
            `- [${r.memory.scope}|${r.source}] ${r.memory.content} _(${new Date(r.memory.createdAt).toLocaleDateString()}, score: ${r.score.toFixed(3)})_`,
          ).join('\n')
        : 'No memories found.';

      const doc = await vscode.workspace.openTextDocument({
        content: `# Search: "${query}"\n\n${content}`,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.showAll', async () => {
      const cwd = getWorkspaceCwd();
      const projectId = getRepoContainerTag(cwd);
      const globalMemories = store.getAll('global');
      const projectMemories = store.getAll('project', projectId);

      const format = (m: Memory) =>
        `- **[${m.type}]** ${m.content} _(${new Date(m.createdAt).toLocaleDateString()}, ${m.projectName || 'global'})_`;

      const lines = [
        `# All Memories — ${getProjectName(cwd)}`,
        `\n## Global (${globalMemories.length})`,
        ...globalMemories.map(format),
        `\n## Project (${projectMemories.length})`,
        ...projectMemories.map(format),
      ];

      const doc = await vscode.workspace.openTextDocument({
        content: lines.join('\n'),
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.clearAll', async () => {
      const choice = await vscode.window.showWarningMessage(
        'Clear all memories for this project?',
        { modal: true },
        'Clear Global', 'Clear Project', 'Clear Both',
      );
      if (!choice) return;

      const cwd = getWorkspaceCwd();
      const projectId = getRepoContainerTag(cwd);
      let cleared = 0;
      if (choice !== 'Clear Project') cleared += store.clear('global');
      if (choice !== 'Clear Global') cleared += store.clear('project', projectId);
      vscode.window.showInformationMessage(`Cleared ${cleared} memories.`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.refresh', async () => {
      const cwd = getWorkspaceCwd();
      const projectId = getRepoContainerTag(cwd);
      const globalFp = store.getFingerprint('global');
      const projectFp = store.getFingerprint('project', projectId);
      const message = `Memory refreshed. global: ${globalFp.count} items, project: ${projectFp.count} items`;
      debugLog('Manual memory refresh', { globalFp, projectFp });
      vscode.window.showInformationMessage(message);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.backfillVectors', async () => {
      try {
        const count = await searchEngine.backfillVectors();
        vscode.window.showInformationMessage(`Backfilled ${count} memory vectors.`);
      } catch (e) {
        vscode.window.showErrorMessage(`Vector backfill failed: ${e}`);
      }
    }),
  );

  context.subscriptions.push(getOutputChannel());
  context.subscriptions.push({ dispose: () => store.close() });
}

export function deactivate() {}

function getWorkspaceCwd(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
}

function setupAutoIngestOnSave(context: vscode.ExtensionContext, memoryService: MemoryService): void {
  const lastHashesByFile = new Map<string, string>();

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const settings = getSettings();
      if (!settings.autoIngestOnSave) return;
      if (document.uri.scheme !== 'file') return;
      if (document.isUntitled) return;
      if (document.lineCount === 0) return;

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) return;

      const relPath = vscode.workspace.asRelativePath(document.uri, false).replace(/\\/g, '/');
      if (shouldIgnorePath(relPath, settings.autoIngestIgnoreGlobs)) return;

      const text = document.getText().trim();
      if (!text) return;

      const snippet = text.slice(0, Math.max(1, settings.autoIngestMaxChars));
      const contentHash = stableHash(snippet);
      const key = document.uri.fsPath;
      if (lastHashesByFile.get(key) === contentHash) return;
      lastHashesByFile.set(key, contentHash);

      const cwd = workspaceFolder.uri.fsPath;
      if (settings.autoIngestStrategy === 'snapshot') {
        const result = memoryService.saveFileSnapshot(snippet, relPath, document.languageId, { cwd });

        debugLog('Auto-ingested saved file snapshot', {
          relPath,
          chars: snippet.length,
          projectName: getProjectName(cwd),
          status: result.status,
        });
        return;
      }

      const insights = extractHighSignalInsights(
        snippet,
        settings.autoIngestMaxChars,
        settings.autoIngestMaxInsights,
      );

      if (insights.length === 0) {
        debugLog('Auto-ingest skipped: no high-signal insights', { relPath });
        return;
      }

      let created = 0;
      let updated = 0;

      for (const insight of insights) {
        const result = memoryService.saveProjectInsight(
          [
            `File: ${relPath}`,
            `Language: ${document.languageId}`,
            `Insight: ${insight.text}`,
          ].join('\n'),
          insight.type,
          ['auto-ingest', 'selective', relPath, ...insight.tags],
          { cwd },
        );

        if (result.status === 'created') created += 1;
        else updated += 1;
      }

      debugLog('Auto-ingested high-signal insights', {
        relPath,
        insights: insights.length,
        created,
        updated,
        projectName: getProjectName(cwd),
      });
    }),
  );
}

function shouldIgnorePath(relPath: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(relPath));
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

function stableHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

// --- Language Model Tool implementations ---

interface SaveInput {
  content: string;
  scope?: 'global' | 'project';
  type?: MemoryType;
}

class SaveMemoryTool implements vscode.LanguageModelTool<SaveInput> {
  constructor(
    private store: SqliteMemoryStore,
    private memoryService: MemoryService,
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SaveInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const settings = getSettings();
    const { content, scope = settings.defaultSaveScope, type } = options.input;
    const cwd = getWorkspaceCwd();
    const projectId = getRepoContainerTag(cwd);
    const projectName = getProjectName(cwd);

    const result = this.memoryService.saveFromWorkspace({
      content,
      scope,
      type,
    }, { cwd });

    const fingerprint = this.store.getFingerprint(
      scope,
      scope === 'project' ? projectId : undefined,
    );

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        JSON.stringify({
          saved: true,
          status: result.status,
          id: result.memory.id,
          scope,
          project: projectName,
          type: result.memory.type,
          memoryVersion: fingerprint.version,
          memoryHash: fingerprint.hash,
        }),
      ),
    ]);
  }
}

interface SearchInput { query: string }

class SearchMemoryTool implements vscode.LanguageModelTool<SearchInput> {
  constructor(
    private store: SqliteMemoryStore,
    private searchEngine: SearchEngine,
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SearchInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { query } = options.input;
    const cwd = getWorkspaceCwd();
    const settings = getSettings();
    const projectId = getRepoContainerTag(cwd);

    const results = await this.searchEngine.search(query, {
      projectId,
      limit: settings.maxContextItems,
      mode: settings.searchMode,
    });

    const globalFp = this.store.getFingerprint('global');
    const projectFp = this.store.getFingerprint('project', projectId);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({
        results: results.map(r => ({
          ...r.memory,
          score: r.score,
          source: r.source,
        })),
        fingerprints: { global: globalFp, project: projectFp },
      })),
    ]);
  }
}

interface ListInput { scope?: 'global' | 'project' }

class ListMemoriesTool implements vscode.LanguageModelTool<ListInput> {
  constructor(private store: SqliteMemoryStore) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { scope } = options.input;
    const cwd = getWorkspaceCwd();
    const projectId = getRepoContainerTag(cwd);

    const results: Memory[] = [];
    if (!scope || scope === 'global') {
      results.push(...this.store.getAll('global'));
    }
    if (!scope || scope === 'project') {
      results.push(...this.store.getAll('project', projectId));
    }

    const fingerprints = {
      global: this.store.getFingerprint('global'),
      project: this.store.getFingerprint('project', projectId),
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ results, fingerprints })),
    ]);
  }
}

interface DeleteInput { id: string }

class DeleteMemoryTool implements vscode.LanguageModelTool<DeleteInput> {
  constructor(private store: SqliteMemoryStore) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DeleteInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { id } = options.input;
    const cwd = getWorkspaceCwd();
    const projectId = getRepoContainerTag(cwd);

    const deleted = this.store.delete(id);

    const fingerprints = {
      global: this.store.getFingerprint('global'),
      project: this.store.getFingerprint('project', projectId),
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ deleted, id, fingerprints })),
    ]);
  }
}

class RefreshMemoryTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private store: SqliteMemoryStore) {}

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const cwd = getWorkspaceCwd();
    const projectId = getRepoContainerTag(cwd);
    const refreshedAt = new Date().toISOString();

    const fingerprints = {
      global: this.store.getFingerprint('global'),
      project: this.store.getFingerprint('project', projectId),
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        JSON.stringify({ refreshed: true, refreshedAt, fingerprints }),
      ),
    ]);
  }
}
