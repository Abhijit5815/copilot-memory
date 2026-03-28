import * as crypto from 'node:crypto';
import { getGitRoot, getGitRepoName } from './git-utils';

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function sanitize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Personal container: scoped to user + repo path */
export function getPersonalContainerTag(cwd: string): string {
  const gitRoot = getGitRoot(cwd);
  const basePath = gitRoot || cwd;
  return `personal_${sha256Short(basePath)}`;
}

/** Repo container: scoped to git remote name, shared across team */
export function getRepoContainerTag(cwd: string): string {
  const gitRoot = getGitRoot(cwd);
  const basePath = gitRoot || cwd;
  const gitRepoName = getGitRepoName(basePath);
  const repoName = gitRepoName || basePath.split('/').pop() || 'unknown';
  return `repo_${sanitize(repoName)}`;
}

export function getProjectName(cwd: string): string {
  const gitRoot = getGitRoot(cwd);
  const basePath = gitRoot || cwd;
  const gitRepoName = getGitRepoName(basePath);
  return gitRepoName || basePath.split('/').pop() || 'unknown';
}
