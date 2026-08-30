# Memory Book

[Install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AbhijitKasana.memory-book)

Memory Book gives GitHub Copilot Chat a memory. Save a note once — a
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
   **`Memory Book: Save Selection to Memory`**. Or just tell Copilot Chat
   something like *"remember that we use pnpm, not npm, in this repo"* — it
   can save that for you on its own.
3. **See what's saved.** Run **`Memory Book: Show All Memories`** from
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
code --install-extension memory-book-0.0.1.vsix
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
| Save the text you've highlighted | `Memory Book: Save Selection to Memory` |
| Search your saved notes | `Memory Book: Search Memories` |
| See everything that's saved | `Memory Book: Show All Memories` |
| Delete everything (with confirmation) | `Memory Book: Clear All Memories` |
| Recheck counts / fix a stuck status | `Memory Book: Refresh Memory State` |

There's also a **Memory Book icon in the left sidebar** (Activity Bar)
that shows a simple tree of everything saved, split into "Project" and
"Global".

**Auto-save on file save:** by default, when you save a file, Memory Book quietly
looks for anything that reads like a decision, a rule, or a
"gotcha" worth remembering, and saves a short note about it automatically.
You can turn this off in Settings by searching for `Memory Book` and
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
can change that default in Settings (`Memory Book: Default Save Scope`).

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
Memory Book generates a private key for you automatically and everything
just works locally.

If you **do** want your team to read the same shared notes, treat this
exactly like sharing a database password or an API key — because that's
what it is:

1. **Before anyone else touches this project's memory**, one person opens
   the Command Palette and runs **`Memory Book: Set Project Memory Key`**
   → **"Generate a new key"**. You'll get a random code.
2. **Immediately save that code somewhere durable** — a team password
   manager entry (1Password, Bitwarden, etc.) is ideal. **Never paste it
   into a file that gets committed to git** — that would be like locking a
   door and taping the key to it.
3. Share it with the team through a private channel (the password manager
   entry, a Slack DM — not email, not a doc that gets shared broadly).
4. Everyone else on the team runs the same command, but chooses
   **"Enter a shared key"** and pastes in the code from step 1. If they
   mistype it, Memory Book checks the key against the existing project
   file right away and tells them — it won't let a typo silently create a
   second, broken copy.

Now everyone's copy of the extension locks and unlocks the shared notebook
with the same key, and it's safe to commit `.copilot-memory/` to the repo.

**If you forgot to save the key**, or a new teammate needs it, anyone whose
copy of the extension still works can run **`Memory Book: Set Project
Memory Key`** → **"Show the current key"** (or the standalone
**`Memory Book: Show Project Memory Key`** command) to see and re-copy
it — you don't need to remember it from generation time, as long as at
least one working copy exists somewhere.

**If everyone loses the key** — every machine that had it wiped, nobody
saved it anywhere else — that project's notebook genuinely can't be
recovered. This isn't a bug; it's what "encrypted" means, the same way a
lost password-manager master password can't be recovered by the password
manager either. The mitigations above (save it the moment you generate it,
make "Show the current key" part of onboarding a new teammate) are there to
make that close to a non-issue in practice. If the worst happens anyway,
nothing else is affected — your personal global notebook and any other
project's notebook are encrypted with different keys and are unaffected.

**If someone accidentally generates a second key for a repo that already
has notes** (skipping step 4 above), Memory Book now catches this: it
won't silently invent a new key for a repo it can already see has existing
project memory. Instead it'll tell that person to get the real key from a
teammate via `Show Project Memory Key`, and "Generate a new key" asks for
confirmation before overwriting an existing setup.

---

## Using an AI-powered ("smart") search (optional, advanced)

By default, search works by matching words — good enough for most people,
and needs zero setup. If you want Memory Book to also understand
*meaning*, not just exact words (so searching "auth flow" also finds a note
about "login process"), you can connect an embedding provider like OpenAI:

1. Open Settings, search for `Memory Book`.
2. Set `Embedding Provider` to `openai`.
3. Run **`Memory Book: Set Embedding API Key`** and paste your API key
   (it's stored securely, not in a plain settings file).
4. Run **`Memory Book: Backfill Embedding Vectors`** once, to catch up
   anything you saved before turning this on.

This is entirely optional — skip it and everything still works.

---

## Making sure Copilot uses *this* memory, not VS Code's built-in one

VS Code also ships its own, separate memory feature, which can cause
Copilot to save/search in two different places without you noticing. To
make sure it always uses Memory Book instead:

1. Open Settings (`Cmd+,` / `Ctrl+,`), search for `memory`, and turn off:
   - `Github › Copilot › Chat › Tools: Memory Enabled`
   - `Github › Copilot › Chat: Copilot Memory Enabled`
2. As a belt-and-braces check: in Copilot Chat, click the **tools icon**
   (wrench) in the chat box, and make sure the built-in "Memory" tool is
   unchecked while the `memory-book_*` tools are checked.

## FAQ / Troubleshooting

**"I saved something and now see a scrambled-looking JSON file — is that
normal?"** Yes — that's `.copilot-memory/project-memory.enc.json`, your
encrypted project notebook. It's *supposed* to look like nonsense; that's
the point. To read what's actually in it, don't open the file — run
`Memory Book: Show All Memories` instead, and VS Code will show it to
you in plain text.

**"Nothing happens when I save a file."** Check Settings → `Memory
Book` → `Auto Ingest On Save` is turned on, and that the file isn't
inside an ignored folder (`node_modules`, `.git`, build output, or common
secret files like `.env` are skipped on purpose).

**"Can Memory Book accidentally save a password or API key?"** It tries
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

- `memoryBook.maxContextItems` (default `5`) — how many memories Copilot
  pulls into context per search.
- `memoryBook.storageDir` (default: `~/.copilot-memory`) — where the
  global notebook lives.
- `memoryBook.projectMemoryKey` — deprecated plain-text fallback for the
  shared key; prefer the `Set Project Memory Key` command instead.
- `memoryBook.debug` (default `false`) — verbose logging in the "Memory Book" Output panel.
- `memoryBook.autoIngestOnSave` (default `true`)
- `memoryBook.autoIngestStrategy` (`selective` or `snapshot`, default
  `selective`) — selective saves short insights; snapshot saves a raw
  excerpt of the file.
- `memoryBook.autoIngestMaxChars`, `memoryBook.autoIngestMaxInsights`
- `memoryBook.autoIngestIgnoreGlobs` — file patterns never auto-saved;
  common secret files are included by default.
- `memoryBook.defaultSaveScope` (`project` or `global`, default
  `project`)
- `memoryBook.searchMode` (`sparse`, `hybrid-cloud`, `auto`, default
  `auto`) — `sparse` is plain keyword matching; `hybrid-cloud` adds the
  optional AI-powered search described above.
- `memoryBook.embeddingProvider`, `embeddingModel`, `embeddingBaseUrl`,
  `embeddingDimensions` — advanced, optional AI search config.
- `memoryBook.embeddingApiKey` — deprecated plain-text fallback; prefer
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
