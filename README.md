# Copilot Memory

Persistent local memory for GitHub Copilot Chat (local by default), backed by a portable local JSON store, with optional hybrid vector search. For team workflows you can enable repo-scoped project memories — these are encrypted and stored in the repository so they can be committed and shared securely across teammates. Copilot can save and recall information across sessions without manual storage commands. All global memories stay on your machine; project-scoped memories are encrypted for safe repo sharing.

## Install

```bash
bash install-local.sh
```

Restart VS Code. Done.

> Requires Node.js and `code` CLI on your PATH.

### Install for End Users

After this extension is published to the VS Code Marketplace, users can install it with:

```bash
code --install-extension <publisher>.copilot-memory
```

or by searching for the extension in the VS Code Extensions view.

### Publish to Marketplace

1. Login once with `npx @vscode/vsce login AbhijitKasana`.
2. Publish with:

```bash
npm run publish:vsce
```

If you want to distribute a build outside Marketplace, create a VSIX with:

```bash
npm run vsix
```

### Automated Releases (GitHub Actions)

This repository includes:

- `.github/workflows/ci.yml`: runs checks/tests/packages on pushes and PRs.
- `.github/workflows/release.yml`: publishes on tags like `v0.0.2` (or manual dispatch).

Setup steps:

1. Add repository secret `VSCE_PAT` with Marketplace Manage scope.
2. Bump `version` in `package.json`.
3. Create and push a matching git tag:

```bash
git tag v0.0.2
git push origin v0.0.2
```

The release workflow validates tag/version alignment, runs tests, publishes to Marketplace, and uploads the `.vsix` as a GitHub release asset.

## Usage

Copilot can use the memory tools automatically during chat, or you can invoke them explicitly.

Examples:

```
"Remember that our API uses rate limiting of 100 req/min"
→ Copilot can save it to memory

"What did we decide about rate limiting?"
→ Copilot can search saved memories and use them in its answer
```

To force a tool, type `#` in chat and pick one:

```
#copilot-memory_search auth flow
```

### Tools

| Tool | What it does |
|---|---|
| `copilot-memory_save` | Save a note with optional type metadata (global or project-scoped) |
| `copilot-memory_search` | Search saved memories (portable token-based search with optional hybrid vector search) |
| `copilot-memory_list` | List all memories |
| `copilot-memory_delete` | Delete a memory by ID |
| `copilot-memory_refresh` | Force refresh and return memory fingerprints |

`copilot-memory_save` supports these optional memory types:

- `decision`
- `preference`
- `constraint`
- `bug-root-cause`
- `architecture-note`
- `command-snippet`

Repeated saves of the same normalized content in the same scope are deduplicated and update the existing memory instead of creating another row.

Auto-ingest now defaults to a selective strategy that captures high-signal insights (decisions, constraints, bug/root-cause clues, architecture notes, command snippets) rather than always storing raw file snapshots. You can switch back to raw snapshots in settings.

### Scopes

- **Global** — memories available across all repositories
- **Project** — memories scoped to the current git repository and stored in a repo-local encrypted file for push/pull sharing across the team

Project memories are now written to `.copilot-memory/project-memory.enc.json` inside the repo itself, encrypted with a shared secret key so the file can be committed and pulled by teammates in the same repo. Global memories remain stored in the local home-directory store.

### Command Palette

`Cmd+Shift+P`:

- **Save Selection to Memory** — save highlighted code/text
- **Search Memories** — keyword search with score + source info
- **Show All Memories** — view global + project memories
- **Clear All Memories** — wipe with confirmation (global, project, or both)
- **Refresh Memory State** — manual refresh fallback
- **Backfill Embedding Vectors** — generate embeddings for existing memories

## Storage

Memories are stored in a portable JSON file at `~/.copilot-memory/memory-store.json`. This avoids shipping native binaries, so the extension can run across macOS, Windows, and Linux from a single Marketplace build.

Legacy `~/.copilot-memory/memory.db` files are not migrated automatically yet.

```
~/.copilot-memory/
  memory-store.json   ← local memory store (memories and vectors)
```

### Search Modes

| Mode | Description |
|---|---|
| `sparse` | Portable token-based search only (default, zero config) |
| `hybrid-cloud` | Token search + cloud embedding vectors (e.g. OpenAI), fused via Reciprocal Rank Fusion |
| `auto` | Uses hybrid if an embedding provider is configured, otherwise falls back to sparse |

## Settings

| Setting | Default | Description |
|---|---|---|
| `copilotMemory.maxContextItems` | `5` | Max results returned per search |
| `copilotMemory.storageDir` | `~/.copilot-memory` | Storage directory for global memories |
| `copilotMemory.projectMemoryKey` | | Shared secret used to encrypt repo-scoped project memories before committing them to Git |
| `copilotMemory.debug` | `false` | Debug logging |
| `copilotMemory.autoIngestOnSave` | `true` | Enable save-time memory ingestion |
| `copilotMemory.autoIngestStrategy` | `selective` | Ingest mode: `selective` for high-signal insights, `snapshot` for raw snippets |
| `copilotMemory.autoIngestMaxChars` | `2000` | Max characters captured per saved file |
| `copilotMemory.autoIngestMaxInsights` | `3` | Max high-signal insights captured per saved file in selective mode |
| `copilotMemory.autoIngestIgnoreGlobs` | `**/node_modules/**, **/.git/**, **/out/**, **/dist/**, **/*.lock` | Files/folders excluded from auto-ingest |
| `copilotMemory.defaultSaveScope` | `project` | Default scope when saving (`global` or `project`) |
| `copilotMemory.searchMode` | `auto` | Search mode: `sparse`, `hybrid-cloud`, or `auto` |
| `copilotMemory.embeddingProvider` | `none` | Embedding provider for hybrid search (`none` or `openai`) |
| `copilotMemory.embeddingApiKey` | | API key for the embedding provider |
| `copilotMemory.embeddingModel` | | Embedding model (e.g. `text-embedding-3-small`) |
| `copilotMemory.embeddingDimensions` | `0` | Embedding dimensions (0 = provider default) |
| `copilotMemory.embeddingBaseUrl` | | Custom base URL for the embedding API |

### Repo-shared project memories

For team-shared project memories, set a secret key in VS Code settings or in the environment:

```bash
export COPILOT_MEMORY_KEY="your-shared-secret-key"
```

Then set:

- `copilotMemory.projectMemoryKey`: same value on each teammate machine

The project-scoped file is stored in the repo at:

```text
.copilot-memory/project-memory.enc.json
```

Note: this repository intentionally stores the encrypted project memory file inside `.copilot-memory/` so teammates can share project-scoped memories. Do not add `.copilot-memory/` to `.gitignore` unless you deliberately want to stop committing the encrypted project memory file.

This file is encrypted, so it can safely be committed, pushed, and pulled across the same repository without exposing raw memory contents.

### Hybrid Search Setup

To enable hybrid search with OpenAI embeddings:

1. Set `copilotMemory.embeddingProvider` to `openai`
2. Set `copilotMemory.embeddingApiKey` to your OpenAI API key
3. Set `copilotMemory.searchMode` to `hybrid-cloud` or `auto`
4. Run **Copilot Memory: Backfill Embedding Vectors** to generate embeddings for existing memories

New memories are automatically embedded when saved.

## Development

```bash
npm install
npm run compile   # type-check + bundle to dist/
npm run watch     # watch bundle rebuilds
npm test          # compile tests + run node tests
npm run vsix      # package installable VSIX
```

Press `F5` in VS Code to launch the extension in dev mode.

## License

MIT
