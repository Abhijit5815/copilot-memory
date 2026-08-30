type VsCodeModule = typeof import('vscode');

let vscode: VsCodeModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  vscode = require('vscode') as VsCodeModule;
} catch {
  vscode = null;
}

export type SearchMode = 'sparse' | 'hybrid-cloud' | 'auto';
export type AutoIngestStrategy = 'selective' | 'snapshot';

export interface Settings {
  maxContextItems: number;
  storageDir: string;
  /** @deprecated legacy plain-text fallback; prefer the "Set Project Memory Key" command (SecretStorage). */
  projectMemoryKey: string;
  debug: boolean;
  autoIngestOnSave: boolean;
  autoIngestStrategy: AutoIngestStrategy;
  autoIngestMaxChars: number;
  autoIngestMaxInsights: number;
  autoIngestIgnoreGlobs: string[];
  defaultSaveScope: 'global' | 'project';
  searchMode: SearchMode;
  embeddingProvider: string;
  /** @deprecated legacy plain-text fallback; prefer the "Set Embedding API Key" command (SecretStorage). */
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingBaseUrl: string;
}

// Files that commonly hold live credentials. Editing/saving one of these
// never triggers auto-ingest, regardless of strategy, so secrets in them
// can't end up copied into a memory (and, for project scope, into git).
const SECRET_FILE_IGNORE_GLOBS = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/*.crt',
  '**/secrets.*',
  '**/credentials.*',
];

const DEFAULT_SETTINGS: Settings = {
  maxContextItems: 5,
  storageDir: '',
  projectMemoryKey: process.env.MEMORY_BOOK_KEY || process.env.COPILOT_MEMORY_KEY || '',
  debug: false,
  autoIngestOnSave: true,
  autoIngestStrategy: 'selective',
  autoIngestMaxChars: 2000,
  autoIngestMaxInsights: 3,
  autoIngestIgnoreGlobs: [
    '**/node_modules/**',
    '**/.git/**',
    '**/out/**',
    '**/dist/**',
    '**/*.lock',
    ...SECRET_FILE_IGNORE_GLOBS,
  ],
  defaultSaveScope: 'project',
  searchMode: 'auto',
  embeddingProvider: 'none',
  embeddingApiKey: '',
  embeddingModel: '',
  embeddingDimensions: 0,
  embeddingBaseUrl: '',
};

export function getSettings(): Settings {
  if (!vscode) {
    return DEFAULT_SETTINGS;
  }

  const config = vscode.workspace.getConfiguration('memoryBook');
  return {
    maxContextItems: config.get<number>('maxContextItems', DEFAULT_SETTINGS.maxContextItems),
    storageDir: config.get<string>('storageDir', DEFAULT_SETTINGS.storageDir),
    projectMemoryKey: config.get<string>('projectMemoryKey', process.env.MEMORY_BOOK_KEY || process.env.COPILOT_MEMORY_KEY || DEFAULT_SETTINGS.projectMemoryKey),
    debug: config.get<boolean>('debug', DEFAULT_SETTINGS.debug),
    autoIngestOnSave: config.get<boolean>('autoIngestOnSave', DEFAULT_SETTINGS.autoIngestOnSave),
    autoIngestStrategy: config.get<AutoIngestStrategy>('autoIngestStrategy', DEFAULT_SETTINGS.autoIngestStrategy),
    autoIngestMaxChars: config.get<number>('autoIngestMaxChars', DEFAULT_SETTINGS.autoIngestMaxChars),
    autoIngestMaxInsights: config.get<number>('autoIngestMaxInsights', DEFAULT_SETTINGS.autoIngestMaxInsights),
    autoIngestIgnoreGlobs: config.get<string[]>('autoIngestIgnoreGlobs', DEFAULT_SETTINGS.autoIngestIgnoreGlobs),
    defaultSaveScope: config.get<'global' | 'project'>('defaultSaveScope', DEFAULT_SETTINGS.defaultSaveScope),
    searchMode: config.get<SearchMode>('searchMode', DEFAULT_SETTINGS.searchMode),
    embeddingProvider: config.get<string>('embeddingProvider', DEFAULT_SETTINGS.embeddingProvider),
    embeddingApiKey: config.get<string>('embeddingApiKey', DEFAULT_SETTINGS.embeddingApiKey),
    embeddingModel: config.get<string>('embeddingModel', DEFAULT_SETTINGS.embeddingModel),
    embeddingDimensions: config.get<number>('embeddingDimensions', DEFAULT_SETTINGS.embeddingDimensions),
    embeddingBaseUrl: config.get<string>('embeddingBaseUrl', DEFAULT_SETTINGS.embeddingBaseUrl),
  };
}

type OutputChannelLike = {
  appendLine: (line: string) => void;
  dispose: () => void;
};

let outputChannel: OutputChannelLike | null = null;

export function getOutputChannel(): OutputChannelLike {
  if (!vscode) {
    if (!outputChannel) {
      outputChannel = {
        appendLine: () => undefined,
        dispose: () => undefined,
      };
    }
    return outputChannel;
  }

  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Memory Book');
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
