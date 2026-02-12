# Contributing to Rolotabs

## Architecture

- **`extension/manifest.json`** — Manifest V3, Chrome 114+
- **`src/background.ts`** — Service worker: bookmark↔tab mapping, tab grouping, state management
- **`src/sidepanel.ts`** — Sidebar UI: three-zone rendering, drag-and-drop, context menus,
  edit-in-place
- **`src/lib/`** — Pure, testable modules: types, URL matching, state building, context menus, drop
  indicators
- **`extension/sidepanel.html/css`** — Sidebar markup and styles (CSS custom properties, light/dark
  themes)

Built with **Deno** (native TypeScript) + **esbuild** (~10ms builds). No frameworks.

## Setup

1. Install [Deno](https://deno.com/) (see `.tool-versions` for the expected version)
2. Build: `deno task build`
3. Open `chrome://extensions/`, enable **Developer mode**
4. Click **Load unpacked** and select the `extension/` folder
5. Click the Rolotabs icon to open the side panel

## Development

```sh
deno task build    # Bundle to extension/dist/
deno task dev      # Build in watch mode
deno task test     # Run tests
deno task fmt      # Format
deno task lint     # Lint
```

After changes, reload the extension at `chrome://extensions/` and reopen the side panel. The side
panel keeps stale JS, so closing and reopening it is important.

### Inspecting

- **Service worker:** Click the "service worker" link on the extension card at
  `chrome://extensions/`
- **Side panel:** Right-click inside the panel → Inspect

## Key design decisions

- **Bookmarks as source of truth** — no sync layer, no IndexedDB. Chrome bookmark sync handles
  cross-device.
- **Testable core** — all pure logic lives in `src/lib/` and is tested with Deno's test runner.
  Chrome API interactions stay in `src/background.ts` and `src/sidepanel.ts`.
- **No abstractions until they earn their place** — keep it simple.

## Versioning & releases

- **Canonical version:** `extension/manifest.json` → `"version"` field
- **Changelog:** `CHANGELOG.md` (Keep a Changelog format)
- Bump the version in `extension/manifest.json` and update `CHANGELOG.md` in the same commit
- Use semver: patch for bugfixes, minor for features, major for breaking changes
- Tag with `vX.Y.Z` and push — GitHub Actions builds and creates the release automatically

## File structure

```
build.ts               # esbuild script (TS → extension/dist/)
deno.json              # Deno config: tasks, fmt, lint, compiler options
src/
  background.ts        # Service worker (Chrome API glue)
  sidepanel.ts         # Side panel logic (rendering, events)
  lib/                 # Pure, testable modules
    types.ts           # Shared type definitions
    urls.ts            # URL comparison
    state.ts           # State management logic
    context-menu.ts    # Custom context menu
    drop-indicator.ts  # Drag-and-drop ghost indicators
    reorder.ts         # Array reorder utility
test/                  # Tests (deno test)
extension/             # Everything Chrome loads
  manifest.json        # Extension manifest
  sidepanel.html       # Side panel markup
  sidepanel.css        # Styles (CSS custom properties, light/dark)
  offscreen.html       # Offscreen document for clipboard
  icons/               # Extension icons (16, 32, 48, 128)
  dist/                # Built JS (gitignored)
chrome_extension/      # Design source assets (afdesign, promo templates, screenshots)
```
