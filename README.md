# Copilot Memory

Persistent local memory for GitHub Copilot Chat in VS Code.

This extension lets you save personal notes and project knowledge, then retrieve them later with `@memory` in chat. Data is stored locally on your machine.

## Why this project

- Works with GitHub Copilot Chat in VS Code
- Stores memory locally (no external API)
- Supports both personal memory and repository-scoped knowledge

## Features

- Chat participant: `@memory`
- Save and search memory from chat commands
- Quick commands from Command Palette
- JSONL local storage in `~/.copilot-memory`
- Lightweight text search with recency-aware ranking

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Compile TypeScript

```bash
npm run compile
```

### 3. Run extension in dev mode

1. Open this folder in VS Code.
2. Press `F5`.
3. A new Extension Development Host window opens.
4. Open Copilot Chat and use `@memory`.

## Chat Usage

| Action | Command |
|---|---|
| Save personal memory | `@memory /save auth uses JWT with 24h expiry` |
| Save project memory | `@memory /project-save API routes use withAuth wrapper` |
| Search memories | `@memory /search authentication flow` |
| Clear memory | `@memory /clear` |
| Auto-search prompt | `@memory how did we implement caching?` |

## Command Palette Usage

Run with `Cmd+Shift+P`:

- `Copilot Memory: Save Selection to Memory`
- `Copilot Memory: Search Memories`
- `Copilot Memory: Show All Memories`
- `Copilot Memory: Clear All Memories`

## Local Storage Layout

```text
~/.copilot-memory/
  personal_<hash>/
    memories.jsonl
  repo_<git-repo-name>/
    memories.jsonl
```

Example `memories.jsonl` line:

```json
{
  "id": "uuid",
  "content": "auth uses JWT tokens with 24h expiry",
  "metadata": { "type": "manual", "project": "my-app" },
  "createdAt": "2026-03-29T12:00:00.000Z"
}
```

## Settings

| Setting | Default | Description |
|---|---|---|
| `copilotMemory.maxContextItems` | `5` | Maximum results returned in context |
| `copilotMemory.storageDir` | `~/.copilot-memory` | Override default storage path |
| `copilotMemory.debug` | `false` | Enable debug output channel |

## Development Commands

```bash
npm run compile
npm run watch
npm run lint
npm run package
```

## Project Structure

```text
src/
  extension.ts
  participant.ts
  lib/
    memory-store.ts
    container-tag.ts
    format-context.ts
    git-utils.ts
    settings.ts
```

## Git Setup and Push

If this is a new repo, run:

```bash
git init -b main
git add .
git commit -m "Initial commit: Copilot Memory extension"
git remote add origin <your-repo-url>
git push -u origin main
```

If the remote already exists:

```bash
git add .
git commit -m "Update README and project setup"
git push
```

## License

MIT
