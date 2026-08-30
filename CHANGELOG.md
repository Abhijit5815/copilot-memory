# Changelog

All notable changes to Copilot Memory are documented here.

## 0.0.2

Reliability and security hardening pass:

- Removed a hardcoded default encryption key. Project memory now either
  uses an explicit shared key or a securely-stored, randomly generated
  local one — never a known default.
- Moved the project memory key and embedding API key out of plain-text
  settings and into secure OS storage (VS Code Secret Storage). Added
  `Copilot Memory: Set Project Memory Key`, `Set Embedding API Key`, and
  `Clear Embedding API Key` commands.
- Fixed a data-loss bug where two VS Code windows sharing the same memory
  store could silently overwrite each other's saved memories.
- The extension no longer crashes entirely if project memory can't be
  decrypted (wrong/rotated key, corrupted file) — it now degrades to
  global-memory-only and shows a clear error instead.
- Auto-ingest now skips or redacts lines that look like credentials before
  saving them, and ignores common secret files (`.env*`, `*.pem`, `*.key`,
  etc.) by default.
- Search/list results returned to Copilot now include a short note marking
  recalled content as stored data, not instructions.
- Removed unused/dead code (`sqlite-store.ts`) and corrected documentation
  that inaccurately described search as SQLite FTS5 (it's a lightweight
  in-memory token/prefix scorer).
- Added a content-length cap and truncated long entries in the tree view.
- Rewrote the README for first-time/non-technical users.

## 0.0.1

Initial release: global and encrypted project-scoped memory, Language
Model Tools for Copilot Chat (save/search/list/delete/refresh), auto-ingest
on file save, hybrid search with optional OpenAI embeddings, and Command
Palette / tree view management.
