import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { debugLog } from './settings';

const DEFAULT_STORAGE_DIR = path.join(os.homedir(), '.copilot-memory');

export interface Memory {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  createdAt: string;
}

export interface MemoryMetadata {
  type: 'manual' | 'project-knowledge';
  project?: string;
  tags?: string[];
}

export interface SearchResult {
  memory: Memory;
  score: number;
}

export class MemoryStore {
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
  }

  private getContainerDir(containerTag: string): string {
    const safe = containerTag.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storageDir, safe);
  }

  private getMemoriesFile(containerTag: string): string {
    return path.join(this.getContainerDir(containerTag), 'memories.jsonl');
  }

  private ensureDir(containerTag: string): void {
    const dir = this.getContainerDir(containerTag);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  add(content: string, containerTag: string, metadata: MemoryMetadata): Memory {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Memory content cannot be empty');
    }

    this.ensureDir(containerTag);

    const memory: Memory = {
      id: crypto.randomUUID(),
      content: trimmed,
      metadata,
      createdAt: new Date().toISOString(),
    };

    const file = this.getMemoriesFile(containerTag);
    fs.appendFileSync(file, JSON.stringify(memory) + '\n');

    debugLog('Memory saved', { id: memory.id, containerTag });
    return memory;
  }

  getAll(containerTag: string): Memory[] {
    const file = this.getMemoriesFile(containerTag);
    if (!fs.existsSync(file)) return [];

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.trim().split('\n');
    const memories: Memory[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        memories.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    return memories;
  }

  search(query: string, containerTag: string, limit = 10): SearchResult[] {
    const memories = this.getAll(containerTag);
    if (memories.length === 0 || !query.trim()) return [];

    const queryTokens = tokenize(query);
    const scored: SearchResult[] = [];

    for (const memory of memories) {
      const score = scoreMemory(memory, queryTokens);
      if (score > 0.05) {
        scored.push({ memory, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  delete(id: string, containerTag: string): boolean {
    const memories = this.getAll(containerTag);
    const filtered = memories.filter((m) => m.id !== id);
    if (filtered.length === memories.length) return false;
    this.writeAll(containerTag, filtered);
    debugLog('Memory deleted', { id, containerTag });
    return true;
  }

  clear(containerTag: string): number {
    const memories = this.getAll(containerTag);
    const count = memories.length;
    const file = this.getMemoriesFile(containerTag);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    debugLog('Container cleared', { containerTag, count });
    return count;
  }

  private writeAll(containerTag: string, memories: Memory[]): void {
    this.ensureDir(containerTag);
    const file = this.getMemoriesFile(containerTag);
    const content = memories.map((m) => JSON.stringify(m)).join('\n') + '\n';
    fs.writeFileSync(file, content);
  }
}

// --- Search scoring ---

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreMemory(memory: Memory, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const contentLower = memory.content.toLowerCase();
  const contentTokens = new Set(tokenize(memory.content));

  let matchCount = 0;
  let substringCount = 0;

  for (const token of queryTokens) {
    // Exact word match
    if (contentTokens.has(token)) {
      matchCount += 1;
    }
    // Substring match (partial)
    if (contentLower.includes(token)) {
      substringCount += 1;
    }
  }

  const wordScore = matchCount / queryTokens.length;
  const substringScore = substringCount / queryTokens.length;
  const termScore = wordScore * 0.6 + substringScore * 0.4;

  // Recency boost: exponential decay with ~10 day half-life
  const ageMs = Date.now() - new Date(memory.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyScore = Math.exp(-ageDays / 14);

  // Project match boost
  const projectBonus = memory.metadata.project
    ? queryTokens.some((t) => memory.metadata.project!.toLowerCase().includes(t))
      ? 0.1
      : 0
    : 0;

  return termScore * 0.65 + recencyScore * 0.25 + projectBonus + 0.1 * (termScore > 0 ? 1 : 0);
}
