/// <reference types="npm:chrome-types" />

// Rolotabs — Side Panel UI
// Renders the three-zone sidebar and handles user interactions.

import type { AnnotatedBookmark, FolderIds, PanelState, UnlinkedTab } from "./lib/types.ts";

let state: PanelState | null = null;
let folderIds: FolderIds | null = null;
let collapsedFolders = new Set<string>();

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  folderIds = await sendMessage({ type: "getFolderIds" }) as FolderIds;

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
  renderTabs(state.tabs);
  renderUnlinked(state.unlinked);
}

// ----- Zone 1: Pinned grid -----

function renderPinned(pinned: AnnotatedBookmark[]): void {
  const grid = document.getElementById("pinned-grid")!;
  grid.innerHTML = "";

  if (pinned.length === 0) {
    grid.innerHTML = '<div class="pinned-grid-empty">Drag tabs here to pin</div>';
    setupDropZone(grid, folderIds!.pinnedFolderId);
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
      onBookmarkContext(e, item);
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

  setupDropZone(grid, folderIds!.pinnedFolderId);
}

// ----- Zone 2: Bookmarked tabs -----

function renderTabs(tabs: AnnotatedBookmark[]): void {
  const list = document.getElementById("tabs-list")!;
  list.innerHTML = "";

  if (tabs.length === 0) {
    list.innerHTML = '<div class="empty-state">Drag tabs here to bookmark</div>';
    setupDropZone(list, folderIds!.tabsFolderId);
    return;
  }

  for (const item of tabs) {
    if (item.isFolder) {
      list.appendChild(renderFolder(item));
    } else {
      list.appendChild(renderTabItem(item));
    }
  }

  setupDropZone(list, folderIds!.tabsFolderId);
}

function renderFolder(folder: AnnotatedBookmark): HTMLElement {
  const container = document.createElement("div");
  container.className = "folder-item";

  const isCollapsed = collapsedFolders.has(folder.id);

  const header = document.createElement("div");
  header.className = "folder-header";
  header.innerHTML = `
    <span class="folder-arrow ${isCollapsed ? "collapsed" : ""}">▼</span>
    <span class="folder-name">${escapeHtml(folder.title)}</span>
  `;
  header.addEventListener("click", () => toggleFolder(folder.id));
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

  setupDropZone(children, folder.id);
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

// ----- Zone 3: Unlinked tabs -----

function renderUnlinked(unlinked: UnlinkedTab[]): void {
  const list = document.getElementById("unlinked-list")!;
  const section = document.getElementById("zone-unlinked")!;
  list.innerHTML = "";

  section.classList.toggle("is-empty", unlinked.length === 0);
  if (unlinked.length === 0) return;

  for (const tab of unlinked) {
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
      activateUnlinkedTab(tab.tabId);
    });

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeUnlinkedTab(tab.tabId);
    });

    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer!.setData(
        "application/rolotabs",
        JSON.stringify({ type: "unlinked", tabId: tab.tabId }),
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

function setupDropZone(element: HTMLElement, targetFolderId: string): void {
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

    if (data.type === "unlinked") {
      await sendMessage({
        type: "promoteTab",
        tabId: data.tabId,
        targetFolderId,
      });
    } else if (data.type === "bookmark") {
      await sendMessage({
        type: "moveBookmark",
        bookmarkId: data.bookmarkId,
        targetFolderId,
      });
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

async function activateUnlinkedTab(tabId: number): Promise<void> {
  state = await sendMessage({ type: "activateUnlinkedTab", tabId }) as PanelState;
  render();
}

async function closeBookmarkTab(bookmarkId: string): Promise<void> {
  state = await sendMessage({ type: "closeTab", bookmarkId }) as PanelState;
  render();
}

async function closeUnlinkedTab(tabId: number): Promise<void> {
  state = await sendMessage({ type: "closeUnlinkedTab", tabId }) as PanelState;
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
// Context menu
// ---------------------------------------------------------------------------

function onBookmarkContext(_event: MouseEvent, item: AnnotatedBookmark): void {
  const action = prompt(
    `${item.title}\n\nActions:\n1 — Remove bookmark\n2 — Rename\n\nEnter number:`,
  );

  if (action === "1") {
    removeBookmark(item.id);
  } else if (action === "2") {
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
    new URL(url); // validate
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
