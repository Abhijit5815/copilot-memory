# Copilot Memory

Persistent local memory for GitHub Copilot Chat backed by SQLite + FTS5, with optional hybrid vector search. Copilot can save and recall information across sessions automatically — no special commands needed. All data stays on your machine.

## Install

```bash
bash install-local.sh
```

Restart VS Code. Done.

> Requires Node.js and `code` CLI on your PATH.

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
| `copilot-memory_save` | Save a note (global or project-scoped) |
| `copilot-memory_search` | Search saved memories (FTS5 with optional hybrid vector search) |
| `copilot-memory_list` | List all memories |
| `copilot-memory_delete` | Delete a memory by ID |
| `copilot-memory_refresh` | Force refresh and return memory fingerprints |

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
| `copilotMemory.autoIngestOnSave` | `true` | Auto-save file snapshots to project memory on save |
| `copilotMemory.autoIngestMaxChars` | `2000` | Max characters captured per saved file |
| `copilotMemory.autoIngestIgnoreGlobs` | `node_modules/.git/out/dist/*.lock` | Files/folders excluded from auto-ingest |
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
npm run compile   # build
npm run watch     # build on change
```

Press `F5` in VS Code to launch the extension in dev mode.

## License

MIT
