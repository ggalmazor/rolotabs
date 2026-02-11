// Rolotabs — Background Service Worker
// Manages the bookmark folder structure, tab↔bookmark associations, and events.

const ROOT_FOLDER_NAME = "Rolotabs";
const PINNED_FOLDER_NAME = "Pinned";
const TABS_FOLDER_NAME = "Tabs";

// In-memory state: bookmarkId → tabId (or null if unloaded)
const bookmarkToTab = new Map();
// Reverse map: tabId → bookmarkId
const tabToBookmark = new Map();

// Folder IDs (populated on startup)
let rootFolderId = null;
let pinnedFolderId = null;
let tabsFolderId = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await ensureFolderStructure();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await init();
});

// Also init when the service worker wakes up (e.g. after idle)
init();

async function init() {
  await ensureFolderStructure();
  await rebuildAssociations();
  await notifySidePanel();
}

// ---------------------------------------------------------------------------
// Folder structure
// ---------------------------------------------------------------------------

async function ensureFolderStructure() {
  const tree = await chrome.bookmarks.getTree();
  const otherBookmarks = tree[0].children.find(
    (n) => n.title === "Other Bookmarks" || n.title === "Other bookmarks"
  );
  if (!otherBookmarks) {
    // Fallback: use the second root child (index 1 is typically "Other Bookmarks")
    const root = tree[0].children[1];
    rootFolderId = await findOrCreateFolder(root.id, ROOT_FOLDER_NAME);
  } else {
    rootFolderId = await findOrCreateFolder(otherBookmarks.id, ROOT_FOLDER_NAME);
  }

  pinnedFolderId = await findOrCreateFolder(rootFolderId, PINNED_FOLDER_NAME);
  tabsFolderId = await findOrCreateFolder(rootFolderId, TABS_FOLDER_NAME);
}

async function findOrCreateFolder(parentId, title) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find(
    (c) => c.title === title && c.url === undefined
  );
  if (existing) return existing.id;

  const created = await chrome.bookmarks.create({ parentId, title });
  return created.id;
}

// ---------------------------------------------------------------------------
// Association logic
// ---------------------------------------------------------------------------

async function rebuildAssociations() {
  bookmarkToTab.clear();
  tabToBookmark.clear();

  // Get all bookmarks under our root
  const bookmarks = await getAllBookmarks();

  // Get all open tabs
  const tabs = await chrome.tabs.query({});

  // For each bookmark, try to find a matching open tab
  for (const bm of bookmarks) {
    if (!bm.url) continue; // skip folders

    const matchingTab = tabs.find((t) => urlsMatch(t.url, bm.url));
    if (matchingTab) {
      bookmarkToTab.set(bm.id, matchingTab.id);
      tabToBookmark.set(matchingTab.id, bm.id);
    } else {
      bookmarkToTab.set(bm.id, null);
    }
  }
}

// Get all bookmark nodes (recursively) under the root folder
async function getAllBookmarks() {
  const subtree = await chrome.bookmarks.getSubTree(rootFolderId);
  const results = [];
  function walk(node) {
    results.push(node);
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  if (subtree[0].children) {
    for (const child of subtree[0].children) {
      walk(child);
    }
  }
  return results;
}

// Compare URLs loosely: ignore trailing slashes and fragments
function urlsMatch(url1, url2) {
  if (!url1 || !url2) return false;
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    const normalize = (u) =>
      u.origin + u.pathname.replace(/\/+$/, "") + u.search;
    return normalize(a) === normalize(b);
  } catch {
    return url1 === url2;
  }
}

// ---------------------------------------------------------------------------
// Tab events
// ---------------------------------------------------------------------------

chrome.tabs.onCreated.addListener(async (tab) => {
  // New tab opened — might match a bookmark
  if (tab.url || tab.pendingUrl) {
    await tryAssociateTab(tab);
  }
  await notifySidePanel();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // URL changed — re-evaluate association
    const oldBookmarkId = tabToBookmark.get(tabId);
    if (oldBookmarkId) {
      // Disassociate from old bookmark
      bookmarkToTab.set(oldBookmarkId, null);
      tabToBookmark.delete(tabId);
    }
    // Try to associate with a bookmark matching the new URL
    await tryAssociateTab(tab);
  }
  if (changeInfo.status === "complete" || changeInfo.title) {
    await notifySidePanel();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const bookmarkId = tabToBookmark.get(tabId);
  if (bookmarkId) {
    bookmarkToTab.set(bookmarkId, null);
    tabToBookmark.delete(tabId);
  }
  await notifySidePanel();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await notifySidePanel();
});

async function tryAssociateTab(tab) {
  const url = tab.url || tab.pendingUrl;
  if (!url) return;

  // Find a bookmark that matches this URL and isn't already associated
  for (const [bmId, tabId] of bookmarkToTab.entries()) {
    if (tabId !== null) continue; // already has a tab
    try {
      const [bm] = await chrome.bookmarks.get(bmId);
      if (bm.url && urlsMatch(bm.url, url)) {
        bookmarkToTab.set(bmId, tab.id);
        tabToBookmark.set(tab.id, bmId);
        return;
      }
    } catch {
      // bookmark may have been deleted
    }
  }
}

// ---------------------------------------------------------------------------
// Bookmark events
// ---------------------------------------------------------------------------

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (await isUnderRoot(id)) {
    if (bookmark.url) {
      bookmarkToTab.set(id, null);
      // Check if there's already a tab open for this URL
      const tabs = await chrome.tabs.query({});
      const match = tabs.find((t) => urlsMatch(t.url, bookmark.url));
      if (match && !tabToBookmark.has(match.id)) {
        bookmarkToTab.set(id, match.id);
        tabToBookmark.set(match.id, id);
      }
    }
    await notifySidePanel();
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  const tabId = bookmarkToTab.get(id);
  if (tabId !== undefined) {
    bookmarkToTab.delete(id);
    if (tabId !== null) {
      tabToBookmark.delete(tabId);
    }
  }
  await notifySidePanel();
});

chrome.bookmarks.onMoved.addListener(async () => {
  await rebuildAssociations();
  await notifySidePanel();
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (await isUnderRoot(id)) {
    // URL changed — reassociate
    if (changeInfo.url) {
      const oldTabId = bookmarkToTab.get(id);
      if (oldTabId !== null && oldTabId !== undefined) {
        tabToBookmark.delete(oldTabId);
      }
      bookmarkToTab.set(id, null);
      // Try to find matching tab
      const tabs = await chrome.tabs.query({});
      const match = tabs.find((t) => urlsMatch(t.url, changeInfo.url));
      if (match && !tabToBookmark.has(match.id)) {
        bookmarkToTab.set(id, match.id);
        tabToBookmark.set(match.id, id);
      }
    }
    await notifySidePanel();
  }
});

async function isUnderRoot(bookmarkId) {
  if (!rootFolderId) return false;
  try {
    let current = bookmarkId;
    while (current) {
      if (current === rootFolderId) return true;
      const [node] = await chrome.bookmarks.get(current);
      current = node.parentId;
      if (current === "0") return false; // reached tree root
    }
  } catch {
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Side panel communication
// ---------------------------------------------------------------------------

// Open side panel when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case "getState":
      return await getFullState();

    case "activateTab": {
      const { bookmarkId } = message;
      const tabId = bookmarkToTab.get(bookmarkId);
      if (tabId) {
        // Tab exists — focus it
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        // Tab doesn't exist — create it
        const [bm] = await chrome.bookmarks.get(bookmarkId);
        if (bm.url) {
          const newTab = await chrome.tabs.create({ url: bm.url });
          bookmarkToTab.set(bookmarkId, newTab.id);
          tabToBookmark.set(newTab.id, bookmarkId);
        }
      }
      return await getFullState();
    }

    case "activateUnlinkedTab": {
      const { tabId } = message;
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      return await getFullState();
    }

    case "closeTab": {
      const { bookmarkId } = message;
      const tabId = bookmarkToTab.get(bookmarkId);
      if (tabId) {
        await chrome.tabs.remove(tabId);
        bookmarkToTab.set(bookmarkId, null);
        tabToBookmark.delete(tabId);
      }
      return await getFullState();
    }

    case "closeUnlinkedTab": {
      const { tabId } = message;
      await chrome.tabs.remove(tabId);
      return await getFullState();
    }

    case "promoteTab": {
      // Move an unlinked tab into a bookmark folder
      const { tabId, targetFolderId, index } = message;
      const tab = await chrome.tabs.get(tabId);
      const bm = await chrome.bookmarks.create({
        parentId: targetFolderId,
        title: tab.title || tab.url,
        url: tab.url,
        index,
      });
      bookmarkToTab.set(bm.id, tabId);
      tabToBookmark.set(tabId, bm.id);
      return await getFullState();
    }

    case "moveBookmark": {
      const { bookmarkId, targetFolderId, index } = message;
      await chrome.bookmarks.move(bookmarkId, {
        parentId: targetFolderId,
        index,
      });
      return await getFullState();
    }

    case "removeBookmark": {
      const { bookmarkId } = message;
      const tabId = bookmarkToTab.get(bookmarkId);
      bookmarkToTab.delete(bookmarkId);
      if (tabId) {
        tabToBookmark.delete(tabId);
      }
      await chrome.bookmarks.remove(bookmarkId);
      return await getFullState();
    }

    case "createFolder": {
      const { parentId, title } = message;
      await chrome.bookmarks.create({ parentId, title });
      return await getFullState();
    }

    case "getFolderIds":
      return { rootFolderId, pinnedFolderId, tabsFolderId };

    default:
      return null;
  }
}

// Build the full state object for the side panel
async function getFullState() {
  if (!rootFolderId) await init();

  // Get bookmark tree under our root
  const pinnedTree = await chrome.bookmarks.getSubTree(pinnedFolderId);
  const tabsTree = await chrome.bookmarks.getSubTree(tabsFolderId);

  // Get all open tabs
  const allTabs = await chrome.tabs.query({});
  const [activeTabInfo] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const activeTabId = activeTabInfo?.id ?? null;

  // Annotate bookmark nodes with tab status
  function annotateNode(node) {
    const result = {
      id: node.id,
      title: node.title,
      url: node.url,
      parentId: node.parentId,
      index: node.index,
      isFolder: !node.url,
      tabId: bookmarkToTab.get(node.id) ?? null,
      isLoaded: bookmarkToTab.get(node.id) != null,
      isActive: bookmarkToTab.get(node.id) === activeTabId,
    };
    if (node.children) {
      result.children = node.children.map(annotateNode);
    }
    return result;
  }

  const pinned = pinnedTree[0].children?.map(annotateNode) ?? [];
  const tabs = tabsTree[0].children?.map(annotateNode) ?? [];

  // Unlinked tabs: open tabs not associated with any bookmark
  const linkedTabIds = new Set(tabToBookmark.keys());
  const unlinked = allTabs
    .filter((t) => !linkedTabIds.has(t.id))
    .filter((t) => !t.url?.startsWith("chrome://"))
    .filter((t) => !t.url?.startsWith("chrome-extension://"))
    .map((t) => ({
      tabId: t.id,
      title: t.title,
      url: t.url,
      favIconUrl: t.favIconUrl,
      isActive: t.id === activeTabId,
    }));

  return {
    pinned,
    tabs,
    unlinked,
    activeTabId,
    folderIds: { rootFolderId, pinnedFolderId, tabsFolderId },
  };
}

// Notify side panel to refresh
async function notifySidePanel() {
  try {
    await chrome.runtime.sendMessage({ type: "stateUpdated" });
  } catch {
    // Side panel might not be open — that's fine
  }
}
