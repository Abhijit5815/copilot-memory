import * as vscode from 'vscode';
import { MemoryStore, Memory } from './lib/memory-store';
import { getSettings, getOutputChannel } from './lib/settings';
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
  );

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

  context.subscriptions.push(getOutputChannel());
}

export function deactivate() {}

function getWorkspaceCwd(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
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

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        JSON.stringify({ saved: true, id: memory.id, scope, project: projectName }),
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

    const results = [
      ...personal.map(r => ({ ...r.memory, scope: 'personal', score: r.score })),
      ...project.map(r => ({ ...r.memory, scope: 'project', score: r.score })),
    ];

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(results)),
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

    const results: (Memory & { scope: string })[] = [];
    if (!scope || scope === 'personal') {
      for (const m of this.store.getAll(getPersonalContainerTag(cwd))) {
        results.push({ ...m, scope: 'personal' });
      }
    }
    if (!scope || scope === 'project') {
      for (const m of this.store.getAll(getRepoContainerTag(cwd))) {
        results.push({ ...m, scope: 'project' });
      }
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(results)),
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

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ deleted, id })),
    ]);
  }
}
