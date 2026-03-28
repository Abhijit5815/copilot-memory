import type { Memory, SearchResult } from './memory-store';

export function formatSearchResults(
  results: SearchResult[],
  label: string,
): string {
  if (results.length === 0) return '';

  const lines = [`### ${label}\n`];
  for (const { memory, score } of results) {
    const date = new Date(memory.createdAt).toLocaleDateString();
    const project = memory.metadata.project ? ` [${memory.metadata.project}]` : '';
    const relevance = (score * 100).toFixed(0);
    lines.push(`- ${memory.content}${project} _(${date}, ${relevance}% match)_`);
  }
  return lines.join('\n');
}

export function formatMemoryDetail(memory: Memory): string {
  const date = new Date(memory.createdAt).toLocaleString();
  const type = memory.metadata.type;
  const project = memory.metadata.project || 'unknown';
  return `**[${type}]** ${memory.content}\n\n_Project: ${project} | Saved: ${date} | ID: \`${memory.id}\`_`;
}

export function formatContextBlock(
  personalResults: SearchResult[],
  repoResults: SearchResult[],
): string {
  const sections: string[] = [];

  const personal = formatSearchResults(personalResults, 'Personal Memories');
  if (personal) sections.push(personal);

  const repo = formatSearchResults(repoResults, 'Project Knowledge (Shared)');
  if (repo) sections.push(repo);

  if (sections.length === 0) {
    return '_No relevant memories found._';
  }

  return sections.join('\n\n---\n\n');
}
