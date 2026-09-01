import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  Memory,
  MemoryInput,
  MemoryType,
  normalizeMemoryContent,
  SaveMemoryResult,
  Scope,
} from './memory-domain';
import { debugLog } from './settings';

const DEFAULT_STORAGE_DIR = path.join(os.homedir(), '.memory-book');
const STORE_FILENAME = 'memory-store.json';
const PROJECT_STORE_FILENAME = 'project-memory.enc.json';
const LEGACY_DB_FILENAME = 'memory.db';
const MAX_CONTENT_LENGTH = 50_000;
const LOCK_TIMEOUT_MS = 1000;
const LOCK_SPIN_MS = 2;

export interface FtsResult {
  memory: Memory;
  rank: number;
}

export interface VectorResult {
  memory: Memory;
  similarity: number;
}

export interface StoreFingerprint {
  version: string;
  hash: string;
  count: number;
  updatedAt: string | null;
}

export class MemoryStore {
  private storageDir: string;
  private storePath: string;
  private projectStorePath: string | null;
  private projectMemoryKey: string | null;
  private state: PersistedStore;
  private globalMtimeMs = 0;
  private projectMtimeMs = 0;

  constructor(storageDir?: string, projectRoot?: string, projectMemoryKey?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // No hardcoded fallback key here: project-scoped memory is encrypted and
    // intended to be committed to git, so an extension that silently encrypted
    // with a known default key would make that encryption purely cosmetic.
    // Callers (see extension.ts / lib/secrets.ts) resolve a real key - either an
    // explicit team-shared secret or a randomly generated local one - before
    // constructing a store with a projectRoot.
    this.projectMemoryKey = projectMemoryKey || process.env.MEMORY_BOOK_KEY || process.env.COPILOT_MEMORY_KEY || null;

    const repoMemoryDir = projectRoot ? path.join(projectRoot, '.memory-book') : null;
    this.projectStorePath = repoMemoryDir ? path.join(repoMemoryDir, PROJECT_STORE_FILENAME) : null;
    if (this.projectStorePath && !fs.existsSync(path.dirname(this.projectStorePath))) {
      fs.mkdirSync(path.dirname(this.projectStorePath), { recursive: true });
    }

    this.storePath = path.join(this.storageDir, STORE_FILENAME);
    this.state = this.loadState();
    this.globalMtimeMs = fileMtimeMs(this.storePath);
    this.projectMtimeMs = this.projectStorePath ? fileMtimeMs(this.projectStorePath) : 0;
  }

  private loadState(): PersistedStore {
    const globalState = this.loadScopeState(this.storePath, 'global', false);
    const projectState = this.projectStorePath ? this.loadScopeState(this.projectStorePath, 'project', true) : createEmptyState();
    return mergeStates(globalState, projectState);
  }

  private loadScopeState(filePath: string, scope: Scope, encrypted: boolean): PersistedStore {
    if (!fs.existsSync(filePath)) {
      if (scope === 'global') {
        const legacyDbPath = path.join(this.storageDir, LEGACY_DB_FILENAME);
        if (fs.existsSync(legacyDbPath)) {
          debugLog('Legacy SQLite database detected; starting with portable store file', {
            legacyDbPath,
            storePath: filePath,
          });
        }
      }
      return createEmptyState();
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed: Partial<PersistedStore>;
    try {
      parsed = encrypted ? decryptPersistedStore(raw, this.getProjectMemoryKey()) : (JSON.parse(raw) as Partial<PersistedStore>);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Memory Book: failed to load ${scope} memory from ${filePath} (${reason}). ` +
        (encrypted
          ? 'This usually means memoryBook.projectMemoryKey does not match the key the file was encrypted with, or the file is corrupted.'
          : 'The file may be corrupted.'),
      );
    }

    const memories = Array.isArray(parsed.memories)
      ? parsed.memories.map(normalizePersistedMemory)
      : [];
    const vectors = normalizePersistedVectors(parsed.vectors);

    return {
      version: 1,
      memories,
      vectors,
    };
  }

  /**
   * Re-reads on-disk state only if a file changed since we last saw it (e.g.
   * another VS Code window sharing the same store just wrote to it). Cheap
   * no-op in the common case where nothing changed underneath us.
   */
  private reloadIfChanged(): void {
    const globalChanged = fileMtimeMs(this.storePath) !== this.globalMtimeMs;
    const projectChanged = this.projectStorePath ? fileMtimeMs(this.projectStorePath) !== this.projectMtimeMs : false;
    if (!globalChanged && !projectChanged) return;

    this.state = this.loadState();
    this.globalMtimeMs = fileMtimeMs(this.storePath);
    this.projectMtimeMs = this.projectStorePath ? fileMtimeMs(this.projectStorePath) : 0;
  }

  private persist(): void {
    const globalState = this.filterStateByScope('global');
    const projectState = this.filterStateByScope('project');

    const tempGlobalPath = `${this.storePath}.tmp`;
    fs.writeFileSync(tempGlobalPath, `${JSON.stringify(globalState, null, 2)}\n`, 'utf8');
    fs.renameSync(tempGlobalPath, this.storePath);
    this.globalMtimeMs = fileMtimeMs(this.storePath);

    if (this.projectStorePath) {
      const key = this.getProjectMemoryKey();
      const projectOutput = encryptPersistedStore(projectState, key);
      const tempProjectPath = `${this.projectStorePath}.tmp`;
      fs.writeFileSync(tempProjectPath, `${projectOutput}\n`, 'utf8');
      fs.renameSync(tempProjectPath, this.projectStorePath);
      this.projectMtimeMs = fileMtimeMs(this.projectStorePath);
    }
  }

  private getProjectMemoryKey(): string {
    if (!this.projectMemoryKey) {
      throw new Error(
        'Memory Book: project memory encryption key is missing. Set memoryBook.projectMemoryKey, ' +
        'the MEMORY_BOOK_KEY environment variable, or run "Memory Book: Set Project Memory Key".',
      );
    }
    return this.projectMemoryKey;
  }

  private filterStateByScope(scope: Scope): PersistedStore {
    const memories = this.state.memories.filter((memory) => memory.scope === scope);
    const memoryIds = new Set(memories.map((memory) => memory.id));
    const vectors: PersistedStore['vectors'] = {};

    for (const [memoryId, vector] of Object.entries(this.state.vectors)) {
      if (memoryIds.has(memoryId)) {
        vectors[memoryId] = vector;
      }
    }

    return {
      version: 1,
      memories,
      vectors,
    };
  }

  /**
   * Serializes mutating operations across processes (e.g. two VS Code windows
   * sharing the same store) using a simple exclusive lockfile, and reloads any
   * on-disk changes made by another process before applying the mutation - so a
   * save/delete from one window can never silently clobber one from another.
   */
  private withLock<T>(fn: () => T): T {
    const lockPath = `${this.storePath}.lock`;
    const fd = acquireLockSync(lockPath, LOCK_TIMEOUT_MS, LOCK_SPIN_MS);
    try {
      this.reloadIfChanged();
      return fn();
    } finally {
      try { fs.closeSync(fd); } catch { /* already closed */ }
      try { fs.unlinkSync(lockPath); } catch { /* already removed */ }
    }
  }

  // --- CRUD ---

  save(input: MemoryInput): SaveMemoryResult {
    const trimmed = input.content.trim();
    if (!trimmed) throw new Error('Memory content cannot be empty');
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Memory content is too long (${trimmed.length} chars). Limit is ${MAX_CONTENT_LENGTH} characters.`);
    }

    return this.withLock(() => {
      const type = input.type ?? 'manual';
      const contentFingerprint = hashNormalizedContent(trimmed);
      const duplicate = this.findDuplicate(contentFingerprint, input.scope, input.projectId, type);

      if (duplicate) {
        const updatedAt = new Date().toISOString();
        const existing = this.state.memories.find((memory) => memory.id === duplicate.id);
        if (!existing) throw new Error(`Memory ${duplicate.id} not found`);

        existing.content = trimmed;
        existing.projectName = input.projectName ?? duplicate.projectName;
        existing.tags = [...(input.tags ?? duplicate.tags)];
        existing.updatedAt = updatedAt;
        this.persist();

        const updated: Memory = {
          ...duplicate,
          content: trimmed,
          projectName: input.projectName ?? duplicate.projectName,
          tags: input.tags ?? duplicate.tags,
          updatedAt,
        };

        debugLog('Memory updated', { id: updated.id, scope: updated.scope, type: updated.type });
        return { memory: updated, status: 'updated' as const };
      }

      const memory: Memory = {
        id: crypto.randomUUID(),
        content: trimmed,
        scope: input.scope,
        projectId: input.projectId ?? null,
        projectName: input.projectName ?? null,
        type,
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };

      this.state.memories.push(memory);
      this.persist();
      debugLog('Memory saved', { id: memory.id, scope: memory.scope, type: memory.type });
      return { memory, status: 'created' as const };
    });
  }

  add(input: MemoryInput): Memory {
    return this.save(input).memory;
  }

  private findDuplicate(
    contentFingerprint: string,
    scope: Scope,
    projectId: string | undefined,
    type: MemoryType,
  ): Memory | null {
    if (scope === 'global') {
      const memory = this.state.memories
        .filter((entry) => entry.scope === scope && entry.type === type)
        .find((entry) => hashNormalizedContent(entry.content) === contentFingerprint);
      return memory ? cloneMemory(memory) : null;
    }

    const scopedProjectId = scope === 'project' ? projectId ?? null : null;
    const memory = this.state.memories.find((entry) => (
      entry.scope === scope
      && entry.type === type
      && hashNormalizedContent(entry.content) === contentFingerprint
      && entry.projectId === scopedProjectId
    ));

    return memory ? cloneMemory(memory) : null;
  }

  getAll(scope?: Scope, projectId?: string): Memory[] {
    this.reloadIfChanged();
    return this.filterMemories(scope, projectId)
      .sort(compareByCreatedAtDesc)
      .map(cloneMemory);
  }

  delete(id: string): boolean {
    return this.withLock(() => {
      const before = this.state.memories.length;
      this.state.memories = this.state.memories.filter((memory) => memory.id !== id);
      delete this.state.vectors[id];
      const deleted = this.state.memories.length !== before;
      if (deleted) this.persist();
      if (deleted) debugLog('Memory deleted', { id });
      return deleted;
    });
  }

  clear(scope?: Scope, projectId?: string): number {
    return this.withLock(() => {
      const toDelete = new Set(this.filterMemories(scope, projectId).map((memory) => memory.id));
      if (toDelete.size === 0) return 0;

      this.state.memories = this.state.memories.filter((memory) => !toDelete.has(memory.id));
      for (const id of toDelete) {
        delete this.state.vectors[id];
      }
      this.persist();

      const count = toDelete.size;
      debugLog('Memories cleared', { scope, projectId, count });
      return count;
    });
  }

  // --- Lightweight in-memory token/prefix search. Despite historical naming
  // ("ftsSearch"), this is NOT SQLite FTS5 - there is no SQLite dependency in
  // this extension. It's a small token-overlap scorer; see computeSearchRank. ---

  ftsSearch(query: string, scope?: Scope, projectId?: string, limit = 10): FtsResult[] {
    if (!query.trim()) return [];
    this.reloadIfChanged();

    const normalizedQuery = normalizeMemoryContent(query);
    const queryTerms = tokenize(normalizedQuery).filter((term) => term.length > 1);
    if (queryTerms.length === 0) return [];

    return this.filterMemories(scope, projectId)
      .map((memory) => ({ memory, rank: computeSearchRank(memory.content, normalizedQuery, queryTerms) }))
      .filter((result) => Number.isFinite(result.rank))
      .sort((a, b) => a.rank - b.rank || compareByCreatedAtDesc(a.memory, b.memory))
      .slice(0, limit)
      .map((result) => ({
        memory: cloneMemory(result.memory),
        rank: result.rank,
      }));
  }

  // --- Vector Storage & Search ---

  storeVector(memoryId: string, embedding: Float32Array, model: string): void {
    this.withLock(() => {
      this.state.vectors[memoryId] = {
        embedding: Array.from(embedding),
        model,
        dimensions: embedding.length,
        createdAt: new Date().toISOString(),
      };
      this.persist();
    });
  }

  vectorSearch(
    queryEmbedding: Float32Array,
    scope?: Scope,
    projectId?: string,
    limit = 10,
  ): VectorResult[] {
    this.reloadIfChanged();
    const results = this.filterMemories(scope, projectId)
      .map((memory) => {
        const vector = this.state.vectors[memory.id];
        if (!vector || vector.dimensions !== queryEmbedding.length) return null;

        const similarity = cosineSimilarity(queryEmbedding, new Float32Array(vector.embedding));
        return { memory: cloneMemory(memory), similarity };
      })
      .filter((result): result is VectorResult => result !== null)
      .sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit);
  }

  getUnvectorizedMemories(model: string, limit = 100): Memory[] {
    this.reloadIfChanged();
    return this.state.memories
      .filter((memory) => this.state.vectors[memory.id]?.model !== model)
      .sort(compareByCreatedAtDesc)
      .slice(0, limit)
      .map(cloneMemory);
  }

  // --- Fingerprint ---

  getFingerprint(scope?: Scope, projectId?: string): StoreFingerprint {
    this.reloadIfChanged();
    const memories = this.filterMemories(scope, projectId);
    if (memories.length === 0) {
      return { version: 'empty', hash: 'empty', count: 0, updatedAt: null };
    }

    const latest = memories
      .map((memory) => memory.updatedAt ?? memory.createdAt)
      .sort()
      .at(-1) ?? null;
    const hashInput = `${memories.length}-${latest}`;
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
    return {
      version: hashInput,
      hash,
      count: memories.length,
      updatedAt: latest,
    };
  }

  // --- External change notifications ---

  /**
   * Watches the underlying store file(s) on disk and invokes `onChange`
   * whenever something might have changed them from outside this exact
   * MemoryStore instance - another VS Code window sharing the same store,
   * or (just as commonly) a Copilot Chat tool call in *this* window, since
   * the Language Model Tools only touch the store directly and have no
   * reference to any UI to refresh themselves. Without this, a save made
   * via chat (the normal way memories get created - see README) or via
   * auto-ingest-on-save can leave a tree view / status bar showing stale
   * counts until something else happens to trigger a manual refresh.
   *
   * Debounced (a single write touches the file more than once via the
   * temp-file-then-rename pattern used by persist()), and watches each
   * file's containing directory rather than the file itself - watching a
   * file path directly can silently stop working across a rename on some
   * platforms/filesystems, which is exactly how persist() writes.
   */
  onExternalChange(onChange: () => void): { dispose(): void } {
    const watchers: fs.FSWatcher[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNotify = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        onChange();
      }, 150);
    };

    const watchTargets = [this.storePath, this.projectStorePath].filter((p): p is string => !!p);
    for (const filePath of watchTargets) {
      try {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        const watcher = fs.watch(dir, (_eventType, filename) => {
          if (filename === base || filename === `${base}.tmp`) scheduleNotify();
        });
        watchers.push(watcher);
      } catch (err) {
        // Best-effort: if this platform/filesystem can't watch here, we
        // just fall back to whatever explicit refresh calls already exist.
        debugLog('Failed to watch memory store file for external changes', {
          filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      dispose: () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        for (const watcher of watchers) {
          try { watcher.close(); } catch { /* already closed */ }
        }
      },
    };
  }

  // --- Lifecycle ---

  close(): void {
    try {
      this.persist();
    } catch (err) {
      debugLog('Failed to persist memory store on close', { error: String(err) });
    }
  }

  private filterMemories(scope?: Scope, projectId?: string): Memory[] {
    return this.state.memories.filter((memory) => matchesScope(memory, scope, projectId));
  }
}

/** Path to this repo's encrypted project-memory file, without requiring a MemoryStore instance. */
export function projectMemoryFilePath(projectRoot: string): string {
  return path.join(projectRoot, '.memory-book', PROJECT_STORE_FILENAME);
}

/**
 * Whether this repo already has a project-memory file on disk - i.e. whether someone
 * (possibly you, on another machine) has already saved project-scoped memories here.
 * Used to avoid silently generating a second, incompatible key for a repo that already
 * has one (see lib/secrets.ts).
 */
export function projectMemoryFileExists(projectRoot: string): boolean {
  return fs.existsSync(projectMemoryFilePath(projectRoot));
}

/**
 * Checks whether `key` can decrypt this repo's existing project-memory file, without
 * constructing a full MemoryStore. Returns true if there's nothing to verify against yet
 * (no project memory saved here so far) - any key is "correct" for a file that doesn't
 * exist. Used to catch a mistyped/wrong shared key immediately, rather than only
 * discovering it the next time the store tries to load.
 */
export function verifyProjectMemoryKey(projectRoot: string, key: string): boolean {
  const filePath = projectMemoryFilePath(projectRoot);
  if (!fs.existsSync(filePath)) return true;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    decryptPersistedStore(raw, key);
    return true;
  } catch {
    return false;
  }
}

// --- Internal helpers ---

interface PersistedVector {
  embedding: number[];
  model: string;
  dimensions: number;
  createdAt: string;
}

interface PersistedStore {
  version: 1;
  memories: Memory[];
  vectors: Record<string, PersistedVector>;
}

function createEmptyState(): PersistedStore {
  return {
    version: 1,
    memories: [],
    vectors: {},
  };
}

function fileMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function acquireLockSync(lockPath: string, timeoutMs: number, spinMs: number): number {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return fs.openSync(lockPath, 'wx');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

      if (Date.now() > deadline) {
        // A lock left behind by a crashed process. Reclaim it rather than
        // deadlocking the extension forever.
        try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
        continue;
      }

      const spinUntil = Date.now() + spinMs;
      while (Date.now() < spinUntil) { /* brief synchronous busy-wait */ }
    }
  }
}

function normalizePersistedMemory(input: Partial<Memory>): Memory {
  return {
    id: input.id ?? crypto.randomUUID(),
    content: typeof input.content === 'string' ? input.content : '',
    scope: input.scope === 'project' ? 'project' : 'global',
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    type: isMemoryType(input.type) ? input.type : 'manual',
    tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  };
}

function normalizePersistedVectors(
  input: PersistedStore['vectors'] | undefined,
): PersistedStore['vectors'] {
  if (!input || typeof input !== 'object') return {};

  const vectors: PersistedStore['vectors'] = {};
  for (const [memoryId, value] of Object.entries(input)) {
    if (!value || typeof value !== 'object') continue;

    const embedding = Array.isArray(value.embedding)
      ? value.embedding.filter((entry): entry is number => typeof entry === 'number')
      : [];

    vectors[memoryId] = {
      embedding,
      model: typeof value.model === 'string' ? value.model : 'unknown',
      dimensions: typeof value.dimensions === 'number' ? value.dimensions : embedding.length,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    };
  }

  return vectors;
}

function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && [
    'manual',
    'decision',
    'preference',
    'constraint',
    'bug-root-cause',
    'architecture-note',
    'command-snippet',
    'file-snapshot',
  ].includes(value);
}

function cloneMemory(memory: Memory): Memory {
  return {
    ...memory,
    tags: [...memory.tags],
  };
}

function matchesScope(memory: Memory, scope?: Scope, projectId?: string): boolean {
  if (scope && projectId) {
    return memory.scope === scope && memory.projectId === projectId;
  }
  if (scope) {
    return memory.scope === scope;
  }
  if (projectId) {
    return memory.scope === 'global' || (memory.scope === 'project' && memory.projectId === projectId);
  }
  return true;
}

function compareByCreatedAtDesc(a: Memory, b: Memory): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function computeSearchRank(content: string, normalizedQuery: string, queryTerms: string[]): number {
  const normalizedContent = normalizeMemoryContent(content);
  const contentTerms = tokenize(normalizedContent);
  if (contentTerms.length === 0) return Number.POSITIVE_INFINITY;

  let score = 0;
  for (const term of queryTerms) {
    const exactMatches = contentTerms.filter((contentTerm) => contentTerm === term).length;
    const prefixMatches = contentTerms.filter((contentTerm) => contentTerm.startsWith(term)).length;
    score += exactMatches * 4 + prefixMatches;
  }

  if (normalizedContent.includes(normalizedQuery)) {
    score += queryTerms.length * 3;
  }

  return score > 0 ? -score : Number.POSITIVE_INFINITY;
}

function mergeStates(...states: PersistedStore[]): PersistedStore {
  const merged = createEmptyState();
  for (const state of states) {
    for (const memory of state.memories) {
      const existing = merged.memories.find((entry) => entry.id === memory.id);
      if (!existing) {
        merged.memories.push(cloneMemory(memory));
      }
    }
    for (const [memoryId, vector] of Object.entries(state.vectors)) {
      merged.vectors[memoryId] = { ...vector };
    }
  }
  return merged;
}

function encryptPersistedStore(state: PersistedStore, key: string): string {
  const keyBytes = deriveEncryptionKey(key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, iv);
  const plaintext = JSON.stringify(state, null, 2);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }, null, 2);
}

function decryptPersistedStore(raw: string, key: string): Partial<PersistedStore> {
  const payload = JSON.parse(raw) as {
    version?: number;
    iv?: string;
    tag?: string;
    ciphertext?: string;
    memories?: Memory[];
    vectors?: PersistedStore['vectors'];
  };

  if (Array.isArray(payload.memories) || payload.vectors) {
    return {
      version: 1,
      memories: Array.isArray(payload.memories) ? payload.memories : [],
      vectors: normalizePersistedVectors(payload.vectors),
    };
  }

  const iv = payload.iv ? Buffer.from(payload.iv, 'base64') : null;
  const tag = payload.tag ? Buffer.from(payload.tag, 'base64') : null;
  const ciphertext = payload.ciphertext ? Buffer.from(payload.ciphertext, 'base64') : null;

  if (!iv || !tag || !ciphertext) {
    throw new Error('Encrypted project-memory payload is invalid or missing required fields.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveEncryptionKey(key), iv);
  decipher.setAuthTag(tag);
  const plainText = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(plainText) as Partial<PersistedStore>;
}

function deriveEncryptionKey(key: string): Buffer {
  return crypto.createHash('sha256').update(key).digest().subarray(0, 32);
}

function hashNormalizedContent(content: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeMemoryContent(content))
    .digest('hex');
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
