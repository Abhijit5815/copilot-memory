import * as vscode from 'vscode';

export type SearchMode = 'sparse' | 'hybrid-cloud' | 'hybrid-local' | 'auto';

export interface Settings {
  maxContextItems: number;
  storageDir: string;
  debug: boolean;
  autoIngestOnSave: boolean;
  autoIngestMaxChars: number;
  autoIngestIgnoreGlobs: string[];
  defaultSaveScope: 'global' | 'project';
  searchMode: SearchMode;
  embeddingProvider: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingBaseUrl: string;
}

export function getSettings(): Settings {
  const config = vscode.workspace.getConfiguration('copilotMemory');
  return {
    maxContextItems: config.get<number>('maxContextItems', 5),
    storageDir: config.get<string>('storageDir', ''),
    debug: config.get<boolean>('debug', false),
    autoIngestOnSave: config.get<boolean>('autoIngestOnSave', true),
    autoIngestMaxChars: config.get<number>('autoIngestMaxChars', 2000),
    autoIngestIgnoreGlobs: config.get<string[]>(
      'autoIngestIgnoreGlobs',
      ['**/node_modules/**', '**/.git/**', '**/out/**', '**/dist/**', '**/*.lock'],
    ),
    defaultSaveScope: config.get<'global' | 'project'>('defaultSaveScope', 'project'),
    searchMode: config.get<SearchMode>('searchMode', 'auto'),
    embeddingProvider: config.get<string>('embeddingProvider', 'none'),
    embeddingApiKey: config.get<string>('embeddingApiKey', ''),
    embeddingModel: config.get<string>('embeddingModel', ''),
    embeddingDimensions: config.get<number>('embeddingDimensions', 0),
    embeddingBaseUrl: config.get<string>('embeddingBaseUrl', ''),
  };
}

let outputChannel: vscode.OutputChannel | null = null;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Copilot Memory');
  }
  return outputChannel;
}

export function debugLog(message: string, data?: unknown): void {
  const settings = getSettings();
  if (!settings.debug) return;

  const channel = getOutputChannel();
  const timestamp = new Date().toISOString();
  const line = data
    ? `[${timestamp}] ${message}: ${JSON.stringify(data)}`
    : `[${timestamp}] ${message}`;
  channel.appendLine(line);
}
