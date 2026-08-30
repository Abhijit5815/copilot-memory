import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

/**
 * Key management for Copilot Memory's two credential-shaped settings
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
 */

const EMBEDDING_KEY_SECRET = 'copilotMemory.embeddingApiKey';
const PROJECT_KEY_SECRET_PREFIX = 'copilotMemory.projectKey.';

export async function resolveEmbeddingApiKey(
  context: vscode.ExtensionContext,
  legacySettingValue: string,
): Promise<string> {
  const stored = await context.secrets.get(EMBEDDING_KEY_SECRET);
  if (stored) return stored;

  if (legacySettingValue) {
    await context.secrets.store(EMBEDDING_KEY_SECRET, legacySettingValue);
    void vscode.window.showWarningMessage(
      'Copilot Memory: migrated your embedding API key from plain settings into secure storage. ' +
      'You can now remove copilotMemory.embeddingApiKey from your settings.json.',
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
 * Precedence: an explicit setting/env var (the team-shared-secret path) wins;
 * otherwise a previously generated local key is reused; otherwise a new
 * random key is generated, stored locally, and the user is warned that it
 * won't be readable by teammates until they set a real shared key.
 */
export async function resolveProjectMemoryKey(
  context: vscode.ExtensionContext,
  repoContainerTag: string,
  explicitKey: string | undefined,
): Promise<string> {
  if (explicitKey) return explicitKey;

  const secretName = projectKeySecretName(repoContainerTag);
  const stored = await context.secrets.get(secretName);
  if (stored) return stored;

  const generated = crypto.randomBytes(32).toString('hex');
  await context.secrets.store(secretName, generated);

  void vscode.window.showWarningMessage(
    'Copilot Memory: no project memory key was configured, so a random key was generated and stored locally ' +
    'on this machine only. Project memories are still encrypted, but teammates who pull this repo will not be ' +
    'able to decrypt them until you set a shared key.',
    'Set Project Memory Key',
  ).then((choice) => {
    if (choice === 'Set Project Memory Key') {
      void vscode.commands.executeCommand('copilot-memory.setProjectMemoryKey');
    }
  });

  return generated;
}

export async function setProjectMemoryKey(context: vscode.ExtensionContext, repoContainerTag: string): Promise<void> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(key) Enter a shared key', detail: 'Paste a key a teammate already generated', action: 'enter' as const },
      { label: '$(sparkle) Generate a new key', detail: 'Shown once so you can share it with your team out-of-band', action: 'generate' as const },
    ],
    { placeHolder: 'Configure this repo\'s project memory encryption key' },
  );
  if (!choice) return;

  const secretName = projectKeySecretName(repoContainerTag);

  if (choice.action === 'enter') {
    const value = await vscode.window.showInputBox({
      prompt: 'Paste the shared project memory key',
      password: true,
      ignoreFocusOut: true,
    });
    if (!value) return;
    await context.secrets.store(secretName, value);
    void vscode.window.showInformationMessage(
      'Project memory key saved to secure storage. Reload the window to re-encrypt with this key.',
      'Reload Window',
    ).then((pick) => {
      if (pick === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
    });
    return;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  await context.secrets.store(secretName, generated);
  const pick = await vscode.window.showInformationMessage(
    `New project memory key generated. Share it with your team out-of-band (never via git): ${generated}`,
    'Copy to Clipboard',
    'Reload Window',
  );
  if (pick === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(generated);
  } else if (pick === 'Reload Window') {
    void vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}
