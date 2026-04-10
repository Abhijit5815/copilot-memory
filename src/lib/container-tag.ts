import * as crypto from 'node:crypto';
import { getGitRoot, getGitRepoName, getGitRemoteUrl } from './git-utils';

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

/** Repo container: scoped to remote URL hash (fallback to git root hash). */
export function getRepoContainerTag(cwd: string): string {
  const gitRoot = getGitRoot(cwd);
  const basePath = gitRoot || cwd;
  const remoteUrl = getGitRemoteUrl(basePath);
  const gitRepoName = getGitRepoName(basePath);
  const repoName = gitRepoName || basePath.split('/').pop() || 'unknown';
  const identitySource = remoteUrl || basePath;
  const identityHash = sha256Short(identitySource);
  return `repo_${sanitize(repoName)}_${identityHash}`;
}

export function getProjectName(cwd: string): string {
  const gitRoot = getGitRoot(cwd);
  const basePath = gitRoot || cwd;
  const gitRepoName = getGitRepoName(basePath);
  return gitRepoName || basePath.split('/').pop() || 'unknown';
}
