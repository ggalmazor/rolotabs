# Rolotabs

Your browsing rolodex — bookmarks that come alive as tabs.

Rolotabs is a Chrome extension that reimagines bookmarks as a persistent, always-visible sidebar. Each bookmark becomes an "extension tab" — a slot that can be loaded (with a live Chrome tab) or unloaded (icon stays, tab is gone). Clicking always focuses the existing tab or creates one. Never duplicates.

## Concept

The sidebar has three zones:

**Zone 1 — Pinned (top):** A 3-column icon grid of your most-used sites. Always visible, zero friction. Stored in `Other Bookmarks / Rolotabs / Pinned /`.

**Zone 2 — Bookmarked tabs (middle):** A hierarchical list with folders. Your organized workspace. Stored in `Other Bookmarks / Rolotabs / Tabs /`.

**Zone 3 — Unlinked (bottom):** Ephemeral tabs that aren't bookmarked yet. Drag them up to promote into Zone 1 or 2.

All data is stored as regular Chrome bookmarks — synced across devices for free, visible in Chrome's bookmark manager, and never locked into opaque extension storage.

## Architecture

- **`manifest.json`** — Manifest V3 extension definition
- **`background.js`** — Service worker that manages the bookmark↔tab mapping, listens to tab/bookmark events, and serves state to the side panel
- **`sidepanel.html/css/js`** — The sidebar UI rendered in Chrome's Side Panel

The core data flow:
1. Bookmarks in the `Rolotabs/` folder are the source of truth
2. The service worker maintains a `Map<bookmarkId, tabId | null>` in memory
3. On every tab/bookmark event, the map is updated and the side panel is notified
4. The side panel renders bookmarks annotated with their tab status (loaded/unloaded/active)

## Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked** and select this project folder
4. Click the Rolotabs icon in the toolbar to open the side panel

## Development

This is a vanilla JS project with no build step — edit files and reload the extension.

To reload after changes:
- Go to `chrome://extensions/`
- Click the refresh icon on the Rolotabs card
- Close and reopen the side panel

## Roadmap

- [x] Phase 1: Three-zone sidebar with bookmark-backed state
- [ ] Phase 2: Drag-and-drop reordering within zones
- [ ] Phase 3: Custom context menus, keyboard shortcuts, command bar
- [ ] Phase 4: Peek overlay for external links from pinned tabs
- [ ] Polish: Animations, theme support, onboarding

## License

MIT
