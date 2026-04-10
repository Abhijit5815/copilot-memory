# Copilot Memory

Persistent local memory for GitHub Copilot Chat backed by SQLite + FTS5, with optional hybrid vector search. Copilot can save and recall information across sessions automatically — no special commands needed. All data stays on your machine.

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

1. Update `publisher` in `package.json` to your actual Marketplace publisher ID.
2. Login once with `npx @vscode/vsce login <publisher>`.
3. Publish with:

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

1. Set `publisher` in `package.json` to your Marketplace publisher ID.
2. Add repository secret `VSCE_PAT` with Marketplace Manage scope.
3. Bump `version` in `package.json`.
4. Create and push a matching git tag:

```bash
git tag v0.0.2
git push origin v0.0.2
```

The release workflow validates tag/version alignment, runs tests, publishes to Marketplace, and uploads the `.vsix` as a GitHub release asset.

## Usage

Just chat with Copilot normally:

```
"Remember that our API uses rate limiting of 100 req/min"
→ Copilot saves it automatically

"What did we decide about rate limiting?"
→ Copilot searches your memories and uses them in its answer
```

To force a tool, type `#` in chat and pick one:

```
#copilot-memory_search auth flow
```

### Tools

| Tool | What it does |
|---|---|
| `copilot-memory_save` | Save a note with optional type metadata (global or project-scoped) |
| `copilot-memory_search` | Search saved memories (FTS5 with optional hybrid vector search) |
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
- **Project** — memories scoped to the current git repository

### Command Palette

`Cmd+Shift+P`:

- **Save Selection to Memory** — save highlighted code/text
- **Search Memories** — keyword search with score + source info
- **Show All Memories** — view global + project memories
- **Clear All Memories** — wipe with confirmation (global, project, or both)
- **Refresh Memory State** — manual refresh fallback
- **Backfill Embedding Vectors** — generate embeddings for existing memories

## Storage

Memories are stored in a SQLite database at `~/.copilot-memory/memory.db` using WAL mode for concurrent reads. FTS5 provides full-text search with porter stemming.

```
~/.copilot-memory/
  memory.db   ← SQLite database (memories, FTS index, vectors)
```

### Search Modes

| Mode | Description |
|---|---|
| `sparse` | FTS5 full-text search only (default, zero config) |
| `hybrid-cloud` | FTS5 + cloud embedding vectors (e.g. OpenAI), fused via Reciprocal Rank Fusion |
| `auto` | Uses hybrid if an embedding provider is configured, otherwise falls back to sparse |

## Settings

| Setting | Default | Description |
|---|---|---|
| `copilotMemory.maxContextItems` | `5` | Max results returned per search |
| `copilotMemory.storageDir` | `~/.copilot-memory` | Storage directory |
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
