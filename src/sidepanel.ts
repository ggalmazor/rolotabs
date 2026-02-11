/// <reference types="npm:chrome-types" />

// Rolotabs — Side Panel UI
// Renders the three-zone sidebar and handles user interactions.

import type { AnnotatedBookmark, OpenTab, PanelState } from "./lib/types.ts";

let state: PanelState | null = null;
let collapsedFolders = new Set<string>();

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const stored = await chrome.storage.local.get("collapsedFolders");
  if (stored.collapsedFolders) {
    collapsedFolders = new Set(stored.collapsedFolders as string[]);
  }

  state = await sendMessage({ type: "getState" }) as PanelState;
  render();
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === "stateUpdated") {
    refreshState();
  }
});

async function refreshState(): Promise<void> {
  state = await sendMessage({ type: "getState" }) as PanelState;
  if (state) render();
}

function sendMessage(message: { type: string; [key: string]: unknown }): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(): void {
  if (!state) return;
  renderPinned(state.pinned);
  renderBookmarks(state.bookmarks);
  renderOpenTabs(state.openTabs);
}

// ----- Zone 1: Pinned grid -----

function renderPinned(pinned: AnnotatedBookmark[]): void {
  const grid = document.getElementById("pinned-grid")!;
  grid.innerHTML = "";

  if (pinned.length === 0) {
    grid.innerHTML = '<div class="pinned-grid-empty">Drag tabs here to pin</div>';
    setupDropZone(grid, "pinned");
    return;
  }

  for (const item of pinned) {
    if (item.isFolder) continue;

    const el = document.createElement("div");
    el.className = "pinned-item";
    if (item.isLoaded) el.classList.add("is-loaded");
    if (item.isActive) el.classList.add("is-active");
    el.title = item.title;
    el.dataset.bookmarkId = item.id;

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = faviconUrl(item.url);
    img.alt = "";
    img.onerror = () => { img.src = "icons/icon16.png"; };

    const dot = document.createElement("div");
    dot.className = "status-dot";

    el.appendChild(img);
    el.appendChild(dot);

    el.addEventListener("click", () => activateBookmark(item.id));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      onPinnedContext(e, item);
    });

    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer!.setData(
        "application/rolotabs",
        JSON.stringify({ type: "bookmark", bookmarkId: item.id }),
      );
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    grid.appendChild(el);
  }

  setupDropZone(grid, "pinned");
}

// ----- Zone 2: All bookmarks -----

function renderBookmarks(roots: AnnotatedBookmark[]): void {
  const list = document.getElementById("tabs-list")!;
  list.innerHTML = "";

  for (const root of roots) {
    if (root.children) {
      for (const child of root.children) {
        if (child.isFolder) {
          list.appendChild(renderFolder(child));
        } else {
          list.appendChild(renderTabItem(child));
        }
      }
    }
  }

  // Right-click on zone 2 background to create folder
  list.addEventListener("contextmenu", (e) => {
    if ((e.target as HTMLElement).closest(".tab-item, .folder-header")) return;
    e.preventDefault();
    const name = prompt("New folder name:");
    if (name && state?.rootFolderId) {
      sendMessage({ type: "createFolder", parentId: state.rootFolderId, title: name }).then(() => refreshState());
    }
  });

  setupDropZone(list, "bookmarks");
}

function renderFolder(folder: AnnotatedBookmark): HTMLElement {
  const container = document.createElement("div");
  container.className = "folder-item";

  const isCollapsed = collapsedFolders.has(folder.id);

  const header = document.createElement("div");
  header.className = "folder-header";

  const arrow = document.createElement("span");
  arrow.className = `folder-arrow ${isCollapsed ? "collapsed" : ""}`;
  arrow.textContent = "▼";

  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = folder.title;

  header.appendChild(arrow);
  header.appendChild(name);

  header.addEventListener("click", () => toggleFolder(folder.id));
  header.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    onFolderContext(e, folder);
  });

  // Folder header is a drop target for moving bookmarks into it
  header.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = "move";
    header.classList.add("drag-over");
  });
  header.addEventListener("dragleave", () => {
    header.classList.remove("drag-over");
  });
  header.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    header.classList.remove("drag-over");
    await handleDropOnFolder(e, folder.id);
  });

  container.appendChild(header);

  const children = document.createElement("div");
  children.className = `folder-children ${isCollapsed ? "collapsed" : ""}`;
  children.dataset.folderId = folder.id;

  if (folder.children) {
    for (const child of folder.children) {
      if (child.isFolder) {
        children.appendChild(renderFolder(child));
      } else {
        children.appendChild(renderTabItem(child));
      }
    }
  }

  container.appendChild(children);

  return container;
}

function renderTabItem(item: AnnotatedBookmark): HTMLElement {
  const el = document.createElement("div");
  el.className = "tab-item";
  if (item.isLoaded) el.classList.add("is-loaded");
  if (item.isActive) el.classList.add("is-active");
  el.dataset.bookmarkId = item.id;

  const img = document.createElement("img");
  img.className = "favicon";
  img.src = faviconUrl(item.url);
  img.alt = "";
  img.onerror = () => { img.src = "icons/icon16.png"; };

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = item.title;

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.title = item.isLoaded ? "Close tab" : "Remove bookmark";
  closeBtn.textContent = "×";

  el.appendChild(img);
  el.appendChild(title);
  el.appendChild(closeBtn);

  el.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".close-btn")) return;
    activateBookmark(item.id);
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (item.isLoaded) {
      closeBookmarkTab(item.id);
    } else {
      removeBookmark(item.id);
    }
  });

  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    onBookmarkContext(e, item);
  });

  // Draggable within zone 2 and to zone 1
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer!.setData(
      "application/rolotabs",
      JSON.stringify({ type: "bookmark", bookmarkId: item.id }),
    );
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));

  return el;
}

// ----- Zone 3: Open tabs (not bookmarked) -----

function renderOpenTabs(openTabs: OpenTab[]): void {
  const list = document.getElementById("unlinked-list")!;
  const section = document.getElementById("zone-unlinked")!;
  list.innerHTML = "";

  section.classList.toggle("is-empty", openTabs.length === 0);
  if (openTabs.length === 0) return;

  for (const tab of openTabs) {
    const el = document.createElement("div");
    el.className = "tab-item is-loaded";
    if (tab.isActive) el.classList.add("is-active");
    el.dataset.tabId = String(tab.tabId);

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = tab.favIconUrl || faviconUrl(tab.url);
    img.alt = "";
    img.onerror = () => { img.src = "icons/icon16.png"; };

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || tab.url || "New Tab";

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.title = "Close tab";
    closeBtn.textContent = "×";

    el.appendChild(img);
    el.appendChild(title);
    el.appendChild(closeBtn);

    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".close-btn")) return;
      activateOpenTab(tab.tabId);
    });

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeOpenTab(tab.tabId);
    });

    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer!.setData(
        "application/rolotabs",
        JSON.stringify({ type: "openTab", tabId: tab.tabId }),
      );
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    list.appendChild(el);
  }
}

// ---------------------------------------------------------------------------
// Drag & drop
// ---------------------------------------------------------------------------

function setupDropZone(element: HTMLElement, zone: "pinned" | "bookmarks"): void {
  if (element.dataset.dropZone) {
    element.dataset.dropTarget = zone;
    return;
  }
  element.dataset.dropZone = "true";
  element.dataset.dropTarget = zone;

  element.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    element.classList.add("drag-over");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("drag-over");
  });

  element.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove("drag-over");

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;

    const data = JSON.parse(raw);
    const target = element.dataset.dropTarget!;

    if (data.type === "openTab") {
      // Promote: create bookmark from open tab
      if (target === "pinned") {
        await sendMessage({ type: "promoteTab", tabId: data.tabId, pinned: true });
      } else {
        await sendMessage({ type: "promoteTab", tabId: data.tabId, parentId: state?.rootFolderId });
      }
    } else if (data.type === "bookmark") {
      if (target === "pinned") {
        await sendMessage({ type: "pinBookmark", bookmarkId: data.bookmarkId });
      } else {
        // Unpin if pinned, and move to root folder
        await sendMessage({ type: "unpinBookmark", bookmarkId: data.bookmarkId });
        if (state?.rootFolderId) {
          await sendMessage({ type: "moveBookmark", bookmarkId: data.bookmarkId, parentId: state.rootFolderId });
        }
      }
    }

    await refreshState();
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function activateBookmark(bookmarkId: string): Promise<void> {
  state = await sendMessage({ type: "activateTab", bookmarkId }) as PanelState;
  render();
}

async function activateOpenTab(tabId: number): Promise<void> {
  state = await sendMessage({ type: "activateOpenTab", tabId }) as PanelState;
  render();
}

async function closeBookmarkTab(bookmarkId: string): Promise<void> {
  state = await sendMessage({ type: "closeTab", bookmarkId }) as PanelState;
  render();
}

async function closeOpenTab(tabId: number): Promise<void> {
  state = await sendMessage({ type: "closeOpenTab", tabId }) as PanelState;
  render();
}

async function removeBookmark(bookmarkId: string): Promise<void> {
  state = await sendMessage({ type: "removeBookmark", bookmarkId }) as PanelState;
  render();
}

function toggleFolder(folderId: string): void {
  if (collapsedFolders.has(folderId)) {
    collapsedFolders.delete(folderId);
  } else {
    collapsedFolders.add(folderId);
  }
  chrome.storage.local.set({
    collapsedFolders: Array.from(collapsedFolders),
  });
  render();
}

// ---------------------------------------------------------------------------
// Drop on folder helper
// ---------------------------------------------------------------------------

async function handleDropOnFolder(e: DragEvent, folderId: string): Promise<void> {
  const raw = e.dataTransfer!.getData("application/rolotabs");
  if (!raw) return;
  const data = JSON.parse(raw);

  if (data.type === "openTab") {
    await sendMessage({ type: "promoteTab", tabId: data.tabId, parentId: folderId });
  } else if (data.type === "bookmark") {
    await sendMessage({ type: "moveBookmark", bookmarkId: data.bookmarkId, parentId: folderId });
  }
  await refreshState();
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

function onPinnedContext(_event: MouseEvent, item: AnnotatedBookmark): void {
  const action = prompt(
    `${item.title}\n\nActions:\n1 — Unpin\n2 — Remove bookmark\n\nEnter number:`,
  );
  if (action === "1") {
    sendMessage({ type: "unpinBookmark", bookmarkId: item.id }).then(() => refreshState());
  } else if (action === "2") {
    removeBookmark(item.id);
  }
}

function onFolderContext(_event: MouseEvent, folder: AnnotatedBookmark): void {
  const action = prompt(
    `📁 ${folder.title}\n\nActions:\n1 — New subfolder\n2 — Rename\n3 — Delete folder\n\nEnter number:`,
  );
  if (action === "1") {
    const name = prompt("Folder name:");
    if (name) {
      sendMessage({ type: "createFolder", parentId: folder.id, title: name }).then(() => refreshState());
    }
  } else if (action === "2") {
    const newTitle = prompt("New name:", folder.title);
    if (newTitle && newTitle !== folder.title) {
      chrome.bookmarks.update(folder.id, { title: newTitle });
      refreshState();
    }
  } else if (action === "3") {
    const hasChildren = folder.children && folder.children.length > 0;
    const msg = hasChildren
      ? `Delete "${folder.title}" and ALL its contents?`
      : `Delete empty folder "${folder.title}"?`;
    if (confirm(msg)) {
      sendMessage({ type: "removeFolder", folderId: folder.id }).then(() => refreshState());
    }
  }
}

function onBookmarkContext(_event: MouseEvent, item: AnnotatedBookmark): void {
  const action = prompt(
    `${item.title}\n\nActions:\n1 — Pin to top\n2 — Remove bookmark\n3 — Rename\n\nEnter number:`,
  );
  if (action === "1") {
    sendMessage({ type: "pinBookmark", bookmarkId: item.id }).then(() => refreshState());
  } else if (action === "2") {
    removeBookmark(item.id);
  } else if (action === "3") {
    const newTitle = prompt("New name:", item.title);
    if (newTitle && newTitle !== item.title) {
      chrome.bookmarks.update(item.id, { title: newTitle });
      refreshState();
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function faviconUrl(url?: string): string {
  if (!url) return "icons/icon16.png";
  try {
    new URL(url);
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
  } catch {
    return "icons/icon16.png";
  }
}

function escapeHtml(str: string): string {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init();
