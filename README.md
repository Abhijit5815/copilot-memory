# Copilot Memory

Persistent local memory for GitHub Copilot Chat. Copilot can save and recall information across sessions automatically — no special commands needed. All data stays on your machine.

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
| `copilot-memory_save` | Save a note (personal or project-scoped) |
| `copilot-memory_search` | Search saved memories |
| `copilot-memory_list` | List all memories |
| `copilot-memory_delete` | Delete a memory by ID |

### Command Palette

`Cmd+Shift+P`:

- **Save Selection to Memory** — save highlighted code/text
- **Search Memories** — keyword search
- **Show All Memories** — view everything
- **Clear All Memories** — wipe with confirmation

## Storage

Memories persist forever in `~/.copilot-memory/` as JSONL files:

```
~/.copilot-memory/
  personal_<hash>/memories.jsonl      ← your notes (all repos)
  repo_<git-repo-name>/memories.jsonl ← project-specific knowledge
```

## Settings

| Setting | Default | Description |
|---|---|---|
| `copilotMemory.maxContextItems` | `5` | Max results returned per search |
| `copilotMemory.storageDir` | `~/.copilot-memory` | Storage directory |
| `copilotMemory.debug` | `false` | Debug logging |

## Development

```bash
npm install
npm run compile   # build
npm run watch     # build on change
```

Press `F5` in VS Code to launch the extension in dev mode.

## License

MIT
