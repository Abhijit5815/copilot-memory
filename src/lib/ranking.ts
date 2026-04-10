import { Memory } from './memory-domain';

export interface RankableResult {
  memory: Memory;
  score: number;
}

export function applyRankingBoosts<T extends RankableResult>(
  results: T[],
  query: string,
  projectId?: string,
): T[] {
  const queryText = query.trim().toLowerCase();
  const tokens = extractQueryTokens(queryText);

  return results
    .map((r) => {
      const content = r.memory.content.toLowerCase();

      let boost = 0;

      // Prefer project-scoped memories for workspace queries.
      if (projectId) {
        if (r.memory.scope === 'project' && r.memory.projectId === projectId) boost += 0.15;
        if (r.memory.scope === 'global') boost += 0.03;
      }

      // Prefer durable memory classes over raw snapshots.
      boost += MEMORY_TYPE_BOOST[r.memory.type] ?? 0;

      // Reward exact phrase hits for high precision lookups.
      if (queryText.length >= 3 && content.includes(queryText)) {
        boost += 0.2;
      }

      if (tokens.length > 0) {
        const matched = tokens.filter((token) => content.includes(token)).length;
        const coverage = matched / tokens.length;
        boost += coverage * 0.2;

        const tagBoost = r.memory.tags.reduce((sum, tag) => {
          const normalizedTag = tag.toLowerCase();
          return sum + (tokens.some((token) => normalizedTag.includes(token)) ? 0.03 : 0);
        }, 0);
        boost += Math.min(tagBoost, 0.1);
      }

      return {
        ...r,
        score: r.score * (1 + Math.max(-0.2, boost)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function extractQueryTokens(query: string): string[] {
  return query
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

const MEMORY_TYPE_BOOST: Record<Memory['type'], number> = {
  manual: 0.03,
  decision: 0.12,
  preference: 0.08,
  constraint: 0.14,
  'bug-root-cause': 0.12,
  'architecture-note': 0.1,
  'command-snippet': 0.08,
  'file-snapshot': -0.06,
};