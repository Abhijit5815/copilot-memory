import assert from 'node:assert/strict';
import test from 'node:test';
import { Memory } from '../lib/memory-domain';
import { applyRankingBoosts, RankableResult } from '../lib/ranking';

function buildMemory(overrides: Partial<Memory>): Memory {
  return {
    id: overrides.id ?? 'm-1',
    content: overrides.content ?? 'default memory content',
    scope: overrides.scope ?? 'project',
    projectId: overrides.projectId ?? 'repo_1',
    projectName: overrides.projectName ?? 'repo',
    type: overrides.type ?? 'manual',
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? null,
  };
}

function asResult(memory: Memory, score = 0.1): RankableResult {
  return { memory, score };
}

test('ranking prefers project-scoped durable memories over snapshots', () => {
  const projectDecision = asResult(buildMemory({
    id: 'project-decision',
    content: 'Decision: use sqlite WAL mode for reliability',
    scope: 'project',
    projectId: 'repo_a',
    type: 'decision',
  }));

  const globalSnapshot = asResult(buildMemory({
    id: 'global-snapshot',
    content: 'Decision: use sqlite WAL mode for reliability',
    scope: 'global',
    projectId: null,
    projectName: null,
    type: 'file-snapshot',
  }));

  const ranked = applyRankingBoosts([
    globalSnapshot,
    projectDecision,
  ], 'use sqlite WAL mode', 'repo_a');

  assert.equal(ranked[0].memory.id, 'project-decision');
});

test('ranking rewards tag overlap with query terms', () => {
  const withTagMatch = asResult(buildMemory({
    id: 'with-tag',
    content: 'Use build task for release pipeline',
    tags: ['release', 'pipeline', 'build-task'],
    type: 'architecture-note',
  }));

  const withoutTagMatch = asResult(buildMemory({
    id: 'without-tag',
    content: 'Use build task for release pipeline',
    tags: ['notes'],
    type: 'architecture-note',
  }));

  const ranked = applyRankingBoosts([
    withoutTagMatch,
    withTagMatch,
  ], 'release pipeline task', 'repo_1');

  assert.equal(ranked[0].memory.id, 'with-tag');
});