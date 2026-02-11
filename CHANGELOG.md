# Changelog

All notable changes to Rolotabs are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The canonical version lives in `manifest.json` (`"version"`).

## [0.3.0] — 2026-02-11

### Changed
- **Pinned favicon size:** Zone 1 icons enlarged to 32×32px (from 16×16)
  with wider grid cells (40px) for better visibility.
- **Danger drop ghost at top:** When dragging an inactive bookmark to zone 3,
  the 🗑 delete indicator now appears at the top of the zone.
- **Empty-state text hides during drag:** "Drag tabs here to pin/bookmark"
  placeholders fully disappear (text + space) when dragging, replaced by
  the ghost drop indicator only.
- **Removed zone 2 bottom padding** (was 30px).

### Added
- **Ghost drop indicators:** All drag-and-drop interactions now show contextual
  ghost elements instead of highlight-based feedback.
- **Unbookmark ghost:** Dragging an active bookmarked tab from zone 2 to
  zone 3 shows a blue 📂✕ ghost (distinct from the red 🗑 for deletions).
- **Zone-specific drag-over highlights** with differentiated colors and
  opacity per context.
- **Phase 2 drag-and-drop reordering** within zones.

### Fixed
- Drop indicator stacking from re-render.
- Zone 3 intercepting drags from its own items.
- Drag breaking when empty-state elements were hidden (min-height fallback).

## [0.2.0] — 2026-02-11

### Changed
- **Full bookmark tree:** Zone 2 now shows the browser's entire bookmark
  hierarchy instead of a special `Rolotabs/` folder. The extension works
  with bookmarks as-is.
- **Pinned state decoupled from folders:** Zone 1 pinned status is tracked
  in `chrome.storage.local` as an ordered list of bookmark IDs. Pinning
  moves the bookmark to the root (Other Bookmarks) folder.
- **Zone 3 label** changed from "Today" to "Open Tabs".

### Added
- **Tab groups:** Tabs opened via Rolotabs are auto-grouped in Chrome's
  tab strip — `📌 Pinned` (blue, leftmost) and `📚 Bookmarks` (grey, second).
  Groups reposition automatically and follow pin/unpin/unbookmark actions.
- **Folder management:** Create, rename, and delete bookmark folders via
  context menus (right-click folder headers or empty space in zone 2).
- **Drag and drop within zone 2:** Move bookmarks between folders by
  dragging onto folder headers.
- **Unbookmark via drag:** Drag a bookmark from zone 1/2 to zone 3 to
  remove the bookmark, keep the tab open, and ungroup it.
- **Custom context menus:** Floating dark-themed menus replace `prompt()`
  dialogs. Icons, separators, danger-styled destructive actions. Dismiss
  on click-outside or Escape.
- **Zone 3 drop target visibility:** "Drop here to unbookmark" appears
  during drag even when zone 3 is empty.
- **Empty state placeholder** in zone 2 for drag targeting.

### Fixed
- Duplicate drop events from stacking event listeners on re-render.
- Promoted tab association lost by async `onCreated` listener race.
- Zone 3 visibility toggle (classList vs inline style).
- `annotateNode` marking unloaded bookmarks as active when `activeTabId`
  was null.

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
