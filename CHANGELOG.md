# Changelog

All notable changes to Memory Book are documented here.

## 0.0.5

Renamed the extension from **Copilot Memory** to **Memory Book**, to stop colliding with GitHub Copilot Chat's own, separate built-in memory feature of the same name (see "Making sure Copilot uses this memory, not VS Code's built-in one" in the README).

- All command IDs, Language Model Tool names, and the `copilotMemory.*` settings moved to `memory-book.*` / `memory-book_*` / `memoryBook.*`.
- Any project memory key or embedding API key already stored under the old name is migrated automatically and silently the first time it's read - nothing needs to be re-entered.
- The on-disk storage folder is still named `.copilot-memory/` on purpose, so existing global and project memory files keep working without changes.
- If you had `COPILOT_MEMORY_KEY` set in your shell, it still works; `MEMORY_BOOK_KEY` is now the preferred name going forward.
- New icon: a closed book with a bookmark, replacing the old generic `resources/icon.png`. The activity-bar icon (`resources/memory-book.svg`) matches the same shape. Also added a `galleryBanner` color so the Marketplace page background matches.

## 0.0.4

Fixes a stale-UI bug: the sidebar tree view and status bar count could show
fewer memories than actually exist.

- Root cause: the tree view and status bar only re-rendered after specific
  Command Palette actions (Save Selection, Clear All, Refresh). They never
  refreshed after a memory was saved or deleted via Copilot Chat itself
  (the `memory-book_save`/`_delete` tools) or via auto-ingest-on-save -
  which, per the README, is the normal way most memories get created. The
  data was always saved correctly; the UI just didn't know to redraw.
- Fix: `MemoryStore.onExternalChange()` watches the underlying store
  file(s) directly and triggers a UI refresh whenever they change, no
  matter what caused the change - a chat tool call, auto-ingest, or another
  VS Code window sharing the same store. If you were told to "just reload
  the window" to see a memory that was clearly saved, this is that bug.

## 0.0.3

Fixes two team-sharing gaps in the project memory key model:

- Losing the key: added `Memory Book: Show Project Memory Key`, so anyone
  who still has working access can retrieve and re-share the key, instead of
  it only ever being shown once at generation time.
- Independently generated keys silently breaking sync: `Set Project Memory
  Key` now refuses to auto-generate a key for a repo that already has saved
  project memory (you'd just create a second, incompatible key) and instead
  points you at the "Enter a shared key" flow with a clear explanation.
  Pasting a key is now verified against the existing file immediately, so a
  typo is caught on the spot instead of surfacing as a confusing failure
  later.

## 0.0.2

Reliability and security hardening pass:

- Removed a hardcoded default encryption key. Project memory now either
  uses an explicit shared key or a securely-stored, randomly generated
  local one — never a known default.
- Moved the project memory key and embedding API key out of plain-text
  settings and into secure OS storage (VS Code Secret Storage). Added
  `Memory Book: Set Project Memory Key`, `Set Embedding API Key`, and
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
