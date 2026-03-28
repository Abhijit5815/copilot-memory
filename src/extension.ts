import * as vscode from 'vscode';
import { MemoryStore } from './lib/memory-store';
import { getSettings, debugLog, getOutputChannel } from './lib/settings';
import {
  getPersonalContainerTag,
  getRepoContainerTag,
  getProjectName,
} from './lib/container-tag';
import { formatContextBlock, formatMemoryDetail } from './lib/format-context';
import { registerParticipant } from './participant';

export function activate(context: vscode.ExtensionContext) {
  const settings = getSettings();
  const store = new MemoryStore(settings.storageDir || undefined);

  debugLog('Extension activated');

  // Chat participant
  registerParticipant(context, store);

  // Command: save selected text as memory
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.saveSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return;
      }

      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) {
        vscode.window.showWarningMessage('No text selected.');
        return;
      }

      const cwd = getWorkspaceCwd();
      const containerTag = getPersonalContainerTag(cwd);
      const projectName = getProjectName(cwd);

      store.add(selection, containerTag, {
        type: 'manual',
        project: projectName,
      });

      vscode.window.showInformationMessage(
        `Memory saved to project: ${projectName}`,
      );
    }),
  );

  // Command: search memories via input box
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search your memories',
        placeHolder: 'e.g., auth flow, bug fix, architecture',
      });

      if (!query) return;

      const cwd = getWorkspaceCwd();
      const personalTag = getPersonalContainerTag(cwd);
      const repoTag = getRepoContainerTag(cwd);

      const personalResults = store.search(query, personalTag, 5);
      const repoResults = store.search(query, repoTag, 5);

      const content = formatContextBlock(personalResults, repoResults);

      const doc = await vscode.workspace.openTextDocument({
        content: `# Memory Search: "${query}"\n\n${content}`,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
  );

  // Command: show all memories
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.showAll', async () => {
      const cwd = getWorkspaceCwd();
      const personalTag = getPersonalContainerTag(cwd);
      const repoTag = getRepoContainerTag(cwd);

      const personal = store.getAll(personalTag);
      const repo = store.getAll(repoTag);

      const lines: string[] = [
        `# All Memories — ${getProjectName(cwd)}`,
        '',
        `## Personal (${personal.length})`,
        '',
      ];

      for (const m of personal) {
        lines.push(formatMemoryDetail(m), '');
      }

      lines.push(`## Project Knowledge (${repo.length})`, '');

      for (const m of repo) {
        lines.push(formatMemoryDetail(m), '');
      }

      const doc = await vscode.workspace.openTextDocument({
        content: lines.join('\n'),
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
  );

  // Command: clear all memories (with confirmation)
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-memory.clearAll', async () => {
      const choice = await vscode.window.showWarningMessage(
        'Clear all memories for this project?',
        { modal: true },
        'Clear Personal',
        'Clear Project',
        'Clear Both',
      );

      if (!choice) return;

      const cwd = getWorkspaceCwd();
      const personalTag = getPersonalContainerTag(cwd);
      const repoTag = getRepoContainerTag(cwd);

      let cleared = 0;
      if (choice === 'Clear Personal' || choice === 'Clear Both') {
        cleared += store.clear(personalTag);
      }
      if (choice === 'Clear Project' || choice === 'Clear Both') {
        cleared += store.clear(repoTag);
      }

      vscode.window.showInformationMessage(`Cleared ${cleared} memories.`);
    }),
  );

  // Register output channel for disposal
  context.subscriptions.push(getOutputChannel());
}

export function deactivate() {}

function getWorkspaceCwd(): string {
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri.fsPath || process.cwd();
}
