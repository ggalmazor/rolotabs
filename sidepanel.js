// Rolotabs — Side Panel UI
// Renders the three-zone sidebar and handles user interactions.

let state = null;
let folderIds = null;
let collapsedFolders = new Set();

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init() {
  // Get folder IDs
  folderIds = await sendMessage({ type: "getFolderIds" });

  // Load collapsed folders from storage
  const stored = await chrome.storage.local.get("collapsedFolders");
  if (stored.collapsedFolders) {
    collapsedFolders = new Set(stored.collapsedFolders);
  }

  // Get initial state
  state = await sendMessage({ type: "getState" });
  render();
}

// Listen for state updates from the background worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "stateUpdated") {
    refreshState();
  }
});

async function refreshState() {
  state = await sendMessage({ type: "getState" });
  if (state) render();
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  if (!state) return;
  renderPinned(state.pinned);
  renderTabs(state.tabs);
  renderUnlinked(state.unlinked);
}

// ----- Zone 1: Pinned grid -----

function renderPinned(pinned) {
  const grid = document.getElementById("pinned-grid");
  grid.innerHTML = "";

  if (pinned.length === 0) {
    grid.innerHTML =
      '<div class="pinned-grid-empty">Drag tabs here to pin</div>';
    setupDropZone(grid, folderIds.pinnedFolderId);
    return;
  }

  for (const item of pinned) {
    if (item.isFolder) continue; // no folders in pinned zone

    const el = document.createElement("div");
    el.className = "pinned-item";
    if (item.isLoaded) el.classList.add("is-loaded");
    if (item.isActive) el.classList.add("is-active");
    el.title = item.title;
    el.dataset.bookmarkId = item.id;

    el.innerHTML = `
      <img class="favicon" src="${faviconUrl(item.url)}" alt="" />
      <div class="status-dot"></div>
    `;

    el.addEventListener("click", () => activateBookmark(item.id));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      onBookmarkContext(e, item);
    });

    // Drag source (to demote from pinned)
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData(
        "application/rolotabs",
        JSON.stringify({ type: "bookmark", bookmarkId: item.id })
      );
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    grid.appendChild(el);
  }

  setupDropZone(grid, folderIds.pinnedFolderId);
}

// ----- Zone 2: Bookmarked tabs -----

function renderTabs(tabs) {
  const list = document.getElementById("tabs-list");
  list.innerHTML = "";

  if (tabs.length === 0) {
    list.innerHTML =
      '<div class="empty-state">Drag tabs here to bookmark</div>';
    setupDropZone(list, folderIds.tabsFolderId);
    return;
  }

  for (const item of tabs) {
    if (item.isFolder) {
      list.appendChild(renderFolder(item));
    } else {
      list.appendChild(renderTabItem(item));
    }
  }

  setupDropZone(list, folderIds.tabsFolderId);
}

function renderFolder(folder) {
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

function renderTabItem(item) {
  const el = document.createElement("div");
  el.className = "tab-item";
  if (item.isLoaded) el.classList.add("is-loaded");
  if (item.isActive) el.classList.add("is-active");
  el.dataset.bookmarkId = item.id;

  el.innerHTML = `
    <img class="favicon" src="${faviconUrl(item.url)}" alt="" />
    <span class="tab-title">${escapeHtml(item.title)}</span>
    <button class="close-btn" title="${item.isLoaded ? "Close tab" : "Remove bookmark"}">×</button>
  `;

  el.addEventListener("click", (e) => {
    if (e.target.closest(".close-btn")) return;
    activateBookmark(item.id);
  });

  el.querySelector(".close-btn").addEventListener("click", (e) => {
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

  // Drag source
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData(
      "application/rolotabs",
      JSON.stringify({ type: "bookmark", bookmarkId: item.id })
    );
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));

  return el;
}

// ----- Zone 3: Unlinked tabs -----

function renderUnlinked(unlinked) {
  const list = document.getElementById("unlinked-list");
  const section = document.getElementById("zone-unlinked");
  list.innerHTML = "";

  if (unlinked.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  for (const tab of unlinked) {
    const el = document.createElement("div");
    el.className = "tab-item is-loaded";
    if (tab.isActive) el.classList.add("is-active");
    el.dataset.tabId = tab.tabId;

    el.innerHTML = `
      <img class="favicon" src="${tab.favIconUrl || faviconUrl(tab.url)}" alt="" />
      <span class="tab-title">${escapeHtml(tab.title || tab.url || "New Tab")}</span>
      <button class="close-btn" title="Close tab">×</button>
    `;

    el.addEventListener("click", (e) => {
      if (e.target.closest(".close-btn")) return;
      activateUnlinkedTab(tab.tabId);
    });

    el.querySelector(".close-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      closeUnlinkedTab(tab.tabId);
    });

    // Drag source (to promote into bookmarks)
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData(
        "application/rolotabs",
        JSON.stringify({ type: "unlinked", tabId: tab.tabId })
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

function setupDropZone(element, targetFolderId) {
  element.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    element.classList.add("drag-over");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("drag-over");
  });

  element.addEventListener("drop", async (e) => {
    e.preventDefault();
    element.classList.remove("drag-over");

    const raw = e.dataTransfer.getData("application/rolotabs");
    if (!raw) return;

    const data = JSON.parse(raw);

    if (data.type === "unlinked") {
      // Promote: create bookmark from unlinked tab
      await sendMessage({
        type: "promoteTab",
        tabId: data.tabId,
        targetFolderId,
      });
    } else if (data.type === "bookmark") {
      // Move bookmark between zones/folders
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

async function activateBookmark(bookmarkId) {
  state = await sendMessage({ type: "activateTab", bookmarkId });
  render();
}

async function activateUnlinkedTab(tabId) {
  state = await sendMessage({ type: "activateUnlinkedTab", tabId });
  render();
}

async function closeBookmarkTab(bookmarkId) {
  state = await sendMessage({ type: "closeTab", bookmarkId });
  render();
}

async function closeUnlinkedTab(tabId) {
  state = await sendMessage({ type: "closeUnlinkedTab", tabId });
  render();
}

async function removeBookmark(bookmarkId) {
  state = await sendMessage({ type: "removeBookmark", bookmarkId });
  render();
}

function toggleFolder(folderId) {
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
// Context menu (simple, using native prompt for now)
// ---------------------------------------------------------------------------

function onBookmarkContext(event, item) {
  // Future: replace with a custom context menu
  // For now, offer basic actions via confirm dialogs
  const action = prompt(
    `${item.title}\n\nActions:\n1 — Remove bookmark\n2 — Rename\n\nEnter number:`
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

function faviconUrl(url) {
  if (!url) return "icons/icon16.png";
  try {
    const u = new URL(url);
    // Chrome's built-in favicon service
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
  } catch {
    return "icons/icon16.png";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init();
