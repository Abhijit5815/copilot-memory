import * as vscode from 'vscode';
import { MemoryStore, dedupeResults } from './lib/memory-store';
import {
  getPersonalContainerTag,
  getRepoContainerTag,
  getProjectName,
} from './lib/container-tag';
import { formatContextBlock, formatSearchResults } from './lib/format-context';
import { getSettings, debugLog } from './lib/settings';

const PARTICIPANT_ID = 'copilot-memory.memory';

export function registerParticipant(
  context: vscode.ExtensionContext,
  store: MemoryStore,
): void {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    (request, chatContext, stream, token) =>
      handleRequest(store, request, chatContext, stream, token),
  );

  participant.iconPath = new vscode.ThemeIcon('bookmark');
  context.subscriptions.push(participant);
}

async function handleRequest(
  store: MemoryStore,
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const cwd = getWorkspaceCwd();
  const personalTag = getPersonalContainerTag(cwd);
  const repoTag = getRepoContainerTag(cwd);
  const projectName = getProjectName(cwd);

  debugLog('Chat request', { command: request.command, prompt: request.prompt });

  switch (request.command) {
    case 'save':
      return handleSave(store, stream, request.prompt, personalTag, projectName);

    case 'search':
      return handleSearch(store, stream, request.prompt, personalTag, repoTag);

    case 'project-save':
      return handleProjectSave(store, stream, request.prompt, repoTag, projectName);

    case 'clear':
      return handleClear(store, stream, personalTag, repoTag);

    default:
      // No command: search and show context
      return handleContextSearch(store, stream, request.prompt, personalTag, repoTag);
  }
}

async function handleSave(
  store: MemoryStore,
  stream: vscode.ChatResponseStream,
  content: string,
  containerTag: string,
  projectName: string,
): Promise<vscode.ChatResult> {
  if (!content.trim()) {
    stream.markdown('Please provide content to save.\n\nExample: `@memory /save auth uses JWT tokens with 24h expiry`');
    return {};
  }

  stream.progress('Saving to personal memory...');
  const memory = store.add(content, containerTag, {
    type: 'manual',
    project: projectName,
  });

  stream.markdown(
    `**Saved to personal memory.**\n\n` +
    `- Project: ${projectName}\n` +
    `- ID: \`${memory.id}\`\n\n` +
    `Content:\n> ${content}`,
  );
  return {};
}

async function handleProjectSave(
  store: MemoryStore,
  stream: vscode.ChatResponseStream,
  content: string,
  containerTag: string,
  projectName: string,
): Promise<vscode.ChatResult> {
  if (!content.trim()) {
    stream.markdown(
      'Please provide project knowledge to save.\n\n' +
      'Example: `@memory /project-save auth flow uses OAuth2 with PKCE, tokens stored in httpOnly cookies`',
    );
    return {};
  }

  stream.progress('Saving to project knowledge...');
  const memory = store.add(content, containerTag, {
    type: 'project-knowledge',
    project: projectName,
  });

  stream.markdown(
    `**Saved to project knowledge** (shared across team).\n\n` +
    `- Project: ${projectName}\n` +
    `- ID: \`${memory.id}\`\n\n` +
    `Content:\n> ${content}`,
  );
  return {};
}

async function handleSearch(
  store: MemoryStore,
  stream: vscode.ChatResponseStream,
  query: string,
  personalTag: string,
  repoTag: string,
): Promise<vscode.ChatResult> {
  if (!query.trim()) {
    stream.markdown('Please provide a search query.\n\nExample: `@memory /search authentication flow`');
    return {};
  }

  stream.progress('Searching memories...');

  const personalResults = dedupeResults(store.search(query, personalTag, 5));
  const repoResults = dedupeResults(store.search(query, repoTag, 5));

  const output = formatContextBlock(personalResults, repoResults);
  stream.markdown(`## Search: "${query}"\n\n${output}`);
  return {};
}

async function handleClear(
  store: MemoryStore,
  stream: vscode.ChatResponseStream,
  personalTag: string,
  repoTag: string,
): Promise<vscode.ChatResult> {
  const personalCount = store.clear(personalTag);
  const repoCount = store.clear(repoTag);
  const total = personalCount + repoCount;

  stream.markdown(
    `**Cleared ${total} memories.**\n\n` +
    `- Personal: ${personalCount}\n` +
    `- Project: ${repoCount}`,
  );
  return {};
}

async function handleContextSearch(
  store: MemoryStore,
  stream: vscode.ChatResponseStream,
  prompt: string,
  personalTag: string,
  repoTag: string,
): Promise<vscode.ChatResult> {
  if (!prompt.trim()) {
    stream.markdown(
      '## Copilot Memory\n\n' +
      'Available commands:\n\n' +
      '- `/save <content>` — Save to personal memory\n' +
      '- `/search <query>` — Search past memories\n' +
      '- `/project-save <content>` — Save shared project knowledge\n' +
      '- `/clear` — Clear all memories\n\n' +
      'Or just type a question to search your memories automatically.',
    );
    return {};
  }

  stream.progress('Searching memories...');

  const settings = getSettings();
  const limit = settings.maxContextItems;

  const personalResults = dedupeResults(store.search(prompt, personalTag, limit));
  const repoResults = dedupeResults(store.search(prompt, repoTag, limit));

  if (personalResults.length === 0 && repoResults.length === 0) {
    stream.markdown(`No memories found matching "${prompt}".\n\nUse \`/save\` to start saving memories.`);
    return {};
  }

  const personal = formatSearchResults(personalResults, 'Personal Memories');
  const repo = formatSearchResults(repoResults, 'Project Knowledge');

  let output = `## Relevant Memories\n\n`;
  if (personal) output += personal + '\n\n';
  if (repo) output += repo + '\n\n';

  stream.markdown(output);
  return {};
}

function getWorkspaceCwd(): string {
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri.fsPath || process.cwd();
}
