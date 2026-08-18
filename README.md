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
  `.copilot-memory/project-memory.enc.json` so teams can push/pull them safely.
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
- Auto-ingest on save: captures either raw snapshots or a small set of
  high-signal insights when files are saved (configurable via settings).

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
code --install-extension copilot-memory-0.0.1.vsix
```

To publish to the Marketplace (CI or manual):

1. Login with `npx @vscode/vsce login <publisher>`.
2. Publish: `npm run publish:vsce`.

## Storage and privacy

- Global store: `~/.copilot-memory/memory-store.json` (memories + vectors).
- Project store (optional): `.copilot-memory/project-memory.enc.json` inside
  the repo. The file is encrypted with a shared secret and intended to be
  committed so teammates can share project-scoped memories.

Note: Because this repo intentionally stores the encrypted project file,
do not add `.copilot-memory/` to `.gitignore` unless you want to stop
committing the encrypted project memory file.

## Search modes & embeddings

- `sparse` — token-based FTS5 search only (zero-config).
- `hybrid-cloud` — token search + cloud embeddings (e.g. OpenAI) fused for
  better relevance.
- `auto` — uses hybrid if embeddings are configured, otherwise sparse.

Embedding provider settings let you configure provider, API key, model,
dimensions, and base URL.

## Settings (high level)

- `copilotMemory.maxContextItems` (default: `5`)
- `copilotMemory.storageDir` (default: `~/.copilot-memory`)
- `copilotMemory.projectMemoryKey` (secret used to encrypt project store)
- `copilotMemory.debug` (default: `false`)
- `copilotMemory.autoIngestOnSave` (default: `true`)
- `copilotMemory.autoIngestStrategy` (`selective` or `snapshot`, default
  `selective`)
- `copilotMemory.autoIngestMaxChars`, `copilotMemory.autoIngestMaxInsights`
- `copilotMemory.autoIngestIgnoreGlobs` (patterns to skip auto-ingest)
- `copilotMemory.defaultSaveScope` (`project` or `global`)
- `copilotMemory.searchMode` (`sparse`, `hybrid-cloud`, `auto`)
- `copilotMemory.embeddingProvider`, `copilotMemory.embeddingApiKey`, etc.

See the extension settings in VS Code for full descriptions and defaults.

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
