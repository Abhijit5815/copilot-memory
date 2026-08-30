# Changelog

All notable changes to Memory Book are documented here.

## 0.0.1 — Initial release

First public release. This project was originally prototyped under the
name "Copilot Memory" and went through several rounds of hardening before
ever being published; it was renamed to **Memory Book** just before this
release to stop colliding with GitHub Copilot Chat's own, separate
built-in memory feature of the same name (see "Making sure Copilot uses
this memory, not VS Code's built-in one" in the README) — none of that
earlier history was ever published, so it's rolled up into this first
release rather than listed as separate versions.

What's included:

- Global and encrypted project-scoped memory, Language Model Tools for
  Copilot Chat (save/search/list/delete/refresh), auto-ingest on file
  save, hybrid search with optional OpenAI embeddings, and Command
  Palette / tree view management.
- No hardcoded encryption key: project memory uses either an explicit
  shared key or a securely-generated, randomly-stored local one.
- The project memory key and embedding API key live in secure OS storage
  (VS Code Secret Storage), not plain-text settings.
- Losing a shared project memory key isn't fatal: `Memory Book: Show
  Project Memory Key` lets anyone with working access retrieve and
  re-share it. Two teammates independently generating different keys for
  the same repo is caught and refused, instead of silently breaking sync.
- Two VS Code windows sharing the same memory store can't silently
  overwrite each other's saved memories (lost-update protection), and the
  sidebar/status bar refresh automatically whenever memory changes from
  any source — a chat tool call, auto-ingest, or another window.
- The extension degrades to global-memory-only (instead of crashing) if
  project memory can't be decrypted.
- Auto-ingest skips or redacts lines that look like credentials, and
  ignores common secret files (`.env*`, `*.pem`, `*.key`, etc.) by
  default.
- Search/list results returned to Copilot are marked as stored data, not
  instructions.
