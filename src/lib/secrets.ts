import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { projectMemoryFileExists, verifyProjectMemoryKey } from './memory-store';

/**
 * Key management for Memory Book's two credential-shaped settings
 * (the project-memory encryption key and the embedding provider API key).
 *
 * These used to live as plain-string VS Code settings. That's a problem for
 * two reasons: (1) VS Code Settings Sync can copy plain settings to the
 * user's account/cloud, and (2) teams commonly commit `.vscode/settings.json`
 * for shared config, which would put the project-memory key in the very same
 * repo as the ciphertext it's meant to protect. This module moves both
 * secrets into `vscode.ExtensionContext.secrets` (OS keychain-backed) and
 * keeps the plain settings only as a one-time migration path for existing
 * users.
 *
 * It also guards two failure modes specific to a *shared* encryption key:
 *  - Losing the key: `showProjectMemoryKey` lets anyone who still has
 *    working access retrieve and re-share it, instead of it only ever being
 *    shown once at generation time.
 *  - Two people independently generating different keys for the same repo
 *    (which silently breaks sync - each side can only read their own writes):
 *    `resolveProjectMemoryKey` refuses to auto-generate a key when a project
 *    memory file already exists, and `setProjectMemoryKey` warns before
 *    generating a fresh key over existing data, and verifies a pasted key
 *    actually opens the existing file before committing to it.
 */

const EMBEDDING_KEY_SECRET = 'memoryBook.embeddingApiKey';
const PROJECT_KEY_SECRET_PREFIX = 'memoryBook.projectKey.';

// Secret storage keys used before the extension was renamed from Copilot
// Memory to Memory Book. Read as a one-time migration fallback so nobody
// who already generated/stored a key under the old name loses access to it
// just because of the rename - the exact "lost key" failure mode this
// module exists to prevent in the first place.
const LEGACY_EMBEDDING_KEY_SECRET = 'copilotMemory.embeddingApiKey';
const LEGACY_PROJECT_KEY_SECRET_PREFIX = 'copilotMemory.projectKey.';

/**
 * Reads a secret under its current name, falling back to (and migrating
 * from) the pre-rename name if the current name has nothing stored yet.
 */
async function readSecretWithLegacyFallback(
  context: vscode.ExtensionContext,
  currentName: string,
  legacyName: string,
): Promise<string | undefined> {
  const current = await context.secrets.get(currentName);
  if (current) return current;

  const legacy = await context.secrets.get(legacyName);
  if (!legacy) return undefined;

  await context.secrets.store(currentName, legacy);
  await context.secrets.delete(legacyName);
  return legacy;
}

export async function resolveEmbeddingApiKey(
  context: vscode.ExtensionContext,
  legacySettingValue: string,
): Promise<string> {
  const stored = await readSecretWithLegacyFallback(context, EMBEDDING_KEY_SECRET, LEGACY_EMBEDDING_KEY_SECRET);
  if (stored) return stored;

  if (legacySettingValue) {
    await context.secrets.store(EMBEDDING_KEY_SECRET, legacySettingValue);
    void vscode.window.showWarningMessage(
      'Memory Book: migrated your embedding API key from plain settings into secure storage. ' +
      'You can now remove memoryBook.embeddingApiKey from your settings.json.',
    );
    return legacySettingValue;
  }

  return '';
}

export async function setEmbeddingApiKey(context: vscode.ExtensionContext): Promise<void> {
  const value = await vscode.window.showInputBox({
    prompt: 'Embedding provider API key',
    password: true,
    ignoreFocusOut: true,
  });
  if (!value) return;

  await context.secrets.store(EMBEDDING_KEY_SECRET, value);
  vscode.window.showInformationMessage('Embedding API key saved to secure storage. Reload the window to apply it.');
}

export async function clearEmbeddingApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(EMBEDDING_KEY_SECRET);
  vscode.window.showInformationMessage('Embedding API key cleared.');
}

function projectKeySecretName(repoContainerTag: string): string {
  return `${PROJECT_KEY_SECRET_PREFIX}${repoContainerTag}`;
}

/**
 * Resolves the key used to encrypt/decrypt this repo's project memory.
 * Precedence:
 *  1. An explicit setting/env var (the team-shared-secret path) always wins.
 *  2. A key this machine has already resolved before (stored locally).
 *  3. If neither is set AND this repo already has a project-memory file on
 *     disk, we refuse to invent a new key - doing so would silently create a
 *     second, incompatible key and make team sync worse, not better. We
 *     throw a clear, actionable error instead (caller falls back to
 *     global-memory-only for this session).
 *  4. Only for a genuinely fresh repo (no project-memory file yet) do we
 *     generate a random local key automatically, with a warning that it
 *     needs to be shared for teammates to read it.
 */
export async function resolveProjectMemoryKey(
  context: vscode.ExtensionContext,
  repoContainerTag: string,
  explicitKey: string | undefined,
  projectRoot: string,
): Promise<string> {
  if (explicitKey) return explicitKey;

  const secretName = projectKeySecretName(repoContainerTag);
  const legacySecretName = `${LEGACY_PROJECT_KEY_SECRET_PREFIX}${repoContainerTag}`;
  const stored = await readSecretWithLegacyFallback(context, secretName, legacySecretName);
  if (stored) return stored;

  if (projectMemoryFileExists(projectRoot)) {
    throw new Error(
      'This repo already has project memory saved (likely by a teammate), but no key is configured on ' +
      'this machine. Ask someone who can already read it to run "Memory Book: Show Project Memory Key" ' +
      'and share it with you, then run "Memory Book: Set Project Memory Key" and choose "Enter a shared ' +
      'key". (Generating a new key here would create a second, incompatible key instead of fixing this.)',
    );
  }

  // Nobody has saved project memory in this repo yet - safe to generate a
  // fresh local key and let the user promote it to a shared one later.
  const generated = crypto.randomBytes(32).toString('hex');
  await context.secrets.store(secretName, generated);

  void vscode.window.showWarningMessage(
    'Memory Book: no project memory key was configured, so a random key was generated and stored locally ' +
    'on this machine only. Project memories are still encrypted, but teammates who pull this repo will not be ' +
    'able to decrypt them - and if this machine is the only place the key exists, losing it means losing this ' +
    'repo\'s project memory - until you share it.',
    'Show / Share This Key',
  ).then((choice) => {
    if (choice === 'Show / Share This Key') {
      void vscode.commands.executeCommand('memory-book.showProjectMemoryKey');
    }
  });

  return generated;
}

/**
 * Displays the key currently stored for this repo, so it can be recovered
 * and re-shared as long as at least one machine still has it - this is the
 * main defense against "the one person who generated it left / lost their
 * laptop" turning into permanent data loss.
 */
export async function showProjectMemoryKey(context: vscode.ExtensionContext, repoContainerTag: string): Promise<void> {
  const secretName = projectKeySecretName(repoContainerTag);
  const legacySecretName = `${LEGACY_PROJECT_KEY_SECRET_PREFIX}${repoContainerTag}`;
  const stored = await readSecretWithLegacyFallback(context, secretName, legacySecretName);

  if (!stored) {
    void vscode.window.showWarningMessage(
      'No project memory key is stored on this machine for this repo. If you\'re relying on ' +
      'memoryBook.projectMemoryKey or the MEMORY_BOOK_KEY environment variable instead, check there.',
    );
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'This will display your project memory encryption key. Anyone who can see your screen right now ' +
    '(e.g. a screen share) will see it too.',
    { modal: true },
    'Show Key',
  );
  if (confirm !== 'Show Key') return;

  const pick = await vscode.window.showInformationMessage(
    `Project memory key for this repo: ${stored}`,
    'Copy to Clipboard',
  );
  if (pick === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(stored);
    void vscode.window.showInformationMessage(
      'Copied. Store this somewhere durable (a password manager entry, not just this clipboard) - ' +
      'it\'s the only way to read this repo\'s project memory, and it cannot be recovered if every copy is lost.',
    );
  }
}

export async function setProjectMemoryKey(
  context: vscode.ExtensionContext,
  repoContainerTag: string,
  projectRoot: string,
): Promise<void> {
  const hasExistingData = projectMemoryFileExists(projectRoot);

  const options: { label: string; detail: string; action: 'enter' | 'generate' | 'show' }[] = [
    { label: '$(key) Enter a shared key', detail: 'Paste a key a teammate already generated', action: 'enter' },
    { label: '$(sparkle) Generate a new key', detail: 'Shown once so you can share it with your team out-of-band', action: 'generate' },
  ];
  if (hasExistingData) {
    options.unshift({ label: '$(eye) Show the current key', detail: 'Recover the key already in use for this repo, to back it up or share it', action: 'show' });
  }

  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: 'Configure this repo\'s project memory encryption key',
  });
  if (!choice) return;

  if (choice.action === 'show') {
    await showProjectMemoryKey(context, repoContainerTag);
    return;
  }

  const secretName = projectKeySecretName(repoContainerTag);

  if (choice.action === 'enter') {
    const value = await vscode.window.showInputBox({
      prompt: 'Paste the shared project memory key',
      password: true,
      ignoreFocusOut: true,
    });
    if (!value) return;

    if (!verifyProjectMemoryKey(projectRoot, value)) {
      const retry = await vscode.window.showErrorMessage(
        'That key doesn\'t unlock this repo\'s existing project memory - double-check you copied it correctly ' +
        '(stray spaces, wrong repo\'s key, etc). Storing a wrong key now would just recreate this same problem later.',
        'Try Again',
        'Store Anyway',
      );
      if (retry === 'Try Again') {
        await setProjectMemoryKey(context, repoContainerTag, projectRoot);
        return;
      }
      if (retry !== 'Store Anyway') return;
    }

    await context.secrets.store(secretName, value);
    void vscode.window.showInformationMessage(
      'Project memory key saved to secure storage. Reload the window to apply it.',
      'Reload Window',
    ).then((pick) => {
      if (pick === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
    });
    return;
  }

  // choice.action === 'generate'
  if (hasExistingData) {
    const confirm = await vscode.window.showWarningMessage(
      'This repo already has project memory saved. Generating a brand-new key means you won\'t be able to ' +
      'read what\'s already there, and nobody else will be able to read what you save, until everyone switches ' +
      'to the same key. If a teammate already has access, use "Enter a shared key" instead.',
      { modal: true },
      'Generate Anyway',
    );
    if (confirm !== 'Generate Anyway') return;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  await context.secrets.store(secretName, generated);
  const pick = await vscode.window.showInformationMessage(
    `New project memory key generated. Share it with your team out-of-band (never via git), and save a copy ` +
    `in a password manager - it can't be recovered if every copy is lost: ${generated}`,
    'Copy to Clipboard',
    'Reload Window',
  );
  if (pick === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(generated);
  } else if (pick === 'Reload Window') {
    void vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}
