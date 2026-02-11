/// <reference types="npm:chrome-types" />

// Rolotabs — Background Service Worker
// Manages the bookmark folder structure, tab↔bookmark associations, and events.

import { urlsMatch } from "./lib/urls.ts";
import { annotateNode, flattenBookmarkTree, getUnlinkedTabs } from "./lib/state.ts";
import type { BookmarkNode } from "./lib/types.ts";

const ROOT_FOLDER_NAME = "Rolotabs";
const PINNED_FOLDER_NAME = "Pinned";
const TABS_FOLDER_NAME = "Tabs";

// In-memory state: bookmarkId → tabId (or null if unloaded)
const bookmarkToTab = new Map<string, number | null>();
// Reverse map: tabId → bookmarkId
const tabToBookmark = new Map<number, string>();

// Folder IDs (populated on startup)
let rootFolderId: string | null = null;
let pinnedFolderId: string | null = null;
let tabsFolderId: string | null = null;

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

async function init(): Promise<void> {
  await ensureFolderStructure();
  await rebuildAssociations();
  await notifySidePanel();
}

// ---------------------------------------------------------------------------
// Folder structure
// ---------------------------------------------------------------------------

async function ensureFolderStructure(): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const otherBookmarks = tree[0].children!.find(
    (n) => n.title === "Other Bookmarks" || n.title === "Other bookmarks"
  );
  if (!otherBookmarks) {
    // Fallback: use the second root child (index 1 is typically "Other Bookmarks")
    const root = tree[0].children![1];
    rootFolderId = await findOrCreateFolder(root.id, ROOT_FOLDER_NAME);
  } else {
    rootFolderId = await findOrCreateFolder(otherBookmarks.id, ROOT_FOLDER_NAME);
  }

  pinnedFolderId = await findOrCreateFolder(rootFolderId, PINNED_FOLDER_NAME);
  tabsFolderId = await findOrCreateFolder(rootFolderId, TABS_FOLDER_NAME);
}

async function findOrCreateFolder(parentId: string, title: string): Promise<string> {
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

async function rebuildAssociations(): Promise<void> {
  bookmarkToTab.clear();
  tabToBookmark.clear();

  const bookmarks = await getAllBookmarks();
  const tabs = await chrome.tabs.query({});

  for (const bm of bookmarks) {
    if (!bm.url) continue;

    const matchingTab = tabs.find((t) => urlsMatch(t.url, bm.url) && !tabToBookmark.has(t.id!));
    if (matchingTab) {
      bookmarkToTab.set(bm.id, matchingTab.id!);
      tabToBookmark.set(matchingTab.id!, bm.id);
    } else {
      bookmarkToTab.set(bm.id, null);
    }
  }
}

async function getAllBookmarks(): Promise<BookmarkNode[]> {
  const subtree = await chrome.bookmarks.getSubTree(rootFolderId!);
  return flattenBookmarkTree(subtree[0] as BookmarkNode);
}

// ---------------------------------------------------------------------------
// Tab events
// ---------------------------------------------------------------------------

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.url || tab.pendingUrl) {
    await tryAssociateTab(tab);
  }
  await notifySidePanel();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const oldBookmarkId = tabToBookmark.get(tabId);
    if (oldBookmarkId) {
      bookmarkToTab.set(oldBookmarkId, null);
      tabToBookmark.delete(tabId);
    }
    await tryAssociateTab(tab);
  }
  if (changeInfo.status === "complete" || changeInfo.title) {
    await notifySidePanel();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, _removeInfo) => {
  const bookmarkId = tabToBookmark.get(tabId);
  if (bookmarkId) {
    bookmarkToTab.set(bookmarkId, null);
    tabToBookmark.delete(tabId);
  }
  await notifySidePanel();
});

chrome.tabs.onActivated.addListener(async (_activeInfo) => {
  await notifySidePanel();
});

async function tryAssociateTab(tab: chrome.tabs.Tab): Promise<void> {
  const url = tab.url || tab.pendingUrl;
  if (!url) return;

  for (const [bmId, tabId] of bookmarkToTab.entries()) {
    if (tabId !== null) continue;
    try {
      const [bm] = await chrome.bookmarks.get(bmId);
      if (bm.url && urlsMatch(bm.url, url)) {
        bookmarkToTab.set(bmId, tab.id!);
        tabToBookmark.set(tab.id!, bmId);
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
    // Skip if already associated (e.g. by promoteTab handler)
    if (bookmarkToTab.has(id)) {
      await notifySidePanel();
      return;
    }
    if (bookmark.url) {
      bookmarkToTab.set(id, null);
      const tabs = await chrome.tabs.query({});
      const match = tabs.find((t) => urlsMatch(t.url, bookmark.url));
      if (match && !tabToBookmark.has(match.id!)) {
        bookmarkToTab.set(id, match.id!);
        tabToBookmark.set(match.id!, id);
      }
    }
    await notifySidePanel();
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, _removeInfo) => {
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
    if (changeInfo.url) {
      const oldTabId = bookmarkToTab.get(id);
      if (oldTabId !== null && oldTabId !== undefined) {
        tabToBookmark.delete(oldTabId);
      }
      bookmarkToTab.set(id, null);
      const tabs = await chrome.tabs.query({});
      const match = tabs.find((t) => urlsMatch(t.url, changeInfo.url));
      if (match && !tabToBookmark.has(match.id!)) {
        bookmarkToTab.set(id, match.id!);
        tabToBookmark.set(match.id!, id);
      }
    }
    await notifySidePanel();
  }
});

async function isUnderRoot(bookmarkId: string): Promise<boolean> {
  if (!rootFolderId) return false;
  try {
    let current: string = bookmarkId;
    let depth = 0;
    while (depth < 20) {
      if (current === rootFolderId) return true;
      const [node] = await chrome.bookmarks.get(current);
      if (!node.parentId || node.parentId === "0") return false;
      current = node.parentId;
      depth++;
    }
  } catch {
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Side panel communication
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id! });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    console.error("handleMessage error:", err);
    sendResponse(null);
  });
  return true;
});

async function handleMessage(message: { type: string; [key: string]: unknown }): Promise<unknown> {
  switch (message.type) {
    case "getState":
      return await getFullState();

    case "activateTab": {
      const bookmarkId = message.bookmarkId as string;
      const tabId = bookmarkToTab.get(bookmarkId);
      if (tabId) {
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        const [bm] = await chrome.bookmarks.get(bookmarkId);
        if (bm.url) {
          const newTab = await chrome.tabs.create({ url: bm.url });
          bookmarkToTab.set(bookmarkId, newTab.id!);
          tabToBookmark.set(newTab.id!, bookmarkId);
        }
      }
      return await getFullState();
    }

    case "activateUnlinkedTab": {
      const tabId = message.tabId as number;
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      return await getFullState();
    }

    case "closeTab": {
      const bookmarkId = message.bookmarkId as string;
      const tabId = bookmarkToTab.get(bookmarkId);
      if (tabId) {
        await chrome.tabs.remove(tabId);
        bookmarkToTab.set(bookmarkId, null);
        tabToBookmark.delete(tabId);
      }
      return await getFullState();
    }

    case "closeUnlinkedTab": {
      const tabId = message.tabId as number;
      await chrome.tabs.remove(tabId);
      return await getFullState();
    }

    case "promoteTab": {
      const tabId = message.tabId as number;
      const targetFolderId = message.targetFolderId as string;
      const index = message.index as number | undefined;
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
      const bookmarkId = message.bookmarkId as string;
      const targetFolderId = message.targetFolderId as string;
      const index = message.index as number | undefined;
      await chrome.bookmarks.move(bookmarkId, {
        parentId: targetFolderId,
        index,
      });
      return await getFullState();
    }

    case "removeBookmark": {
      const bookmarkId = message.bookmarkId as string;
      const tabId = bookmarkToTab.get(bookmarkId);
      bookmarkToTab.delete(bookmarkId);
      if (tabId) {
        tabToBookmark.delete(tabId);
      }
      await chrome.bookmarks.remove(bookmarkId);
      return await getFullState();
    }

    case "createFolder": {
      const parentId = message.parentId as string;
      const title = message.title as string;
      await chrome.bookmarks.create({ parentId, title });
      return await getFullState();
    }

    case "getFolderIds":
      return { rootFolderId, pinnedFolderId, tabsFolderId };

    default:
      return null;
  }
}

async function getFullState() {
  if (!rootFolderId) await init();

  const pinnedTree = await chrome.bookmarks.getSubTree(pinnedFolderId!);
  const tabsTree = await chrome.bookmarks.getSubTree(tabsFolderId!);

  const allTabs = await chrome.tabs.query({});
  const [activeTabInfo] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const activeTabId = activeTabInfo?.id ?? null;

  const pinned = pinnedTree[0].children?.map((n) =>
    annotateNode(n as BookmarkNode, bookmarkToTab, activeTabId)
  ) ?? [];
  const tabs = tabsTree[0].children?.map((n) =>
    annotateNode(n as BookmarkNode, bookmarkToTab, activeTabId)
  ) ?? [];

  const unlinked = getUnlinkedTabs(
    allTabs.map((t) => ({ id: t.id!, url: t.url, title: t.title, favIconUrl: t.favIconUrl })),
    tabToBookmark,
    activeTabId,
  );

  return {
    pinned,
    tabs,
    unlinked,
    activeTabId,
    folderIds: { rootFolderId, pinnedFolderId, tabsFolderId },
  };
}

let notifyTimeout: ReturnType<typeof setTimeout> | null = null;

async function notifySidePanel(): Promise<void> {
  if (notifyTimeout) clearTimeout(notifyTimeout);
  notifyTimeout = setTimeout(async () => {
    try {
      await chrome.runtime.sendMessage({ type: "stateUpdated" });
    } catch {
      // Side panel might not be open
    }
  }, 50);
}
