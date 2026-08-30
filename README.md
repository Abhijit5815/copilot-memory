# Copilot Memory

Lightweight local memory for GitHub Copilot Chat — local by default, with optional
encrypted repo-shared project memories and hybrid search.

This VS Code extension exposes Language Model Tools and Command Palette
commands so Copilot (and you) can save, search, list, and manage short
memories across editing sessions. Global memories are kept in a per-user
portable JSON store; project-scoped memories are encrypted and can be
committed to the repository for secure team sharing.

Key points
- Local by default: global memories live under `~/.copilot-memory` and are not
  committed.
- Repo-shared option: project memories are stored encrypted at
  `.copilot-memory/project-memory.enc.json` so teams can push/pull them safely
  — as long as everyone shares the same encryption key (see "Project memory
  encryption key" below). There is no built-in default key, by design.
- Credential keys (the project memory key and any embedding provider API key)
  are stored in your OS's secure credential store via VS Code's Secret
  Storage API, not in plain settings.
- Exposes language-model tools for programmatic use inside Copilot chat and
  commands for interactive use from the Command Palette.

## What this agent provides

- Language Model Tools (registers `copilot-memory_save`,
  `copilot-memory_search`, `copilot-memory_list`, `copilot-memory_delete`,
  `copilot-memory_refresh`) so Copilot can call the extension directly.
- Command Palette commands:
  - `Copilot Memory: Save Selection to Memory` — save selected text as a
    memory.
  - `Copilot Memory: Search Memories` — keyword search, opens results in a
    Markdown preview.
  - `Copilot Memory: Show All Memories` — lists global and project memories.
  - `Copilot Memory: Clear All Memories` — clear global, project, or both.
  - `Copilot Memory: Refresh Memory State` — show current counts/fingerprints.
  - `Copilot Memory: Backfill Embedding Vectors` — generate embeddings for
    existing memories (requires an embedding provider).
  - `Copilot Memory: Set Project Memory Key` — configure the shared secret
    used to encrypt this repo's project memories, stored securely.
  - `Copilot Memory: Set Embedding API Key` / `Clear Embedding API Key` —
    configure the embedding provider credential, stored securely.
- Auto-ingest on save: captures either raw snapshots or a small set of
  high-signal insights when files are saved (configurable via settings).
  Lines that look like they contain a live credential are skipped (selective
  mode) or redacted (snapshot mode) before they're ever stored, and files
  commonly holding secrets (`.env*`, `*.pem`, `*.key`, `id_rsa*`, etc.) are
  excluded from auto-ingest by default.

## Install (developer)

Requirements: Node.js and the `code` CLI on your PATH.

```bash
npm install
# build once
npm run compile
# or build/watch during development
npm run watch
```

To run tests:

```bash
npm test
```

To package a VSIX locally:

```bash
npm run vsix
# then install with:
code --install-extension copilot-memory-0.0.2.vsix
```

To publish to the Marketplace (CI or manual):

1. Login with `npx @vscode/vsce login <publisher>`.
2. Publish: `npm run publish:vsce`.

## Storage and privacy

- Global store: `~/.copilot-memory/memory-store.json` (memories + vectors),
  plain JSON, never committed.
- Project store (optional): `.copilot-memory/project-memory.enc.json` inside
  the repo, AES-256-GCM encrypted. Intended to be committed so teammates can
  share project-scoped memories.

Note: Because this repo intentionally stores the encrypted project file,
do not add `.copilot-memory/` to `.gitignore` unless you want to stop
committing the encrypted project memory file.

### Project memory encryption key

There is **no default encryption key**. The first time a project store is
created without one configured, Copilot Memory generates a random key and
stores it locally (this machine only, via Secret Storage) so things keep
working — but a warning is shown, because that key is *not* shared with your
team, so teammates who pull the repo won't be able to decrypt it.

To actually share project memory with a team:

1. One person runs `Copilot Memory: Set Project Memory Key` → "Generate a new
   key", copies the generated value, and shares it with the team through a
   secrets manager, password manager, or other out-of-band channel — **never
   by committing it or pasting it into `settings.json`** (a settings file
   living in the same repo as the ciphertext defeats the encryption).
2. Everyone else runs `Copilot Memory: Set Project Memory Key` → "Enter a
   shared key" and pastes the same value.

The legacy `copilotMemory.projectMemoryKey` setting and the
`COPILOT_MEMORY_KEY` environment variable still work as an explicit override
(useful for CI or headless use), but prefer the command above for day-to-day
use since it avoids putting the key in plain settings.

## Search modes & embeddings

- `sparse` — lightweight in-memory token/prefix search only (zero-config).
  Note: despite some earlier naming in this codebase, this is a hand-rolled
  scorer, not SQLite FTS5 — there's no SQLite dependency here.
- `hybrid-cloud` — token search + cloud embeddings (e.g. OpenAI) fused for
  better relevance.
- `auto` — uses hybrid if embeddings are configured, otherwise sparse.

Configure the embedding provider and model via settings, and store the API
key securely with `Copilot Memory: Set Embedding API Key` (the legacy
`copilotMemory.embeddingApiKey` setting is migrated automatically if set, and
should then be removed from your settings).

## Settings (high level)

- `copilotMemory.maxContextItems` (default: `5`)
- `copilotMemory.storageDir` (default: `~/.copilot-memory`)
- `copilotMemory.projectMemoryKey` (deprecated plain-text fallback; prefer the
  "Set Project Memory Key" command)
- `copilotMemory.debug` (default: `false`)
- `copilotMemory.autoIngestOnSave` (default: `true`)
- `copilotMemory.autoIngestStrategy` (`selective` or `snapshot`, default
  `selective`)
- `copilotMemory.autoIngestMaxChars`, `copilotMemory.autoIngestMaxInsights`
- `copilotMemory.autoIngestIgnoreGlobs` (patterns to skip auto-ingest; secret
  file patterns are included by default)
- `copilotMemory.defaultSaveScope` (`project` or `global`)
- `copilotMemory.searchMode` (`sparse`, `hybrid-cloud`, `auto`)
- `copilotMemory.embeddingProvider`, `copilotMemory.embeddingModel`, etc.
  (`copilotMemory.embeddingApiKey` is a deprecated plain-text fallback; prefer
  the "Set Embedding API Key" command)

See the extension settings in VS Code for full descriptions and defaults.

## Known limitations

- Two VS Code windows writing to the same store at the same instant are
  serialized with a lockfile and reconciled on write, but this is a simple
  file-based mechanism, not a database — very high write concurrency isn't a
  target use case.
- Edits to a memory overwrite its previous content; there's no version
  history or undo for edits or deletes.
- Auto-ingest secret detection is heuristic/pattern-based, not a full secret
  scanner — it catches common cases (AWS/OpenAI/GitHub/Slack-style keys,
  private key blocks, JWTs, obvious `key=`/`password=` assignments) but
  isn't exhaustive. Keep genuinely sensitive files out of auto-ingest via
  `autoIngestIgnoreGlobs`, and review project memory before committing it.

## Contributing & notes for maintainers

- The extension registers tools via the VS Code Language Model Tools API and
  hooks into file save events for auto-ingest.
- We intentionally commit the encrypted project store so teammates can share
  memories; `.copilot-memory/` should not be ignored by default.

Suggested developer commands:

```bash
npm run lint    # type-checks via tsc (same as `npm run check-types`)
npm run compile # build the extension
npm test        # run tests
npm run vsix    # package a local VSIX
```

## License

MIT
