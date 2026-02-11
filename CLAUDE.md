# CLAUDE.md — Rolotabs

## What is this?

Rolotabs is a Chrome extension (Manifest V3) that reimagines bookmarks as a persistent sidebar tab manager. All state is stored as Chrome bookmarks — no opaque extension storage.

## Architecture

- **`background.js`** — Service worker. Manages bookmark folder structure (`Other Bookmarks/Rolotabs/{Pinned,Tabs}/`), handles Chrome events (tabs, bookmarks), serves state to the side panel via `chrome.runtime.onMessage`. Imports pure logic from `lib/`.
- **`sidepanel.{html,css,js}`** — The sidebar UI rendered in Chrome's Side Panel API. Three zones: Pinned (icon grid), Bookmarked tabs (hierarchical list), Unlinked (ephemeral tabs). Drag-and-drop between zones.
- **`lib/`** — Pure, testable modules extracted from the extension code:
  - `lib/urls.js` — URL comparison utilities
  - `lib/state.js` — State management: association building, tree annotation, filtering
- **`test/`** — Tests using Node's built-in test runner (`node:test`)
- **`manifest.json`** — Manifest V3 definition. Permissions: bookmarks, tabs, sidePanel, favicon, storage.

## Key design decisions

- **Bookmarks as source of truth** — no sync layer, no IndexedDB; Chrome bookmark sync handles cross-device.
- **Vanilla JS, no build step** — edit files, reload extension. No framework, no bundler.
- **Dark theme only** (for now) — CSS custom properties in `:root`.
- **Testable core** — all pure logic lives in `lib/` and is tested outside Chrome. Chrome API interactions stay in `background.js`/`sidepanel.js`.

## TDD workflow — MANDATORY

**Every change follows Red → Green → Refactor:**

1. **Write the failing test first.** No production code without a test that demands it.
2. **Run `npm test`** — confirm the test fails for the right reason.
3. **Write the minimum code** to make the test pass.
4. **Run `npm test`** — confirm all tests pass.
5. **Refactor** if needed, keeping tests green.
6. **Commit.** Tests must pass before every commit.

### What to test

- **All pure logic in `lib/`** — URL matching, state building, tree operations, filtering. These are easy and valuable.
- **Message handler logic** — extract into testable functions when adding new message types.
- **Edge cases first** — null inputs, empty arrays, duplicate URLs, circular references. These are where bugs hide.

### What NOT to test (for now)

- Chrome API calls directly (`chrome.bookmarks.*`, `chrome.tabs.*`) — these are integration-level and need a real browser.
- DOM rendering in `sidepanel.js` — visual testing is manual until we add a UI test framework.
- CSS — manual visual inspection.

### Running tests

```sh
npm test              # run all tests once
npm run test:watch    # watch mode (re-runs on file changes)
```

### Test file conventions

- Test files go in `test/` and match `*.test.js`
- Mirror the `lib/` structure: `lib/urls.js` → `test/urls.test.js`
- Use `describe`/`it` from `node:test` and `assert` from `node:assert/strict`
- Test names should read as sentences: `it("returns null for empty URL")`

## Development workflow

1. Load unpacked at `chrome://extensions/` (Developer mode)
2. Write a test, see it fail
3. Write the code, see it pass
4. Click refresh on the extension card, reopen side panel for manual verification
5. Commit when tests are green

## Code style

- Plain ES modules / modern JS (async/await, Map, Set)
- Semicolons — used consistently throughout
- Functions are plain `async function name()` style, not arrow-assigned
- Keep it simple: no abstractions until they earn their place
- Extract pure logic into `lib/` — Chrome API glue stays in the top-level files

## File structure

```
manifest.json          # Extension manifest
package.json           # Scripts (test, test:watch)
background.js          # Service worker (Chrome API glue)
sidepanel.html         # Side panel markup
sidepanel.js           # Side panel logic (rendering, events)
sidepanel.css          # Styles (dark theme, CSS vars)
lib/                   # Pure, testable modules
  urls.js              # URL comparison
  state.js             # State management logic
test/                  # Tests (node:test)
  urls.test.js
  state.test.js
icons/                 # Extension icons (16, 32, 48, 128)
```

## Roadmap (from README)

- [x] Phase 1: Three-zone sidebar with bookmark-backed state
- [ ] Phase 2: Drag-and-drop reordering within zones
- [ ] Phase 3: Custom context menus, keyboard shortcuts, command bar
- [ ] Phase 4: Peek overlay for external links from pinned tabs
- [ ] Polish: Animations, theme support, onboarding

## Things to watch out for

- `chrome.bookmarks.getTree()` returns "Other Bookmarks" with inconsistent casing across platforms — code handles both.
- Service worker can go idle; `init()` is called at top level to handle wake-ups.
- `isUnderRoot()` walks up the bookmark tree — has a depth guard (maxDepth=20) to prevent infinite loops.
- Context menu currently uses `prompt()` — placeholder, needs a proper custom menu (Phase 3).
- URL matching (`urlsMatch`) strips trailing slashes and fragments but keeps query strings.
- Bug found by tests: `annotateNode` would mark unloaded bookmarks as "active" when `activeTabId` was null — fixed with null guard.
