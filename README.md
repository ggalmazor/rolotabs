# Rolotabs

Your browsing rolodex — bookmarks that come alive as tabs.

Rolotabs is a Chrome extension that turns your bookmarks into a persistent, always-visible sidebar. Each bookmark becomes a slot that can be loaded (with a live tab) or unloaded (icon stays, tab is gone). Clicking always focuses the existing tab or opens a new one — never duplicates.

## How it works

The sidebar has three zones:

| Zone | What | Where |
|------|-------|-------|
| **Pinned** | Compact icon grid of your most-used sites | Top |
| **Bookmarks** | Hierarchical tree with collapsible folders | Middle |
| **Open Tabs** | Tabs that aren't bookmarked yet | Bottom |

Drag tabs between zones to organize them. All data is stored as regular Chrome bookmarks — synced across devices automatically.

## Features

- **Click to focus or open** — never duplicates tabs
- **Drag and drop** — between all zones, onto folders, reorder within zones
- **Tab groups** — automatic Chrome tab grouping (📌 Pinned, 📚 Bookmarks)
- **Right-click menus** — pin, bookmark, rename, close, delete, manage folders
- **Inline editing** — double-click folder names to rename
- **Light & dark theme** — follows your system preference

## Install

1. Go to the [latest release](https://github.com/ggalmazor/rolotabs/releases/latest)
2. Download `rolotabs-v*.zip`
3. Unzip the file somewhere permanent (don't delete the folder after loading)
4. Open `chrome://extensions/` in Chrome
5. Enable **Developer mode** (toggle in the top right)
6. Click **Load unpacked** and select the unzipped folder
7. Click the Rolotabs icon in the toolbar to open the side panel

> **Tip:** If the icon isn't visible, click the puzzle piece (Extensions menu) and pin Rolotabs.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+S** | Toggle the side panel |
| **Alt+C** | Copy the current tab's URL to clipboard |

To customize shortcuts:

1. Go to `chrome://extensions/shortcuts`
2. Find **Rolotabs**
3. Click the pencil icon next to any shortcut
4. Press your preferred key combination

### Updating

To update, download the new zip, replace the files in the same folder, and click the ↻ refresh icon on the Rolotabs card at `chrome://extensions/`.

## Privacy & Security

Rolotabs does not collect, transmit, or share any user data. All data stays on your device as regular Chrome bookmarks and local storage. No analytics, no tracking, no remote code.

See the full [Privacy Policy](PRIVACY.md).

## License

MIT
