export type Scope = 'global' | 'project';

export const MEMORY_TYPES = [
  'manual',
  'decision',
  'preference',
  'constraint',
  'bug-root-cause',
  'architecture-note',
  'command-snippet',
  'file-snapshot',
] as const;

export type MemoryType = typeof MEMORY_TYPES[number];

export interface Memory {
  id: string;
  content: string;
  scope: Scope;
  projectId: string | null;
  projectName: string | null;
  type: MemoryType;
  tags: string[];
  createdAt: string;
  updatedAt: string | null;
}

export interface MemoryInput {
  content: string;
  scope: Scope;
  projectId?: string;
  projectName?: string;
  type?: MemoryType;
  tags?: string[];
}

export interface SaveMemoryResult {
  memory: Memory;
  status: 'created' | 'updated';
}

export function normalizeMemoryContent(content: string): string {
  return content
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function inferMemoryType(content: string, fallback: MemoryType = 'manual'): MemoryType {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return fallback;

  if (/^(decision|we decided|decision:)/.test(normalized)) return 'decision';
  if (/^(prefer|preference|use |always use |default to )/.test(normalized)) return 'preference';
  if (/^(constraint|must |cannot |can't |limit |requirement)/.test(normalized)) return 'constraint';
  if (/^(root cause|bug|fix|incident|regression)/.test(normalized)) return 'bug-root-cause';
  if (/^(architecture|design|pattern|tradeoff|rationale)/.test(normalized)) return 'architecture-note';
  if (/^(command|run |npm |pnpm |yarn |make |cargo )/.test(normalized)) return 'command-snippet';

  return fallback;
}