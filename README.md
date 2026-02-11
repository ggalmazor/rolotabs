# Rolotabs

Your browsing rolodex — bookmarks that come alive as tabs.

Rolotabs is a Chrome extension that reimagines bookmarks as a persistent, always-visible sidebar. Each bookmark becomes a slot that can be loaded (with a live Chrome tab) or unloaded (icon stays, tab is gone). Clicking always focuses the existing tab or creates one. Never duplicates.

## Concept

The sidebar has three zones:

**Zone 1 — Pinned (top):** A compact icon grid of your most-used sites. 32×32px favicons, always visible, zero friction.

**Zone 2 — Bookmarks (middle):** A hierarchical tree with collapsible folders (📁/📂). Your organized workspace. Supports drag-and-drop reordering and folder management.

**Zone 3 — Open Tabs (bottom):** Tabs that aren't bookmarked yet. Drag them up to promote into Zone 1 or 2, or right-click for quick actions.

All data is stored as regular Chrome bookmarks — synced across devices for free, visible in Chrome's bookmark manager. Pinned state is tracked in `chrome.storage.local`.

## Features

- **Bookmark↔tab association:** Click a bookmark to focus its tab or open a new one. Never duplicates.
- **Drag and drop:** Between all zones, onto folder headers, reorder within zones. Drag to Zone 3 to unbookmark.
- **Tab groups:** Automatic Chrome tab grouping — 📌 Pinned (blue) and 📚 Bookmarks (grey). Child tabs from grouped parents are auto-ungrouped.
- **Context menus:** Right-click anything for contextual actions (pin, bookmark, rename, close, delete, folder management).
- **Edit in place:** Double-click folder names to rename. "Add folder" creates and enters edit mode instantly.
- **Folder management:** Create, rename, delete folders via context menus or the "add folder" button.
- **Zone 3 actions:** Pin, bookmark, close tab, close all above/below, close other tabs.
- **Visual drag feedback:** Ghost drop indicators per context (📂✕ for unbookmark, 🗑 for delete).

## Architecture

- **`manifest.json`** — Manifest V3, Chrome 114+
- **`src/background.ts`** — Service worker: bookmark↔tab mapping, tab grouping, state management
- **`src/sidepanel.ts`** — Sidebar UI: three-zone rendering, drag-and-drop, context menus, edit-in-place
- **`src/lib/`** — Pure logic: types, URL matching, state building, context menus, drop indicators
- **`sidepanel.html/css`** — Sidebar markup and dark theme styles

Built with **Deno 2.6.4** (native TypeScript) + **esbuild** (~10ms builds). No frameworks.

## Setup

1. Clone this repo
2. Install [Deno](https://deno.com/) (see `.tool-versions`)
3. Build: `deno task build`
4. Open `chrome://extensions/`, enable **Developer mode**
5. Click **Load unpacked** and select this project folder
6. Click the Rolotabs icon to open the side panel

## Development

```sh
deno task build    # Bundle to dist/ (~10ms)
deno task test     # Run tests (10 suites, 46 steps)
deno fmt           # Format
deno lint          # Lint
```

After changes, reload the extension at `chrome://extensions/` and reopen the side panel.

## Roadmap

- [x] **Phase 1:** Three-zone sidebar with bookmark-backed state
- [x] **Phase 2:** Drag-and-drop reordering within and between zones
- [x] **Phase 3:** Context menus, edit-in-place, folder management UI
- [x] **Phase 4:** Tab grouping with auto-positioning and child tab ungrouping
- [ ] **Phase 5:** Polish — animations, theme support, onboarding

## Credits

Icon: [rolodex](https://thenounproject.com/browse/icons/term/rolodex/) by M2n from [Noun Project](https://thenounproject.com/browse/icons/term/rolodex/) (CC BY 3.0)

## License

MIT
