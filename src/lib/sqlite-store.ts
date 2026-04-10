import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {
  Memory,
  MemoryInput,
  MemoryType,
  normalizeMemoryContent,
  SaveMemoryResult,
  Scope,
} from './memory-domain';
import { debugLog } from './settings';

const DEFAULT_STORAGE_DIR = path.join(os.homedir(), '.copilot-memory');
const DB_FILENAME = 'memory.db';

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

export class SqliteMemoryStore {
  private db: Database.Database;
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    const dbPath = path.join(this.storageDir, DB_FILENAME);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        content_fingerprint TEXT,
        scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global', 'project')),
        project_id TEXT,
        project_name TEXT,
        type TEXT NOT NULL DEFAULT 'manual',
        tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
      CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
        CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
        CREATE INDEX IF NOT EXISTS idx_memories_fingerprint ON memories(scope, project_id, type, content_fingerprint);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        memory_id UNINDEXED,
        content,
        tokenize='porter unicode61'
      );

      CREATE TABLE IF NOT EXISTS memory_vectors (
        memory_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.ensureColumnExists('memories', 'content_fingerprint', 'TEXT');
    this.backfillContentFingerprints();
  }

  private ensureColumnExists(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((entry) => entry.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private backfillContentFingerprints(): void {
    const rows = this.db.prepare(`
      SELECT id, content FROM memories WHERE content_fingerprint IS NULL
    `).all() as { id: string; content: string }[];

    const update = this.db.prepare(`
      UPDATE memories
      SET content_fingerprint = ?
      WHERE id = ?
    `);

    const transaction = this.db.transaction(() => {
      for (const row of rows) {
        update.run(hashNormalizedContent(row.content), row.id);
      }
    });

    transaction();
  }

  // --- Scope filter builder ---

  private buildScopeFilter(
    alias: string,
    scope?: Scope,
    projectId?: string,
  ): { sql: string; params: unknown[] } {
    if (scope && projectId) {
      return {
        sql: `AND ${alias}.scope = ? AND ${alias}.project_id = ?`,
        params: [scope, projectId],
      };
    }
    if (scope) {
      return { sql: `AND ${alias}.scope = ?`, params: [scope] };
    }
    if (projectId) {
      return {
        sql: `AND (${alias}.scope = 'global' OR (${alias}.scope = 'project' AND ${alias}.project_id = ?))`,
        params: [projectId],
      };
    }
    return { sql: '', params: [] };
  }

  // --- CRUD ---

  save(input: MemoryInput): SaveMemoryResult {
    const trimmed = input.content.trim();
    if (!trimmed) throw new Error('Memory content cannot be empty');

    const type = input.type ?? 'manual';
    const contentFingerprint = hashNormalizedContent(trimmed);
    const duplicate = this.findDuplicate(contentFingerprint, input.scope, input.projectId, type);

    if (duplicate) {
      const updatedAt = new Date().toISOString();
      this.db.prepare(`
        UPDATE memories
        SET content = ?,
            project_name = ?,
            tags = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        trimmed,
        input.projectName ?? duplicate.projectName,
        JSON.stringify(input.tags ?? duplicate.tags),
        updatedAt,
        duplicate.id,
      );

      const updated: Memory = {
        ...duplicate,
        content: trimmed,
        projectName: input.projectName ?? duplicate.projectName,
        tags: input.tags ?? duplicate.tags,
        updatedAt,
      };

      debugLog('Memory updated', { id: updated.id, scope: updated.scope, type: updated.type });
      return { memory: updated, status: 'updated' };
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

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO memories (id, content, content_fingerprint, scope, project_id, project_name, type, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        memory.id, memory.content, contentFingerprint, memory.scope,
        memory.projectId, memory.projectName, memory.type,
        JSON.stringify(memory.tags), memory.createdAt, memory.updatedAt,
      );
      this.db.prepare(`
        INSERT INTO memories_fts (memory_id, content) VALUES (?, ?)
      `).run(memory.id, memory.content);
    });

    transaction();
    debugLog('Memory saved', { id: memory.id, scope: memory.scope, type: memory.type });
    return { memory, status: 'created' };
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
      const row = this.db.prepare(`
        SELECT *
        FROM memories
        WHERE scope = ?
          AND type = ?
          AND content_fingerprint = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(scope, type, contentFingerprint) as MemoryRow | undefined;

      return row ? rowToMemory(row) : null;
    }

    const scopedProjectId = scope === 'project' ? projectId ?? null : null;
    const row = this.db.prepare(`
      SELECT *
      FROM memories
      WHERE scope = ?
        AND type = ?
        AND content_fingerprint = ?
        AND ((project_id IS NULL AND ? IS NULL) OR project_id = ?)
      ORDER BY created_at DESC
      LIMIT 1
    `).get(scope, type, contentFingerprint, scopedProjectId, scopedProjectId) as MemoryRow | undefined;

    return row ? rowToMemory(row) : null;
  }

  getAll(scope?: Scope, projectId?: string): Memory[] {
    const filter = this.buildScopeFilter('memories', scope, projectId);
    const sql = `SELECT * FROM memories WHERE 1=1 ${filter.sql} ORDER BY created_at DESC`;
    const rows = this.db.prepare(sql).all(...filter.params) as MemoryRow[];
    return rows.map(rowToMemory);
  }

  delete(id: string): boolean {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_vectors WHERE memory_id = ?').run(id);
      this.db.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
      return result.changes > 0;
    });

    const deleted = transaction();
    if (deleted) debugLog('Memory deleted', { id });
    return deleted;
  }

  clear(scope?: Scope, projectId?: string): number {
    const filter = this.buildScopeFilter('memories', scope, projectId);

    const transaction = this.db.transaction(() => {
      const ids = this.db
        .prepare(`SELECT id FROM memories WHERE 1=1 ${filter.sql}`)
        .all(...filter.params) as { id: string }[];
      if (ids.length === 0) return 0;

      for (const { id } of ids) {
        this.db.prepare('DELETE FROM memory_vectors WHERE memory_id = ?').run(id);
        this.db.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(id);
      }
      const result = this.db
        .prepare(`DELETE FROM memories WHERE 1=1 ${filter.sql}`)
        .run(...filter.params);
      return result.changes;
    });

    const count = transaction();
    debugLog('Memories cleared', { scope, projectId, count });
    return count;
  }

  // --- FTS5 Search ---

  ftsSearch(query: string, scope?: Scope, projectId?: string, limit = 10): FtsResult[] {
    if (!query.trim()) return [];

    const ftsQuery = query
      .replace(/['"]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .map((t) => `"${t}"`)
      .join(' OR ');

    if (!ftsQuery) return [];

    const filter = this.buildScopeFilter('m', scope, projectId);
    const sql = `
      SELECT m.*, f.rank
      FROM memories_fts f
      JOIN memories m ON m.id = f.memory_id
      WHERE memories_fts MATCH ?
      ${filter.sql}
      ORDER BY f.rank
      LIMIT ?
    `;
    const params = [ftsQuery, ...filter.params, limit];
    const rows = this.db.prepare(sql).all(...params) as (MemoryRow & { rank: number })[];
    return rows.map((row) => ({
      memory: rowToMemory(row),
      rank: row.rank,
    }));
  }

  // --- Vector Storage & Search ---

  storeVector(memoryId: string, embedding: Float32Array, model: string): void {
    const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    this.db.prepare(`
      INSERT OR REPLACE INTO memory_vectors (memory_id, embedding, model, dimensions, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(memoryId, buffer, model, embedding.length, new Date().toISOString());
  }

  vectorSearch(
    queryEmbedding: Float32Array,
    scope?: Scope,
    projectId?: string,
    limit = 10,
  ): VectorResult[] {
    const filter = this.buildScopeFilter('m', scope, projectId);
    const sql = `
      SELECT v.embedding, v.dimensions, m.*
      FROM memory_vectors v
      JOIN memories m ON m.id = v.memory_id
      WHERE 1=1
      ${filter.sql}
    `;
    const rows = this.db.prepare(sql).all(...filter.params) as (MemoryRow & {
      embedding: Buffer;
      dimensions: number;
    })[];

    const results: VectorResult[] = [];
    for (const row of rows) {
      const stored = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.dimensions,
      );
      const similarity = cosineSimilarity(queryEmbedding, stored);
      results.push({ memory: rowToMemory(row), similarity });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  getUnvectorizedMemories(model: string, limit = 100): Memory[] {
    const rows = this.db.prepare(`
      SELECT m.* FROM memories m
      LEFT JOIN memory_vectors v ON v.memory_id = m.id AND v.model = ?
      WHERE v.memory_id IS NULL
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(model, limit) as MemoryRow[];
    return rows.map(rowToMemory);
  }

  // --- Fingerprint ---

  getFingerprint(scope?: Scope, projectId?: string): StoreFingerprint {
    const filter = this.buildScopeFilter('memories', scope, projectId);
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM memories WHERE 1=1 ${filter.sql}`)
      .get(...filter.params) as { cnt: number };
    const latestRow = this.db
      .prepare(`SELECT MAX(created_at) as latest FROM memories WHERE 1=1 ${filter.sql}`)
      .get(...filter.params) as { latest: string | null };

    if (countRow.cnt === 0) {
      return { version: 'empty', hash: 'empty', count: 0, updatedAt: null };
    }

    const hashInput = `${countRow.cnt}-${latestRow.latest}`;
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
    return {
      version: hashInput,
      hash,
      count: countRow.cnt,
      updatedAt: latestRow.latest,
    };
  }

  // --- Lifecycle ---

  close(): void {
    this.db.close();
  }
}

// --- Internal helpers ---

interface MemoryRow {
  id: string;
  content: string;
  content_fingerprint?: string | null;
  scope: string;
  project_id: string | null;
  project_name: string | null;
  type: string;
  tags: string;
  created_at: string;
  updated_at: string | null;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    scope: row.scope as Scope,
    projectId: row.project_id,
    projectName: row.project_name,
    type: row.type as MemoryType,
    tags: JSON.parse(row.tags || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
