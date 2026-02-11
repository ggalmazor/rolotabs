# Changelog

All notable changes to Rolotabs are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The canonical version lives in `manifest.json` (`"version"`).

## [0.1.0] — 2026-02-11

First working release.

### Added
- **Three-zone sidebar** in Chrome's Side Panel API
  - **Zone 1 (Pinned):** compact icon grid of pinned bookmarks. Pinned state
    tracked in `chrome.storage.local`, independent of bookmark folder structure.
  - **Zone 2 (Bookmarks):** hierarchical view of the browser's full bookmark
    tree with collapsible folders. Loaded tabs highlighted, active tab accented.
  - **Zone 3 (Open Tabs):** open tabs not matching any bookmark. Hidden when empty.
- **Bookmark↔tab association:** clicking a bookmark focuses an existing matching
  tab or opens a new one. Never duplicates.
- **Drag and drop:**
  - Open tab → Zone 1: creates bookmark + pins it
  - Open tab → Zone 2: creates bookmark (at root or in a specific folder)
  - Bookmark → Zone 1: pins it (moves to root)
  - Pinned → Zone 2: unpins it
  - Bookmark → folder header: moves into that folder
- **Folder management:** create, rename, and delete folders via context menu
  (right-click folder headers or empty space in zone 2).
- **Custom context menus:** floating dark-themed menus with icons and
  danger-styled destructive actions. Dismiss on click-outside or Escape.
- **Bookmark context menu:** pin to top, rename, delete.
- **Pinned context menu:** unpin, delete.
- Dark theme with CSS custom properties.
- Favicon display with fallback on load error.
- Debounced side panel notifications (50ms batching).
- TypeScript source (Deno 2.6.4) with esbuild bundling (~10ms builds).
- 38 unit tests via Deno's built-in test runner.
- TDD workflow documented in CLAUDE.md.
