# CLAUDE.md — Rolotabs

## What is this?

Rolotabs is a Chrome extension (Manifest V3) that reimagines bookmarks as a persistent sidebar tab
manager. All state is stored as Chrome bookmarks — no opaque extension storage.

## Architecture

- **`background.js`** — Service worker. Manages bookmark folder structure
  (`Other Bookmarks/Rolotabs/{Pinned,Tabs}/`), handles Chrome events (tabs, bookmarks), serves state
  to the side panel via `chrome.runtime.onMessage`. Imports pure logic from `lib/`.
- **`sidepanel.{html,css,js}`** — The sidebar UI rendered in Chrome's Side Panel API. Three zones:
  Pinned (icon grid), Bookmarked tabs (hierarchical list), Unlinked (ephemeral tabs). Drag-and-drop
  between zones.
- **`lib/`** — Pure, testable modules extracted from the extension code:
  - `lib/urls.js` — URL comparison utilities
  - `lib/state.js` — State management: association building, tree annotation, filtering
- **`test/`** — Tests using Node's built-in test runner (`node:test`)
- **`manifest.json`** — Manifest V3 definition. Permissions: bookmarks, tabs, sidePanel, favicon,
  storage.

## Versioning

- **Canonical version:** `manifest.json` → `"version"` field
- **Changelog:** `CHANGELOG.md` (Keep a Changelog format)
- Bump the version in `manifest.json` when releasing. Update `CHANGELOG.md` in the same commit.
- Use semver: patch for bugfixes, minor for features, major for breaking changes.

## Key design decisions

- **Bookmarks as source of truth** — no sync layer, no IndexedDB; Chrome bookmark sync handles
  cross-device.
- **TypeScript + Deno** — native TS, no tsconfig needed. esbuild bundles to plain JS for Chrome.
- **Dark theme only** (for now) — CSS custom properties in `:root`.
- **Testable core** — all pure logic lives in `src/lib/` and is tested with Deno's test runner.
  Chrome API interactions stay in `src/background.ts`/`src/sidepanel.ts`.

## TDD workflow — MANDATORY

**Every change follows Red → Green → Refactor:**

1. **Write the failing test first.** No production code without a test that demands it.
2. **Run `npm test`** — confirm the test fails for the right reason.
3. **Write the minimum code** to make the test pass.
4. **Run `npm test`** — confirm all tests pass.
5. **Refactor** if needed, keeping tests green.
6. **Commit.** Tests must pass before every commit.

### What to test

- **All pure logic in `lib/`** — URL matching, state building, tree operations, filtering. These are
  easy and valuable.
- **Message handler logic** — extract into testable functions when adding new message types.
- **Edge cases first** — null inputs, empty arrays, duplicate URLs, circular references. These are
  where bugs hide.

### What NOT to test (for now)

- Chrome API calls directly (`chrome.bookmarks.*`, `chrome.tabs.*`) — these are integration-level
  and need a real browser.
- DOM rendering in `sidepanel.js` — visual testing is manual until we add a UI test framework.
- CSS — manual visual inspection.

### Running tests

```sh
deno task test         # run all tests once
deno test --watch      # watch mode (re-runs on file changes)
deno task check        # type-check all source files
deno task build        # bundle TS → dist/ (for Chrome)
deno task dev          # build in watch mode
deno task fmt          # format source
deno task lint         # lint source
```

### Test file conventions

- Test files go in `test/` and match `*_test.ts` (Deno convention: underscores, not dots)
- Mirror the `src/lib/` structure: `src/lib/urls.ts` → `test/urls_test.ts`
- Use `describe`/`it` from `jsr:@std/testing/bdd` and `assertEquals` from `jsr:@std/assert`
- Test names should read as sentences: `it("returns null for empty URL")`

## Development workflow

1. Run `deno task dev` (esbuild watch mode — rebuilds in ~5ms on save)
2. Load unpacked at `chrome://extensions/` pointing to the project root
3. Write a test, see it fail
4. Write the code, see it pass
5. Click refresh on the extension card, reopen side panel for manual verification
6. Commit when tests are green

## Code style

- TypeScript with strict mode
- Deno-style imports: explicit `.ts` extensions, `jsr:` / `npm:` specifiers
- Semicolons — used consistently throughout
- Functions are plain `async function name()` style, not arrow-assigned
- Keep it simple: no abstractions until they earn their place
- Extract pure logic into `src/lib/` — Chrome API glue stays in `src/background.ts` and
  `src/sidepanel.ts`
- Use `deno fmt` for formatting, `deno lint` for linting

## File structure

```
manifest.json          # Extension manifest (points to dist/)
deno.json              # Deno config: tasks, fmt, lint, compiler options
build.ts               # esbuild script (TS → dist/)
sidepanel.html         # Side panel markup (loads dist/sidepanel.js)
sidepanel.css          # Styles (dark theme, CSS vars)
src/                   # TypeScript source
  background.ts        # Service worker (Chrome API glue)
  sidepanel.ts         # Side panel logic (rendering, events)
  lib/                 # Pure, testable modules
    types.ts           # Shared type definitions
    urls.ts            # URL comparison
    state.ts           # State management logic
test/                  # Tests (deno test)
  urls_test.ts
  state_test.ts
dist/                  # Built JS for Chrome (gitignored)
icons/                 # Extension icons (16, 32, 48, 128)
```

## Roadmap (from README)

- [x] Phase 1: Three-zone sidebar with bookmark-backed state
- [ ] Phase 2: Drag-and-drop reordering within zones
- [ ] Phase 3: Custom context menus, keyboard shortcuts, command bar
- [ ] Phase 4: Peek overlay for external links from pinned tabs
- [ ] Polish: Animations, theme support, onboarding

## Things to watch out for

- `chrome.bookmarks.getTree()` returns "Other Bookmarks" with inconsistent casing across platforms —
  code handles both.
- Service worker can go idle; `init()` is called at top level to handle wake-ups.
- `isUnderRoot()` walks up the bookmark tree — has a depth guard (maxDepth=20) to prevent infinite
  loops.
- Context menu currently uses `prompt()` — placeholder, needs a proper custom menu (Phase 3).
- URL matching (`urlsMatch`) strips trailing slashes and fragments but keeps query strings.
- Bug found by tests: `annotateNode` would mark unloaded bookmarks as "active" when `activeTabId`
  was null — fixed with null guard.
- Chrome types come from `npm:chrome-types` via `/// <reference types="..." />` in the extension
  source files.
- esbuild bundles to IIFE format targeting Chrome 114+ — no ES module loading in service workers.
