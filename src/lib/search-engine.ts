import { Memory, Scope } from './memory-domain';
import { SqliteMemoryStore } from './sqlite-store';
import { EmbeddingProvider, NoopEmbeddingProvider } from './embeddings';
import { applyRankingBoosts } from './ranking';
import { debugLog, SearchMode } from './settings';

export interface SearchOptions {
  scope?: Scope;
  projectId?: string;
  limit?: number;
  mode?: SearchMode;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  source: 'fts' | 'vector' | 'hybrid';
}

export class SearchEngine {
  constructor(
    private store: SqliteMemoryStore,
    private embeddingProvider: EmbeddingProvider = new NoopEmbeddingProvider(),
  ) {}

  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { scope, projectId, limit = 10, mode = 'auto' } = options;
    const resolvedMode = await this.resolveMode(mode);

    debugLog('Search', { query, resolvedMode, scope, projectId });

    if (resolvedMode === 'sparse') {
      return this.sparseSearch(query, scope, projectId, limit);
    }

    return this.hybridSearch(query, scope, projectId, limit);
  }

  private async resolveMode(mode: SearchMode): Promise<'sparse' | 'hybrid'> {
    if (mode === 'sparse') return 'sparse';
    if (mode === 'hybrid-cloud') {
      return (await this.embeddingProvider.isAvailable()) ? 'hybrid' : 'sparse';
    }
    // auto
    if (this.embeddingProvider instanceof NoopEmbeddingProvider) return 'sparse';
    return (await this.embeddingProvider.isAvailable()) ? 'hybrid' : 'sparse';
  }

  private sparseSearch(
    query: string,
    scope?: Scope,
    projectId?: string,
    limit = 10,
  ): SearchResult[] {
    const candidatePool = Math.max(limit * 3, 30);
    const ftsResults = this.store.ftsSearch(query, scope, projectId, candidatePool);

    const results: SearchResult[] = ftsResults.map((r, i) => ({
      memory: r.memory,
      score: 1 / (1 + i),
      source: 'fts' as const,
    }));

    const boosted = applyRankingBoosts(results, query, projectId);
    return applyRecencyBoost(boosted).slice(0, limit);
  }

  private async hybridSearch(
    query: string,
    scope?: Scope,
    projectId?: string,
    limit = 10,
  ): Promise<SearchResult[]> {
    const candidatePool = Math.max(limit * 3, 30);

    const [ftsResults, queryEmbedding] = await Promise.all([
      this.store.ftsSearch(query, scope, projectId, candidatePool),
      this.embeddingProvider.embed([query]).then((r) => r[0]).catch(() => null),
    ]);

    if (!queryEmbedding) {
      debugLog('Embedding failed, falling back to sparse search');
      return this.sparseSearch(query, scope, projectId, limit);
    }

    const vectorResults = this.store.vectorSearch(
      queryEmbedding,
      scope,
      projectId,
      candidatePool,
    );

    // Reciprocal Rank Fusion
    const ftsRanked = ftsResults.map((r, i) => ({
      id: r.memory.id,
      rank: i + 1,
    }));
    const vectorRanked = vectorResults.map((r, i) => ({
      id: r.memory.id,
      rank: i + 1,
    }));

    const fusedScores = reciprocalRankFusion([ftsRanked, vectorRanked]);

    // Build memory lookup
    const memoryMap = new Map<string, Memory>();
    for (const r of ftsResults) memoryMap.set(r.memory.id, r.memory);
    for (const r of vectorResults) memoryMap.set(r.memory.id, r.memory);

    const results: SearchResult[] = [];
    for (const [id, score] of fusedScores) {
      const memory = memoryMap.get(id);
      if (memory) {
        results.push({ memory, score, source: 'hybrid' });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const boosted = applyRankingBoosts(results, query, projectId);
    return applyRecencyBoost(boosted).slice(0, limit);
  }

  async backfillVectors(batchSize = 50): Promise<number> {
    if (this.embeddingProvider instanceof NoopEmbeddingProvider) return 0;

    const unvectorized = this.store.getUnvectorizedMemories(
      this.embeddingProvider.model,
      batchSize,
    );
    if (unvectorized.length === 0) return 0;

    const texts = unvectorized.map((m) => m.content);
    const embeddings = await this.embeddingProvider.embed(texts);

    for (let i = 0; i < unvectorized.length; i++) {
      if (embeddings[i]) {
        this.store.storeVector(
          unvectorized[i].id,
          embeddings[i],
          this.embeddingProvider.model,
        );
      }
    }

    debugLog('Backfilled vectors', { count: embeddings.length });
    return embeddings.length;
  }
}

// --- Helpers ---

function applyRecencyBoost(results: SearchResult[]): SearchResult[] {
  const now = Date.now();
  return results
    .map((r) => {
      const ageMs = now - new Date(r.memory.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.exp(-ageDays / 14);
      return { ...r, score: r.score * 0.8 + recencyBoost * 0.2 };
    })
    .sort((a, b) => b.score - a.score);
}

function reciprocalRankFusion(
  rankedLists: { id: string; rank: number }[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    for (const item of list) {
      const current = scores.get(item.id) ?? 0;
      scores.set(item.id, current + 1 / (k + item.rank));
    }
  }
  return scores;
}
