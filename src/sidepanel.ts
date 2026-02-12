/// <reference types="npm:chrome-types" />

// Rolotabs — Side Panel UI
// Renders the three-zone sidebar and handles user interactions.

import type { AnnotatedBookmark, OpenTab, PanelState } from "./lib/types.ts";
import { showContextMenu, type MenuEntry } from "./lib/context-menu.ts";
import { showDropIndicator, showGridDropIndicator, hideDropIndicator, showFolderDropGhost, showDangerDropGhost, showUnbookmarkDropGhost } from "./lib/drop-indicator.ts";
import { urlsMatch } from "./lib/urls.ts";

let state: PanelState | null = null;
let collapsedFolders = new Set<string>();
let editAfterRenderId: string | null = null;
let onboardingDismissed = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
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
    // Track if dragging an unloaded bookmark (for danger styling on zone 3)
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

  // Create folder button — creates "New folder" and enters edit mode
  document.getElementById("create-folder-btn")!.addEventListener("click", async () => {
    if (!state?.rootFolderId) return;
    const result = await sendMessage({ type: "createFolder", parentId: state.rootFolderId, title: "New folder" }) as { id?: string };
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

  // Close button for onboarding
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
});

async function refreshState(): Promise<void> {
  state = await sendMessage({ type: "getState" }) as PanelState;
  // Don't re-render while an edit-in-place input is active
  if (document.querySelector(".edit-in-place")) return;
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

  // Show onboarding unless previously dismissed
  const onboarding = document.getElementById("onboarding");
  if (onboarding && !onboardingDismissed) {
    onboarding.style.display = "";
  }

  renderPinned(state.pinned);
  renderBookmarks(state.bookmarks);
  renderOpenTabs(state.openTabs);

  // Scroll the active item into view
  requestAnimationFrame(() => {
    const active = document.querySelector(".tab-item.is-active, .pinned-item.is-active");
    if (active) {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
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
    if (item.isLoaded && item.tabUrl && !urlsMatch(item.url, item.tabUrl)) {
      el.classList.add("is-navigated");
    }
    el.title = item.title;
    el.dataset.bookmarkId = item.id;

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = item.favIconUrl || faviconUrl(item.url);
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

  // Context menu on empty space — only set up once
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
            const result = await sendMessage({ type: "createFolder", parentId: state.rootFolderId, title: "New folder" }) as { id?: string };
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

function renderFolder(folder: AnnotatedBookmark): HTMLElement {
  const container = document.createElement("div");
  container.className = "folder-item";
  container.dataset.folderId = folder.id;

  const isCollapsed = collapsedFolders.has(folder.id);

  const header = document.createElement("div");
  header.className = "folder-header";

  const arrow = document.createElement("span");
  arrow.className = `folder-arrow`;
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
  // Auto-edit newly created folders
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

  // Make folder draggable
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

  // Folder header is a drop target for moving bookmarks/folders into it
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
    // Prevent dropping a folder into itself
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

  // Show active items peeking out of collapsed folders
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

/** Recursively find active (focused) non-folder items within a folder tree. */
function findActiveItems(folder: AnnotatedBookmark): AnnotatedBookmark[] {
  const result: AnnotatedBookmark[] = [];
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

function renderTabItem(item: AnnotatedBookmark): HTMLElement {
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

  // Always set up drop zone (even when empty, for unbookmark drops)
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

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      onOpenTabContext(e, tab, openTabs);
    });

    list.appendChild(el);
  }

  setupOpenTabReorderDropZone(list);
}

function onOpenTabContext(event: MouseEvent, tab: OpenTab, allTabs: OpenTab[]): void {
  const idx = allTabs.findIndex((t) => t.tabId === tab.tabId);
  const entries: MenuEntry[] = [
    {
      label: "Pin",
      icon: "📌",
      action: () => sendMessage({ type: "promoteTab", tabId: tab.tabId, pinned: true }).then(() => refreshState()),
    },
    {
      label: "Bookmark",
      icon: "📚",
      action: () => sendMessage({ type: "promoteTab", tabId: tab.tabId, parentId: state?.rootFolderId }).then(() => refreshState()),
    },
    { separator: true },
    {
      label: "Close tab",
      icon: "✕",
      danger: true,
      action: () => closeOpenTab(tab.tabId),
    },
    {
      label: "Close all above",
      icon: "↑",
      danger: true,
      action: () => {
        const targets = allTabs.slice(0, idx);
        showConfirmToast(`Close ${targets.length} tab${targets.length > 1 ? "s" : ""} above?`, async () => {
          for (const t of targets) {
            await sendMessage({ type: "closeOpenTab", tabId: t.tabId });
          }
          await refreshState();
        });
      },
    },
    {
      label: "Close all below",
      icon: "↓",
      danger: true,
      action: () => {
        const targets = allTabs.slice(idx + 1);
        showConfirmToast(`Close ${targets.length} tab${targets.length > 1 ? "s" : ""} below?`, async () => {
          for (const t of targets) {
            await sendMessage({ type: "closeOpenTab", tabId: t.tabId });
          }
          await refreshState();
        });
      },
    },
    {
      label: "Close other tabs",
      icon: "✕",
      danger: true,
      action: () => {
        const targets = allTabs.filter((t) => t.tabId !== tab.tabId);
        showConfirmToast(`Close ${targets.length} other tab${targets.length > 1 ? "s" : ""}?`, async () => {
          for (const t of targets) {
            await sendMessage({ type: "closeOpenTab", tabId: t.tabId });
          }
          await refreshState();
        });
      },
    },
  ];

  // Filter out "close all above" if first, "close all below" if last
  const filtered = entries.filter((e) => {
    if ("label" in e && e.label === "Close all above" && idx === 0) return false;
    if ("label" in e && e.label === "Close all below" && idx === allTabs.length - 1) return false;
    if ("label" in e && e.label === "Close other tabs" && allTabs.length === 1) return false;
    return true;
  });

  showContextMenu(event.clientX, event.clientY, filtered);
}

function setupUnbookmarkDropZone(element: HTMLElement): void {
  if (element.dataset.dropZone) return;
  element.dataset.dropZone = "true";

  element.addEventListener("dragover", (e) => {
    if (document.body.classList.contains("is-dragging-from-zone3")) return;
    const raw = e.dataTransfer!.types.includes("application/rolotabs");
    if (!raw) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    if (document.body.classList.contains("is-dragging-inactive")) {
      // Inactive bookmark: fixed danger ghost at top
      const list = document.getElementById("unlinked-list")!;
      showDangerDropGhost(list, "delete bookmark");
    } else {
      // Active bookmark: positional ghost, user picks order
      const list = document.getElementById("unlinked-list")!;
      showDropIndicator(list, e.clientY);
    }
  });

  element.addEventListener("dragleave", (e) => {
    if (!element.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  });

  element.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.type === "bookmark" && !data.isFolder) {
      await sendMessage({ type: "unbookmarkTab", bookmarkId: data.bookmarkId });
      await refreshState();
    }
  });
}

function setupOpenTabReorderDropZone(list: HTMLElement): void {
  if (list.dataset.reorderZone) return;
  list.dataset.reorderZone = "true";

  list.addEventListener("dragover", (e) => {
    const raw = e.dataTransfer!.types.includes("application/rolotabs");
    if (!raw) return;

    if (document.body.classList.contains("is-dragging-from-zone3")) {
      // Reorder within zone 3
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "move";
      pendingDropIndex = showDropIndicator(list, e.clientY);
    } else if (document.body.classList.contains("is-dragging")) {
      // Bookmark dragged from zone 2 — handle at list level too
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "move";
      if (document.body.classList.contains("is-dragging-inactive")) {
        showDangerDropGhost(list, "delete bookmark");
      } else {
        pendingDropIndex = showDropIndicator(list, e.clientY);
      }
    }
  });

  list.addEventListener("dragleave", (e) => {
    if (!list.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  });

  list.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.type === "openTab") {
      await sendMessage({ type: "reorderOpenTab", tabId: data.tabId, toIndex: pendingDropIndex });
      await refreshState();
    } else if (data.type === "bookmark" && !data.isFolder) {
      await sendMessage({ type: "unbookmarkTab", bookmarkId: data.bookmarkId });
      await refreshState();
    }
  });
}

// ---------------------------------------------------------------------------
// Drag & drop
// ---------------------------------------------------------------------------

let pendingDropIndex = 0;

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
    const target = element.dataset.dropTarget!;
    if (target === "pinned") {
      pendingDropIndex = showGridDropIndicator(element, e.clientX, e.clientY);
    } else {
      pendingDropIndex = showDropIndicator(element, e.clientY);
    }
  });

  element.addEventListener("dragleave", (e) => {
    // Only hide if leaving the element entirely
    if (!element.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  });

  element.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;

    const data = JSON.parse(raw);
    const target = element.dataset.dropTarget!;

    if (data.type === "openTab") {
      if (target === "pinned") {
        await sendMessage({ type: "promoteTab", tabId: data.tabId, pinned: true });
      } else {
        await sendMessage({ type: "promoteTab", tabId: data.tabId, parentId: state?.rootFolderId });
      }
    } else if (data.type === "bookmark") {
      if (target === "pinned") {
        // If already pinned, reorder; otherwise pin
        if (state?.pinnedIds.includes(data.bookmarkId)) {
          await sendMessage({ type: "reorderPinned", bookmarkId: data.bookmarkId, toIndex: pendingDropIndex });
        } else {
          await sendMessage({ type: "pinBookmark", bookmarkId: data.bookmarkId });
        }
      } else {
        // Unpin if pinned, move to root at the drop position
        await sendMessage({ type: "unpinBookmark", bookmarkId: data.bookmarkId });
        if (state?.rootFolderId) {
          await sendMessage({ type: "reorderBookmark", bookmarkId: data.bookmarkId, parentId: state.rootFolderId, index: pendingDropIndex });
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

// ---------------------------------------------------------------------------
// Edit in place
// ---------------------------------------------------------------------------

function editInPlace(
  el: HTMLElement,
  currentValue: string,
  onSave: (newValue: string) => void,
): void {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "edit-in-place";
  input.value = currentValue;

  el.textContent = "";
  el.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    // Remove input first so refreshState sees no active edit
    input.remove();
    const val = input.value.trim();
    if (commit && val && val !== currentValue) {
      el.textContent = val;
      onSave(val);
    } else {
      el.textContent = currentValue;
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

// ---------------------------------------------------------------------------
// Confirmation toast
// ---------------------------------------------------------------------------

let activeToast: HTMLElement | null = null;
let toastTimeout: number | null = null;

function showConfirmToast(
  message: string,
  onConfirm: () => void,
  durationMs = 4000,
): void {
  dismissToast();

  const toast = document.createElement("div");
  toast.className = "confirm-toast";

  const text = document.createElement("span");
  text.className = "confirm-toast-text";
  text.textContent = message;

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "confirm-toast-btn confirm-toast-confirm";
  confirmBtn.textContent = "Yes";
  confirmBtn.addEventListener("click", () => {
    dismissToast();
    onConfirm();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "confirm-toast-btn confirm-toast-cancel";
  cancelBtn.textContent = "No";
  cancelBtn.addEventListener("click", () => dismissToast());

  toast.appendChild(text);
  toast.appendChild(confirmBtn);
  toast.appendChild(cancelBtn);
  document.body.appendChild(toast);
  activeToast = toast;

  toastTimeout = setTimeout(() => dismissToast(), durationMs) as unknown as number;
}

function dismissToast(): void {
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }
  if (toastTimeout !== null) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
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
  hideDropIndicator();
  const raw = e.dataTransfer!.getData("application/rolotabs");
  if (!raw) return;
  const data = JSON.parse(raw);

  if (data.type === "openTab") {
    await sendMessage({ type: "promoteTab", tabId: data.tabId, parentId: folderId });
  } else if (data.type === "bookmark") {
    await sendMessage({ type: "reorderBookmark", bookmarkId: data.bookmarkId, parentId: folderId, index: 0 });
  }
  await refreshState();
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

function onPinnedContext(event: MouseEvent, item: AnnotatedBookmark): void {
  showContextMenu(event.clientX, event.clientY, [
    {
      label: "Unpin",
      icon: "📌",
      action: () => sendMessage({ type: "unpinBookmark", bookmarkId: item.id }).then(() => refreshState()),
    },
    {
      label: "Replace with current URL",
      icon: "🔗",
      action: () => sendMessage({ type: "replaceBookmarkUrl", bookmarkId: item.id }).then(() => refreshState()),
    },
    { separator: true },
    {
      label: "Delete bookmark",
      icon: "🗑",
      danger: true,
      action: () => removeBookmark(item.id),
    },
  ]);
}

function onFolderContext(event: MouseEvent, folder: AnnotatedBookmark): void {
  const entries: MenuEntry[] = [
    {
      label: "New subfolder",
      icon: "📁",
      action: async () => {
        // Expand parent if collapsed
        collapsedFolders.delete(folder.id);
        const result = await sendMessage({ type: "createFolder", parentId: folder.id, title: "New folder" }) as { id?: string };
        if (result?.id) {
          editAfterRenderId = result.id;
        }
        await refreshState();
      },
    },
    {
      label: "Rename",
      icon: "✏️",
      action: () => {
        const nameEl = document.querySelector(`.folder-item[data-folder-id="${folder.id}"] .folder-name`) as HTMLElement;
        if (nameEl) {
          editInPlace(nameEl, folder.title, (newTitle) => {
            chrome.bookmarks.update(folder.id, { title: newTitle });
            refreshState();
          });
        }
      },
    },
    { separator: true },
    {
      label: "Delete folder",
      icon: "🗑",
      danger: true,
      action: () => {
        const hasChildren = folder.children && folder.children.length > 0;
        const msg = hasChildren
          ? `Delete "${folder.title}" and all contents?`
          : `Delete "${folder.title}"?`;
        showConfirmToast(msg, () => {
          sendMessage({ type: "removeFolder", folderId: folder.id }).then(() => refreshState());
        });
      },
    },
  ];
  showContextMenu(event.clientX, event.clientY, entries);
}

function onBookmarkContext(event: MouseEvent, item: AnnotatedBookmark): void {
  showContextMenu(event.clientX, event.clientY, [
    {
      label: "Pin to top",
      icon: "📌",
      action: () => sendMessage({ type: "pinBookmark", bookmarkId: item.id }).then(() => refreshState()),
    },
    {
      label: "Replace with current URL",
      icon: "🔗",
      action: () => sendMessage({ type: "replaceBookmarkUrl", bookmarkId: item.id }).then(() => refreshState()),
    },
    {
      label: "Rename",
      icon: "✏️",
      action: () => {
        const titleEl = document.querySelector(`.tab-item[data-bookmark-id="${item.id}"] .tab-title`) as HTMLElement;
        if (titleEl) {
          editInPlace(titleEl, item.title, (newTitle) => {
            chrome.bookmarks.update(item.id, { title: newTitle });
            refreshState();
          });
        }
      },
    },
    { separator: true },
    {
      label: "Delete bookmark",
      icon: "🗑",
      danger: true,
      action: () => removeBookmark(item.id),
    },
  ]);
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
