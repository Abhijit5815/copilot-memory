import * as vscode from 'vscode';

export interface Settings {
  maxContextItems: number;
  storageDir: string;
  debug: boolean;
  autoIngestOnSave: boolean;
  autoIngestMaxChars: number;
  autoIngestIgnoreGlobs: string[];
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
