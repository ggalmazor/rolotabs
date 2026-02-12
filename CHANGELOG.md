# Changelog

All notable changes to Rolotabs are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The canonical version lives in `manifest.json` (`"version"`).

## [0.9.0] — 2026-02-12

### Added
- **Keyboard shortcut:** `Alt+S` toggles the side panel. Customizable at
  `chrome://extensions/shortcuts`.

## [0.8.0] — 2026-02-12

### Added
- **Live favicons:** Zones 1 and 2 now show the tab's live favicon instead of
  the cached Chrome favicon API, updating in real time as pages load.
- **"Replace with current URL"** context menu option on bookmarks and pinned
  items — updates the bookmark to the tab's current page URL.
- **Draggable folders:** Folder headers can be dragged to reorder, move to root,
  or nest inside other folders.
- **Drop into collapsed folders:** Visual feedback (header highlight) when
  dragging onto a collapsed folder. Drops work regardless of folder state.
- **Zone 3 reordering:** Drag open tabs within zone 3 to reorder them
  (reorders actual Chrome tabs).
- **Navigated-away indicator:** Orange left border on bookmarks/pinned items
  when the tab has navigated away from the bookmarked URL.
- **Scroll to active tab:** The sidebar auto-scrolls to the focused tab on
  tab switch.
- **Peek in collapsed folders:** When the active tab is inside a collapsed
  folder, it peeks below the folder header without expanding the full folder.
- **Privacy policy** (`PRIVACY.md`).

### Changed
- **Tab association preserved on navigation:** Tabs that navigate away from
  their bookmarked URL stay associated instead of appearing as duplicates
  in zone 3.
- **Onboarding always shown** with a ✕ dismiss button; dismissal persisted
  in storage.
- **Zone 2 → Zone 3 drop indicators:** Inactive bookmarks show "delete
  bookmark" text ghost; active bookmarks show a positional ghost.
- **Default context menu suppressed** everywhere.
- **Updated icons.**

## [0.7.0] — 2026-02-12

### Added
- **Onboarding always shown:** Onboarding welcome message now appears regardless
  of bookmark state, with a ✕ close button. Dismissal persisted in storage.
- **Zone 3 reordering:** Drag open tabs within zone 3 to reorder them
  (reorders actual Chrome tabs via `chrome.tabs.move`).
- **Suppress default context menu:** Right-clicking anywhere without a custom
  menu no longer shows the browser's default context menu.

### Changed
- **Zone 2 → Zone 3 drop indicators:** Inactive bookmarks show a red "delete
  bookmark" text ghost fixed at top. Active bookmarks show a positional ghost
  for choosing placement order.
- **Updated icons.**

## [0.6.0] — 2026-02-12

### Added
- **Light theme:** Automatic via `prefers-color-scheme`. All hardcoded colors
  extracted to CSS custom properties.
- **Confirmation toasts:** Destructive bulk actions (close all above/below,
  close others, clear all, delete folder) now show a Yes/No toast instead
  of instant execution or `confirm()` dialogs.
- **Onboarding:** Welcome message with drag instructions for first-run users,
  auto-hides once items are pinned or bookmarked.
- **Custom rolodex icon:** Yellow/purple rolodex icon by M2n from Noun Project
  (CC BY 3.0) at all sizes (16, 32, 48, 128px).

## [0.5.0] — 2026-02-11

### Changed
- **Folder icons:** Replaced tree chevrons with 📁 (collapsed) / 📂 (expanded)
  folder emojis.
- **Pinned favicon size:** Now 32×32px in a 40px grid (increased in v0.3.0).
- **README rewritten:** Updated architecture, features, setup, and roadmap
  to reflect current state.

### Added
- **Edit in place:** Double-click folder names to rename inline. Context menu
  "Rename" also uses inline editing for both bookmarks and folders.
- **Instant folder creation:** "Add folder" button and context menu create
  a "New folder" immediately and enter edit mode. No more `prompt()` dialogs.
- **Create folder button** on the zone 1/2 divider.
- **Clear all button** on the zone 2/3 divider to close all open tabs.

### Removed
- All `prompt()` dialog usage — replaced by edit-in-place.
- Double-click to rename bookmarks (only folders support double-click rename;
  bookmarks use the context menu).

## [0.4.0] — 2026-02-11

### Added
- **Zone 3 context menu:** Right-click open tabs for Pin, Bookmark, Close tab,
  Close all above, Close all below, Close other tabs. Contextual items hidden
  when not applicable (e.g. "Close all above" on first tab).
- **Auto-ungroup inherited tabs:** New tabs opened from pinned/bookmarked tabs
  are automatically removed from managed tab groups since they belong in zone 3.

### Fixed
- **Tab group titles/icons disappearing:** Groups now always re-apply title
  and color when tabs are added. Removed race condition where Chrome's async
  group assignment triggered premature ungrouping.

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
