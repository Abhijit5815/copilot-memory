import { MemoryType } from './memory-domain';

export interface IngestInsight {
  type: MemoryType;
  text: string;
  tags: string[];
}

interface InsightRule {
  type: MemoryType;
  regex: RegExp;
  tags: string[];
}

const INSIGHT_RULES: InsightRule[] = [
  {
    type: 'decision',
    regex: /\b(decision|we decided|chosen approach|final approach|rationale)\b/i,
    tags: ['decision'],
  },
  {
    type: 'constraint',
    regex: /\b(must|cannot|can't|should not|required|limit|constraint)\b/i,
    tags: ['constraint'],
  },
  {
    type: 'bug-root-cause',
    regex: /\b(root cause|regression|bug fix|fixes|workaround|incident|postmortem)\b/i,
    tags: ['error-resolution'],
  },
  {
    type: 'architecture-note',
    regex: /\b(architecture|design|pattern|tradeoff|module boundary|interface)\b/i,
    tags: ['architecture'],
  },
  {
    type: 'command-snippet',
    regex: /^(npm|pnpm|yarn|make|cargo|go|python|pip|uv|docker|kubectl|git)\b/i,
    tags: ['command'],
  },
];

export function extractHighSignalInsights(
  text: string,
  maxChars: number,
  maxInsights: number,
): IngestInsight[] {
  const sample = text.slice(0, Math.max(1, maxChars));
  const candidates = sample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12)
    .filter((line) => !line.startsWith('//') && !line.startsWith('#'));

  const seen = new Set<string>();
  const insights: IngestInsight[] = [];

  for (const line of candidates) {
    const rule = INSIGHT_RULES.find((entry) => entry.regex.test(line));
    if (!rule) continue;

    const normalized = normalize(line);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    insights.push({
      type: rule.type,
      text: line,
      tags: [...rule.tags],
    });

    if (insights.length >= maxInsights) break;
  }

  return insights;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}