import * as vscode from 'vscode';
import { MemoryStore, Memory } from './lib/memory-store';
import { getSettings, getOutputChannel, debugLog } from './lib/settings';
import {
  getPersonalContainerTag,
  getRepoContainerTag,
  getProjectName,
} from './lib/container-tag';

export function activate(context: vscode.ExtensionContext) {
  const settings = getSettings();
  const store = new MemoryStore(settings.storageDir || undefined);

  // --- Language Model Tools (Copilot calls these in any conversation) ---

  context.subscriptions.push(
    vscode.lm.registerTool('copilot-memory_save', new SaveMemoryTool(store)),
    vscode.lm.registerTool('copilot-memory_search', new SearchMemoryTool(store)),
    vscode.lm.registerTool('copilot-memory_list', new ListMemoriesTool(store)),
    vscode.lm.registerTool('copilot-memory_delete', new DeleteMemoryTool(store)),
    vscode.lm.registerTool('copilot-memory_refresh', new RefreshMemoryTool(store)),
  );

  setupAutoIngestOnSave(context, store);

  // --- Command Palette ---

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.saveSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage('No active editor.');

      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) return vscode.window.showWarningMessage('No text selected.');

      const cwd = getWorkspaceCwd();
      store.add(selection, getPersonalContainerTag(cwd), {
        type: 'manual',
        project: getProjectName(cwd),
      });
      vscode.window.showInformationMessage(`Memory saved (${getProjectName(cwd)})`);
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
      const results = [
        ...store.search(query, getPersonalContainerTag(cwd), 5),
        ...store.search(query, getRepoContainerTag(cwd), 5),
      ];

      const content = results.length
        ? results.map(r => `- ${r.memory.content} _(${new Date(r.memory.createdAt).toLocaleDateString()})_`).join('\n')
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
      const personal = store.getAll(getPersonalContainerTag(cwd));
      const repo = store.getAll(getRepoContainerTag(cwd));

      const format = (m: Memory) =>
        `- **[${m.metadata.type}]** ${m.content} _(${new Date(m.createdAt).toLocaleDateString()}, ${m.metadata.project || 'unknown'})_`;

      const lines = [
        `# All Memories — ${getProjectName(cwd)}`,
        `\n## Personal (${personal.length})`,
        ...personal.map(format),
        `\n## Project (${repo.length})`,
        ...repo.map(format),
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
        'Clear Personal', 'Clear Project', 'Clear Both',
      );
      if (!choice) return;

      const cwd = getWorkspaceCwd();
      let cleared = 0;
      if (choice !== 'Clear Project') cleared += store.clear(getPersonalContainerTag(cwd));
      if (choice !== 'Clear Personal') cleared += store.clear(getRepoContainerTag(cwd));
      vscode.window.showInformationMessage(`Cleared ${cleared} memories.`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.refresh', async () => {
      const cwd = getWorkspaceCwd();
      const personalFingerprint = store.getFingerprint(getPersonalContainerTag(cwd));
      const projectFingerprint = store.getFingerprint(getRepoContainerTag(cwd));
      const message = `Memory refreshed. personal=${personalFingerprint.version} project=${projectFingerprint.version}`;
      debugLog('Manual memory refresh', { personalFingerprint, projectFingerprint });
      vscode.window.showInformationMessage(message);
    }),
  );

  context.subscriptions.push(getOutputChannel());
}

export function deactivate() {}

function getWorkspaceCwd(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
}

function setupAutoIngestOnSave(context: vscode.ExtensionContext, store: MemoryStore): void {
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
      if (lastHashesByFile.get(key) === contentHash) {
        return;
      }
      lastHashesByFile.set(key, contentHash);

      const cwd = workspaceFolder.uri.fsPath;
      const projectName = getProjectName(cwd);
      const memoryContent = [
        `File updated: ${relPath}`,
        `Language: ${document.languageId}`,
        'Snapshot:',
        snippet,
      ].join('\n');

      store.add(memoryContent, getRepoContainerTag(cwd), {
        type: 'project-knowledge',
        project: projectName,
        tags: ['auto-ingest', 'file-save', relPath],
      });

      debugLog('Auto-ingested saved file', { relPath, chars: snippet.length, projectName });
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

interface SaveInput { content: string; scope?: 'personal' | 'project' }

class SaveMemoryTool implements vscode.LanguageModelTool<SaveInput> {
  constructor(private store: MemoryStore) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SaveInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { content, scope = 'personal' } = options.input;
    const cwd = getWorkspaceCwd();
    const projectName = getProjectName(cwd);
    const containerTag = scope === 'project'
      ? getRepoContainerTag(cwd)
      : getPersonalContainerTag(cwd);
    const type = scope === 'project' ? 'project-knowledge' as const : 'manual' as const;

    const memory = this.store.add(content, containerTag, { type, project: projectName });
    const fingerprint = this.store.getFingerprint(containerTag);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        JSON.stringify({
          saved: true,
          id: memory.id,
          scope,
          project: projectName,
          memoryVersion: fingerprint.version,
          memoryHash: fingerprint.hash,
        }),
      ),
    ]);
  }
}

interface SearchInput { query: string }

class SearchMemoryTool implements vscode.LanguageModelTool<SearchInput> {
  constructor(private store: MemoryStore) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SearchInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { query } = options.input;
    const cwd = getWorkspaceCwd();
    const limit = getSettings().maxContextItems;

    const personal = this.store.search(query, getPersonalContainerTag(cwd), limit);
    const project = this.store.search(query, getRepoContainerTag(cwd), limit);
    const personalFingerprint = this.store.getFingerprint(getPersonalContainerTag(cwd));
    const projectFingerprint = this.store.getFingerprint(getRepoContainerTag(cwd));

    const results = [
      ...personal.map(r => ({ ...r.memory, scope: 'personal', score: r.score })),
      ...project.map(r => ({ ...r.memory, scope: 'project', score: r.score })),
    ];

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({
        results,
        fingerprints: {
          personal: personalFingerprint,
          project: projectFingerprint,
        },
      })),
    ]);
  }
}

interface ListInput { scope?: 'personal' | 'project' }

class ListMemoriesTool implements vscode.LanguageModelTool<ListInput> {
  constructor(private store: MemoryStore) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { scope } = options.input;
    const cwd = getWorkspaceCwd();
    const personalContainer = getPersonalContainerTag(cwd);
    const projectContainer = getRepoContainerTag(cwd);

    const results: (Memory & { scope: string })[] = [];
    if (!scope || scope === 'personal') {
      for (const m of this.store.getAll(personalContainer)) {
        results.push({ ...m, scope: 'personal' });
      }
    }
    if (!scope || scope === 'project') {
      for (const m of this.store.getAll(projectContainer)) {
        results.push({ ...m, scope: 'project' });
      }
    }

    const fingerprints = {
      personal: this.store.getFingerprint(personalContainer),
      project: this.store.getFingerprint(projectContainer),
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ results, fingerprints })),
    ]);
  }
}

interface DeleteInput { id: string }

class DeleteMemoryTool implements vscode.LanguageModelTool<DeleteInput> {
  constructor(private store: MemoryStore) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DeleteInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { id } = options.input;
    const cwd = getWorkspaceCwd();

    const deleted =
      this.store.delete(id, getPersonalContainerTag(cwd)) ||
      this.store.delete(id, getRepoContainerTag(cwd));

    const fingerprints = {
      personal: this.store.getFingerprint(getPersonalContainerTag(cwd)),
      project: this.store.getFingerprint(getRepoContainerTag(cwd)),
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ deleted, id, fingerprints })),
    ]);
  }
}

class RefreshMemoryTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private store: MemoryStore) {}

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const cwd = getWorkspaceCwd();
    const personalContainer = getPersonalContainerTag(cwd);
    const projectContainer = getRepoContainerTag(cwd);
    const refreshedAt = new Date().toISOString();

    const fingerprints = {
      personal: this.store.getFingerprint(personalContainer),
      project: this.store.getFingerprint(projectContainer),
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ refreshed: true, refreshedAt, fingerprints })),
    ]);
  }
}
