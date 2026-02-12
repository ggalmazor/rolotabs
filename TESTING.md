# Testing Guide

No automated tests yet — all testing is manual in Chrome.

## Setup

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked** → select the `rolotabs/` project folder
4. Note the extension ID shown on the card (you'll see it in error URLs)

## Opening the side panel

Click the Rolotabs icon in the toolbar. The side panel should open on the right side of the browser.

If the icon isn't visible, click the puzzle piece (Extensions menu) and pin Rolotabs.

## Reloading after changes

1. Go to `chrome://extensions/`
2. Click the ↻ refresh icon on the Rolotabs card
3. Close and reopen the side panel (important — the old panel keeps stale JS)

**Tip:** Keep `chrome://extensions/` pinned in a tab while developing.

## Test cases

### Folder structure creation

- [ ] On first install, check `Other Bookmarks` → a `Rolotabs` folder should exist with `Pinned` and
      `Tabs` subfolders
- [ ] Uninstall and reinstall — folders should be reused, not duplicated

### Zone 1 — Pinned grid

- [ ] Drag an unlinked tab onto the pinned grid → bookmark is created in `Rolotabs/Pinned/`
- [ ] Click a pinned item with no open tab → tab opens, favicon becomes bright, green dot appears
- [ ] Click a pinned item with an existing tab → that tab is focused (no duplicate created)
- [ ] Close the tab externally (not via Rolotabs) → pinned item goes dim, dot turns grey
- [ ] Right-click a pinned item → prompt dialog offers Remove/Rename

### Zone 2 — Bookmarked tabs

- [ ] Drag an unlinked tab onto the tabs list → bookmark created in `Rolotabs/Tabs/`
- [ ] Click a bookmarked tab (unloaded) → tab opens and associates
- [ ] Click a bookmarked tab (loaded) → existing tab focuses
- [ ] × button on a loaded tab → closes the Chrome tab, bookmark stays (item goes dim)
- [ ] × button on an unloaded tab → removes the bookmark entirely
- [ ] Create a subfolder in `Rolotabs/Tabs/` via Chrome's bookmark manager → it should appear as a
      collapsible folder in zone 2
- [ ] Click folder header → toggles collapse; state persists across panel close/reopen

### Zone 3 — Unlinked tabs

- [ ] Open a new tab (e.g., `example.com`) → appears in the unlinked zone
- [ ] `chrome://` and extension pages should NOT appear in unlinked
- [ ] Click an unlinked tab → focuses that tab
- [ ] × button on an unlinked tab → closes the Chrome tab
- [ ] Zone 3 header says "Today" and hides entirely when no unlinked tabs exist

### Drag and drop

- [ ] Drag unlinked → pinned grid: promotes to bookmark in Pinned folder
- [ ] Drag unlinked → tabs list: promotes to bookmark in Tabs folder
- [ ] Drag unlinked → a folder's children area: promotes into that specific folder
- [ ] Drag bookmark from tabs → pinned: moves bookmark to Pinned folder
- [ ] Drag bookmark from pinned → tabs: moves bookmark to Tabs folder
- [ ] Drop zones highlight during drag (subtle accent background)

### Active tab tracking

- [ ] Switch between tabs → the active one shows highlighted background in whichever zone it belongs
      to
- [ ] Switch to a tab in another window → side panel should still update (may need to reopen panel)

### External changes

- [ ] Add a bookmark to `Rolotabs/Tabs/` via Chrome's bookmark manager → appears in zone 2
- [ ] Delete a bookmark via Chrome's bookmark manager → disappears from side panel
- [ ] Move a bookmark between `Pinned` and `Tabs` via bookmark manager → reflected in panel

### Edge cases

- [ ] Open 20+ tabs → unlinked zone should list them all (zone 2 scrolls, zone 3 is at the bottom)
- [ ] Bookmark the same URL twice in Rolotabs → only the first should associate with the open tab
- [ ] Open a URL that matches a bookmark, then navigate away → association should break
- [ ] Service worker idle restart: close the side panel, wait a minute, reopen → state should
      rebuild correctly

## Inspecting the service worker

1. On `chrome://extensions/`, click **service worker** link on the Rolotabs card
2. DevTools opens for the background script — check Console for errors
3. The side panel has its own DevTools: right-click inside the panel → Inspect

## Common issues

- **Side panel won't open:** Make sure `sidePanel` permission is in manifest and Chrome ≥ 114
- **Favicons are broken:** The `favicon` permission is required; also favicons only load after the
  page has been visited at least once in Chrome's history
- **State feels stale:** The service worker may have restarted — check if `init()` ran (log in
  console)
