# Copilot Memory

Copilot Memory gives GitHub Copilot Chat a memory. Save a note once — a
decision, a preference, a "why we did it this way" — and Copilot can recall
it later, even in a brand-new chat window or the next day.

Think of it as two notebooks:

- A **personal notebook** that follows you everywhere (all your projects).
- A **shared notebook** that lives inside one specific project, so your
  whole team can read the same notes.

---

## Quick start (3 steps)

1. **Install it.** See [Installing](#installing) below.
2. **Save something.** Highlight some text in an editor, open the Command
   Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux), and run
   **`Copilot Memory: Save Selection to Memory`**. Or just tell Copilot Chat
   something like *"remember that we use pnpm, not npm, in this repo"* — it
   can save that for you on its own.
3. **See what's saved.** Run **`Copilot Memory: Show All Memories`** from
   the Command Palette. That's it — you're using it.

Everything else in this document is detail for when you want it.

---

## Installing

You'll need [Node.js](https://nodejs.org) and the VS Code `code` command
installed (VS Code can add this for you: open the Command Palette and run
`Shell Command: Install 'code' command in PATH`).

Then, from a terminal in this project folder, the easiest path is:

```bash
./install-local.sh
```

This installs dependencies, builds the extension, packages it, and installs
it into VS Code for you. Restart VS Code afterward.

If you'd rather do it by hand:

```bash
npm install        # get the dependencies
npm run compile     # build it
npm run vsix        # package it into a .vsix file
code --install-extension copilot-memory-0.0.2.vsix
```

---

## Everyday use

You mostly won't need commands at all — just talk to Copilot Chat normally
("remember X", "what did we decide about Y?") and it will call Copilot
Memory's tools on its own when it makes sense. The commands below are there
for when you want to do something directly, without going through chat.

Open these from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`), or
click the little **database icon in the bottom status bar** for a shortcut
menu with the most common ones.

| What you want to do | Command |
|---|---|
| Save the text you've highlighted | `Copilot Memory: Save Selection to Memory` |
| Search your saved notes | `Copilot Memory: Search Memories` |
| See everything that's saved | `Copilot Memory: Show All Memories` |
| Delete everything (with confirmation) | `Copilot Memory: Clear All Memories` |
| Recheck counts / fix a stuck status | `Copilot Memory: Refresh Memory State` |

There's also a **Copilot Memory icon in the left sidebar** (Activity Bar)
that shows a simple tree of everything saved, split into "Project" and
"Global".

**Auto-save on file save:** by default, when you save a file, Copilot
Memory quietly looks for anything that reads like a decision, a rule, or a
"gotcha" worth remembering, and saves a short note about it automatically.
You can turn this off in Settings by searching for `Copilot Memory` and
unchecking `Auto Ingest On Save`.

---

## "Global" vs "Project" — which notebook does this go in?

- **Global** = your personal notebook. Follows you into every project on
  this computer. Good for things like "I prefer tabs over spaces" or "I
  always forget this git command."
- **Project** = the shared notebook for *this one repo*. Good for team
  knowledge: "we decided to use Postgres, not Mongo, because..." This one
  can be checked into git so your teammates see the same notes.

By default, saving without picking a notebook goes into **Project**. You
can change that default in Settings (`Copilot Memory: Default Save Scope`).

---

## Where is my data, really?

- **Global notebook:** a plain file on your computer at
  `~/.copilot-memory/memory-store.json`. Never shared, never committed to
  git.
- **Project notebook:** a locked (encrypted) file inside the project at
  `.copilot-memory/project-memory.enc.json`. This one is *meant* to be
  committed to git, so your team shares it.

The project file is scrambled (encrypted) so that if it ends up on GitHub,
nobody can read it without the right key — see the next section.

---

## Sharing project notes with your team (optional)

If you never plan to share a project with teammates, you can skip this —
Copilot Memory generates a private key for you automatically and everything
just works locally.

If you **do** want your team to read the same shared notes:

1. One person opens the Command Palette and runs
   **`Copilot Memory: Set Project Memory Key`** → choose **"Generate a new
   key"**. You'll get a random code.
2. Share that code with your team through a private channel — Slack DM, a
   password manager, 1Password, etc. **Never paste it into a file that gets
   committed to git** — that would be like locking a door and taping the
   key to it.
3. Everyone else on the team runs the same command, but chooses
   **"Enter a shared key"** and pastes in the code from step 1.

Now everyone's copy of the extension locks and unlocks the shared notebook
with the same key, and it's safe to commit `.copilot-memory/` to the repo.

---

## Using an AI-powered ("smart") search (optional, advanced)

By default, search works by matching words — good enough for most people,
and needs zero setup. If you want Copilot Memory to also understand
*meaning*, not just exact words (so searching "auth flow" also finds a note
about "login process"), you can connect an embedding provider like OpenAI:

1. Open Settings, search for `Copilot Memory`.
2. Set `Embedding Provider` to `openai`.
3. Run **`Copilot Memory: Set Embedding API Key`** and paste your API key
   (it's stored securely, not in a plain settings file).
4. Run **`Copilot Memory: Backfill Embedding Vectors`** once, to catch up
   anything you saved before turning this on.

This is entirely optional — skip it and everything still works.

---

## Making sure Copilot uses *this* memory, not VS Code's built-in one

VS Code also ships its own, separate memory feature, which can cause
Copilot to save/search in two different places without you noticing. To
make sure it always uses Copilot Memory instead:

1. Open Settings (`Cmd+,` / `Ctrl+,`), search for `memory`, and turn off:
   - `Github › Copilot › Chat › Tools: Memory Enabled`
   - `Github › Copilot › Chat: Copilot Memory Enabled`
2. As a belt-and-braces check: in Copilot Chat, click the **tools icon**
   (wrench) in the chat box, and make sure the built-in "Memory" tool is
   unchecked while the `copilot-memory_*` tools are checked.

## FAQ / Troubleshooting

**"I saved something and now see a scrambled-looking JSON file — is that
normal?"** Yes — that's `.copilot-memory/project-memory.enc.json`, your
encrypted project notebook. It's *supposed* to look like nonsense; that's
the point. To read what's actually in it, don't open the file — run
`Copilot Memory: Show All Memories` instead, and VS Code will show it to
you in plain text.

**"Nothing happens when I save a file."** Check Settings → `Copilot
Memory` → `Auto Ingest On Save` is turned on, and that the file isn't
inside an ignored folder (`node_modules`, `.git`, build output, or common
secret files like `.env` are skipped on purpose).

**"Can Copilot Memory accidentally save a password or API key?"** It tries
hard not to — lines that look like credentials are skipped or blacked out
before saving, and common secret files (`.env`, `*.pem`, `*.key`, etc.) are
never auto-saved. This is a best-effort safety net, not a guarantee, so
still glance over `.copilot-memory/` before committing it.

**"I changed the shared key and now I get an error."** That means the
saved notes were locked with the *old* key. If you have the old key, switch
back to it. If not, the notes made under the old key can't be recovered —
only ones saved after switching to the new key will work going forward.

---

## For developers / contributors

<details>
<summary>Click to expand build, test, and settings reference</summary>

### Build & test

```bash
npm install
npm run compile      # build once
npm run watch        # rebuild on every change
npm test             # run the test suite
npm run vsix         # package a local .vsix
```

### All settings

- `copilotMemory.maxContextItems` (default `5`) — how many memories Copilot
  pulls into context per search.
- `copilotMemory.storageDir` (default: `~/.copilot-memory`) — where the
  global notebook lives.
- `copilotMemory.projectMemoryKey` — deprecated plain-text fallback for the
  shared key; prefer the `Set Project Memory Key` command instead.
- `copilotMemory.debug` (default `false`) — verbose logging in the "Copilot
  Memory" Output panel.
- `copilotMemory.autoIngestOnSave` (default `true`)
- `copilotMemory.autoIngestStrategy` (`selective` or `snapshot`, default
  `selective`) — selective saves short insights; snapshot saves a raw
  excerpt of the file.
- `copilotMemory.autoIngestMaxChars`, `copilotMemory.autoIngestMaxInsights`
- `copilotMemory.autoIngestIgnoreGlobs` — file patterns never auto-saved;
  common secret files are included by default.
- `copilotMemory.defaultSaveScope` (`project` or `global`, default
  `project`)
- `copilotMemory.searchMode` (`sparse`, `hybrid-cloud`, `auto`, default
  `auto`) — `sparse` is plain keyword matching; `hybrid-cloud` adds the
  optional AI-powered search described above.
- `copilotMemory.embeddingProvider`, `embeddingModel`, `embeddingBaseUrl`,
  `embeddingDimensions` — advanced, optional AI search config.
- `copilotMemory.embeddingApiKey` — deprecated plain-text fallback; prefer
  `Set Embedding API Key`.

### Storage internals

- Global store: `~/.copilot-memory/memory-store.json` — plain JSON,
  memories + any embedding vectors.
- Project store: `<repo>/.copilot-memory/project-memory.enc.json` —
  AES-256-GCM encrypted JSON, same shape.
- Search is a lightweight in-memory token/prefix scorer (not SQLite FTS5,
  despite some earlier naming in this codebase) with an optional
  reciprocal-rank-fusion blend against embedding similarity in hybrid mode.

### Known limitations

- Two VS Code windows writing to the same store at the exact same instant
  are serialized with a simple lockfile and reconciled on write — this is
  file-based, not a database, so it isn't built for heavy concurrent write
  load.
- Editing a memory overwrites its previous content; deleting is permanent.
  Neither has version history or undo.
- Secret detection on auto-ingest is pattern-based, not a full scanner —
  it catches common cases, not everything. Review `.copilot-memory/`
  before committing it.

### Publishing

1. `npx @vscode/vsce login <publisher>`
2. `npm run publish:vsce`

CI (`.github/workflows/release.yml`) also publishes automatically on a
`vX.Y.Z` git tag, given a `VSCE_PAT` repository secret.

</details>

---

## License

MIT
