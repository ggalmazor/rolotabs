/// <reference types="npm:chrome-types" />

// Rolotabs — Side Panel UI
// Renders the three-zone sidebar and handles user interactions.

import type { ManagedBookmark, OpenTab, PanelState } from "./lib/types.ts";
import { showContextMenu } from "./lib/context-menu.ts";
import { hideDropIndicator, showFolderDropGhost } from "./lib/drop-indicator.ts";
import { urlsMatch } from "./lib/urls.ts";
import { editInPlace } from "./ui/edit-in-place.ts";
import { showConfirmToast } from "./ui/toast.ts";
import { faviconUrl } from "./ui/favicon.ts";
import {
  handleDropOnFolder,
  initDropZones,
  setupDropZone,
  setupOpenTabReorderDropZone,
  setupUnbookmarkDropZone,
} from "./ui/drop-zones.ts";
import {
  initContextMenus,
  onBookmarkContext,
  onFolderContext,
  onOpenTabContext,
  onPinnedContext,
} from "./ui/context-menus.ts";

let state: PanelState | null = null;
let collapsedFolders = new Set<string>();
let editAfterRenderId: string | null = null;
let onboardingDismissed = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  // Wire up delegates for extracted modules
  initDropZones({
    sendMessage,
    refreshState,
    getState: () => state,
  });
  initContextMenus({
    sendMessage,
    refreshState,
    removeBookmark,
    closeOpenTab,
    setEditAfterId: (id: string) => {
      editAfterRenderId = id;
    },
    expandFolder: (folderId: string) => {
      collapsedFolders.delete(folderId);
    },
  });

  const stored = await chrome.storage.local.get("collapsedFolders");
  if (stored.collapsedFolders) {
    collapsedFolders = new Set(stored.collapsedFolders as string[]);
  }

  // Suppress default context menu everywhere
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Track drag state globally for CSS
  document.addEventListener("dragstart", (e) => {
    document.body.classList.add("is-dragging");
    const target = e.target as HTMLElement;
    if (target.closest("#zone-unlinked")) {
      document.body.classList.add("is-dragging-from-zone3");
    }
    const bmId = target.dataset?.bookmarkId;
    const isLoaded = target.classList.contains("is-loaded");
    if (bmId && !isLoaded) {
      document.body.classList.add("is-dragging-inactive");
    }
  });
  document.addEventListener("dragend", () => {
    document.body.classList.remove("is-dragging", "is-dragging-from-zone3", "is-dragging-inactive");
    hideDropIndicator();
  });
  document.addEventListener("drop", () => {
    document.body.classList.remove("is-dragging", "is-dragging-from-zone3", "is-dragging-inactive");
    hideDropIndicator();
  });

  // Create folder button
  document.getElementById("create-folder-btn")!.addEventListener("click", async () => {
    if (!state?.rootFolderId) return;
    const result = await sendMessage({
      type: "createFolder",
      parentId: state.rootFolderId,
      title: "New folder",
    }) as { id?: string };
    if (result?.id) {
      editAfterRenderId = result.id;
    }
    await refreshState();
  });

  // Clear all open tabs button
  document.getElementById("clear-open-tabs-btn")!.addEventListener("click", () => {
    if (!state?.openTabs.length) return;
    const count = state.openTabs.length;
    showConfirmToast(`Close ${count} tab${count > 1 ? "s" : ""}?`, async () => {
      for (const tab of state!.openTabs) {
        await sendMessage({ type: "closeOpenTab", tabId: tab.tabId });
      }
      await refreshState();
    });
  });

  // Load onboarding dismissed state
  const onboardingStored = await chrome.storage.local.get("onboardingDismissed");
  onboardingDismissed = !!onboardingStored.onboardingDismissed;

  document.getElementById("onboarding-close")!.addEventListener("click", () => {
    onboardingDismissed = true;
    chrome.storage.local.set({ onboardingDismissed: true });
    const el = document.getElementById("onboarding");
    if (el) el.style.display = "none";
  });

  state = await sendMessage({ type: "getState" }) as PanelState;
  render();
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === "stateUpdated") {
    refreshState();
  }
  return undefined;
});

async function refreshState(): Promise<void> {
  state = await sendMessage({ type: "getState" }) as PanelState;
  if (document.querySelector(".edit-in-place")) return;
  if (state) render();
}

function sendMessage(message: { type: string; [key: string]: unknown }): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
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

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(): void {
  if (!state) return;

  const onboarding = document.getElementById("onboarding");
  if (onboarding && !onboardingDismissed) {
    onboarding.style.display = "";
  }

  renderPinned(state.pinned);
  renderBookmarks(state.bookmarks);
  renderOpenTabs(state.openTabs);

  requestAnimationFrame(() => {
    const active = document.querySelector(".tab-item.is-active, .pinned-item.is-active");
    if (active) {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

// ----- Zone 1: Pinned grid -----

function renderPinned(pinned: ManagedBookmark[]): void {
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
    if (item.isLoaded && item.tabUrl && !urlsMatch(item.url, item.tabUrl)) {
      el.classList.add("is-navigated");
    }
    el.title = item.title;
    el.dataset.bookmarkId = item.id;

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = item.favIconUrl || faviconUrl(item.url);
    img.alt = "";
    img.onerror = () => {
      img.src = "icons/icon16.png";
    };

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

function renderBookmarks(roots: ManagedBookmark[]): void {
  const list = document.getElementById("tabs-list")!;
  list.innerHTML = "";

  let hasItems = false;
  for (const root of roots) {
    if (root.children) {
      for (const child of root.children) {
        hasItems = true;
        if (child.isFolder) {
          list.appendChild(renderFolder(child));
        } else {
          list.appendChild(renderTabItem(child));
        }
      }
    }
  }

  if (!hasItems) {
    list.innerHTML = '<div class="empty-state">Drag tabs here to bookmark</div>';
  }

  if (!list.dataset.contextMenuSet) {
    list.dataset.contextMenuSet = "true";
    list.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement).closest(".tab-item, .folder-header")) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        {
          label: "New folder",
          icon: "📁",
          action: async () => {
            if (!state?.rootFolderId) return;
            const result = await sendMessage({
              type: "createFolder",
              parentId: state.rootFolderId,
              title: "New folder",
            }) as { id?: string };
            if (result?.id) {
              editAfterRenderId = result.id;
            }
            await refreshState();
          },
        },
      ]);
    });
  }

  setupDropZone(list, "bookmarks");
}

function renderFolder(folder: ManagedBookmark): HTMLElement {
  const container = document.createElement("div");
  container.className = "folder-item";
  container.dataset.folderId = folder.id;

  const isCollapsed = collapsedFolders.has(folder.id);

  const header = document.createElement("div");
  header.className = "folder-header";

  const arrow = document.createElement("span");
  arrow.className = "folder-arrow";
  arrow.textContent = isCollapsed ? "📁" : "📂";

  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = folder.title;

  header.appendChild(arrow);
  header.appendChild(name);

  header.addEventListener("click", () => toggleFolder(folder.id));
  name.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    editInPlace(name, folder.title, (newTitle) => {
      chrome.bookmarks.update(folder.id, { title: newTitle });
      refreshState();
    });
  });

  if (editAfterRenderId === folder.id) {
    editAfterRenderId = null;
    requestAnimationFrame(() => {
      editInPlace(name, folder.title, (newTitle) => {
        chrome.bookmarks.update(folder.id, { title: newTitle });
        refreshState();
      });
    });
  }

  header.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    onFolderContext(e, folder);
  });

  header.draggable = true;
  header.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    e.dataTransfer!.setData(
      "application/rolotabs",
      JSON.stringify({ type: "bookmark", bookmarkId: folder.id, isFolder: true }),
    );
    container.classList.add("dragging");
  });
  header.addEventListener("dragend", () => container.classList.remove("dragging"));

  header.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = "move";
    showFolderDropGhost(header);
  });
  header.addEventListener("dragleave", (e) => {
    if (!header.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  });
  header.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.bookmarkId === folder.id) return;
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

  if (isCollapsed) {
    const activeItems = findActiveItems(folder);
    for (const item of activeItems) {
      const peekEl = renderTabItem(item);
      peekEl.classList.add("is-peek");
      container.appendChild(peekEl);
    }
  }

  return container;
}

function findActiveItems(folder: ManagedBookmark): ManagedBookmark[] {
  const result: ManagedBookmark[] = [];
  if (!folder.children) return result;
  for (const child of folder.children) {
    if (child.isFolder) {
      result.push(...findActiveItems(child));
    } else if (child.isActive) {
      result.push(child);
    }
  }
  return result;
}

function renderTabItem(item: ManagedBookmark): HTMLElement {
  const el = document.createElement("div");
  el.className = "tab-item";
  if (item.isLoaded) el.classList.add("is-loaded");
  if (item.isActive) el.classList.add("is-active");
  if (item.isLoaded && item.tabUrl && !urlsMatch(item.url, item.tabUrl)) {
    el.classList.add("is-navigated");
  }
  el.dataset.bookmarkId = item.id;

  const img = document.createElement("img");
  img.className = "favicon";
  img.src = item.favIconUrl || faviconUrl(item.url);
  img.alt = "";
  img.onerror = () => {
    img.src = "icons/icon16.png";
  };

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

// ----- Zone 3: Open tabs (not bookmarked) -----

function renderOpenTabs(openTabs: OpenTab[]): void {
  const list = document.getElementById("unlinked-list")!;
  const section = document.getElementById("zone-unlinked")!;
  list.innerHTML = "";

  section.classList.toggle("is-empty", openTabs.length === 0);
  setupUnbookmarkDropZone(section);

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
    img.onerror = () => {
      img.src = "icons/icon16.png";
    };

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

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      onOpenTabContext(e, tab, openTabs);
    });

    list.appendChild(el);
  }

  setupOpenTabReorderDropZone(list);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Boot
// ---------------------------------------------------------------------------

init();
