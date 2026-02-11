# CLAUDE.md — Rolotabs

## What is this?

Rolotabs is a Chrome extension (Manifest V3) that reimagines bookmarks as a persistent sidebar tab manager. All state is stored as Chrome bookmarks — no opaque extension storage.

## Architecture

- **`background.js`** — Service worker. Manages bookmark folder structure (`Other Bookmarks/Rolotabs/{Pinned,Tabs}/`), maintains in-memory `bookmarkId↔tabId` map, handles all Chrome events (tabs, bookmarks), serves state to the side panel via `chrome.runtime.onMessage`.
- **`sidepanel.{html,css,js}`** — The sidebar UI rendered in Chrome's Side Panel API. Three zones: Pinned (icon grid), Bookmarked tabs (hierarchical list), Unlinked (ephemeral tabs). Drag-and-drop between zones.
- **`manifest.json`** — Manifest V3 definition. Permissions: bookmarks, tabs, sidePanel, favicon, storage.

## Key design decisions

- **Bookmarks as source of truth** — no sync layer, no IndexedDB; Chrome bookmark sync handles cross-device.
- **Vanilla JS, no build step** — edit files, reload extension. No framework, no bundler.
- **Dark theme only** (for now) — CSS custom properties in `:root`.

## Development workflow

1. Load unpacked at `chrome://extensions/` (Developer mode)
2. Edit files
3. Click refresh on the extension card, reopen side panel
4. No tests yet — manual testing in Chrome

## Code style

- Plain ES modules / modern JS (async/await, Map, Set)
- No semicolons? **Yes semicolons** — the existing code uses them consistently
- Functions are plain `async function name()` style, not arrow-assigned
- Keep it simple: no abstractions until they earn their place

## File structure

```
manifest.json          # Extension manifest
background.js          # Service worker
sidepanel.html         # Side panel markup
sidepanel.js           # Side panel logic
sidepanel.css          # Styles (dark theme, CSS vars)
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
- `isUnderRoot()` walks up the bookmark tree — could be slow with deep nesting; fine for now.
- Context menu currently uses `prompt()` — placeholder, needs a proper custom menu (Phase 3).
- URL matching (`urlsMatch`) strips trailing slashes and fragments but keeps query strings.
