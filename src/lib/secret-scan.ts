/**
 * Lightweight heuristics to keep obvious credentials out of stored memories.
 *
 * Copilot Memory's auto-ingest can capture raw file content (snapshot mode) or
 * lines extracted from saved files (selective mode), and project-scoped
 * memories are, by design, meant to be committed to git and shared with a
 * team. Without a check here, saving a file that happens to contain a live
 * credential would durably copy that credential into a memory store - and,
 * for project scope, into git history. This is intentionally conservative and
 * pattern-based rather than a full secret scanner: it aims to catch the
 * common, high-confidence cases, not to be exhaustive.
 */

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'private-key', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END \1?PRIVATE KEY-----/g },
  { name: 'aws-access-key-id', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'openai-secret-key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'bearer-token', regex: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi },
  { name: 'assigned-secret', regex: /\b(api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi },
];

export function containsLikelySecret(text: string): boolean {
  return SECRET_PATTERNS.some(({ regex }) => {
    regex.lastIndex = 0;
    return regex.test(text);
  });
}

export interface RedactionResult {
  text: string;
  redactedCount: number;
}

export function redactSecrets(text: string): RedactionResult {
  let redactedCount = 0;
  let result = text;

  for (const { regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    result = result.replace(regex, () => {
      redactedCount += 1;
      return '[REDACTED]';
    });
  }

  return { text: result, redactedCount };
}
