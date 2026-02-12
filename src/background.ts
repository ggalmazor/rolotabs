/// <reference types="npm:chrome-types" />

// Rolotabs — Background Service Worker
// Slim orchestrator: wires Chrome events to the BookmarkIndex and Grouping modules.

import { BookmarkIndex } from "./lib/bookmark-index.ts";
import { addTabToGroup, recoverGroupIds, ungroupIfNotManaged, ungroupTab } from "./lib/grouping.ts";
import type { BookmarkNode, TabInfo } from "./lib/types.ts";

// ---------------------------------------------------------------------------
// Core state
// ---------------------------------------------------------------------------

const index = new BookmarkIndex();
let otherBookmarksFolderId: string = "2";

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

chrome.runtime.onStartup.addListener(() => init());
init(); // Also init when service worker wakes up

async function init(): Promise<void> {
  await findOtherBookmarksFolder();
  const pinnedIds = await loadPinnedIds();
  const tree = await chrome.bookmarks.getTree();
  const tabs = await queryTabs();

  index.rebuild(
    tree[0].children as BookmarkNode[] ?? [],
    tabs,
    pinnedIds,
    otherBookmarksFolderId,
  );

  await recoverGroupIds();
  await notifySidePanel();
}

async function findOtherBookmarksFolder(): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const other = tree[0].children!.find(
    (n) => n.title === "Other Bookmarks" || n.title === "Other bookmarks",
  );
  otherBookmarksFolderId = other?.id ?? tree[0].children![1]?.id ?? "2";
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function loadPinnedIds(): Promise<string[]> {
  const stored = await chrome.storage.local.get("pinnedIds");
  return (stored.pinnedIds as string[]) ?? [];
}

async function savePinnedIds(): Promise<void> {
  await chrome.storage.local.set({ pinnedIds: index.getPinnedIds() });
}

// ---------------------------------------------------------------------------
// Tab helpers
// ---------------------------------------------------------------------------

async function queryTabs(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({});
  return tabs.map((t) => ({
    id: t.id!,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
  }));
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

// ---------------------------------------------------------------------------
// Tab events
// ---------------------------------------------------------------------------

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.url || tab.pendingUrl) {
    const url = tab.url || tab.pendingUrl;
    if (url && tab.id) {
      index.tryAssociateByUrl(tab.id, url, {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
      });
    }
  }
  // Ungroup tabs that inherited a managed group but aren't bookmarked
  if (tab.id) {
    const tabId = tab.id;
    setTimeout(async () => {
      try {
        const isBookmarked = index.isTabAssociated(tabId);
        await ungroupIfNotManaged(tabId, isBookmarked);
      } catch {
        // tab may have been closed
      }
    }, 500);
  }
  await notifySidePanel();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    index.handleTabNavigation(tabId, changeInfo.url, {
      id: tabId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
    });
  }
  if (changeInfo.favIconUrl || changeInfo.title) {
    index.updateTabInfo(tabId, {
      favIconUrl: changeInfo.favIconUrl,
      title: changeInfo.title,
    });
  }
  if (
    changeInfo.status === "complete" || changeInfo.title || changeInfo.favIconUrl || changeInfo.url
  ) {
    await notifySidePanel();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  index.dissociateTab(tabId);
  await notifySidePanel();
});

chrome.tabs.onActivated.addListener(async () => {
  await notifySidePanel();
});

// ---------------------------------------------------------------------------
// Bookmark events
// ---------------------------------------------------------------------------

chrome.bookmarks.onCreated.addListener(async (_id, _bookmark) => {
  // Full rebuild to get tree structure right
  const tree = await chrome.bookmarks.getTree();
  const tabs = await queryTabs();
  index.rebuild(
    tree[0].children as BookmarkNode[] ?? [],
    tabs,
    index.getPinnedIds(),
    otherBookmarksFolderId,
  );
  await notifySidePanel();
});

chrome.bookmarks.onRemoved.addListener(async (id) => {
  index.removeBookmark(id);
  if (index.cleanupPinned()) await savePinnedIds();
  // Rebuild to fix tree structure
  const tree = await chrome.bookmarks.getTree();
  const tabs = await queryTabs();
  index.rebuild(
    tree[0].children as BookmarkNode[] ?? [],
    tabs,
    index.getPinnedIds(),
    otherBookmarksFolderId,
  );
  await notifySidePanel();
});

chrome.bookmarks.onMoved.addListener(async () => {
  const tree = await chrome.bookmarks.getTree();
  const tabs = await queryTabs();
  index.rebuild(
    tree[0].children as BookmarkNode[] ?? [],
    tabs,
    index.getPinnedIds(),
    otherBookmarksFolderId,
  );
  await notifySidePanel();
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (changeInfo.url) {
    const tabs = await queryTabs();
    index.updateBookmarkUrl(id, changeInfo.url, tabs);
  }
  await notifySidePanel();
});

// ---------------------------------------------------------------------------
// Side panel communication
// ---------------------------------------------------------------------------

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Keyboard command handlers
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-url") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["CLIPBOARD" as chrome.offscreen.Reason],
          justification: "Copy URL to clipboard",
        });
      } catch {
        // Document may already exist
      }
      await chrome.runtime.sendMessage({ type: "clipboard-write", text: tab.url });
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    console.error("handleMessage error:", err);
    sendResponse(null);
  });
  return true;
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleMessage(message: { type: string; [key: string]: unknown }): Promise<unknown> {
  switch (message.type) {
    case "getState":
      return await getState();

    case "activateTab": {
      const bookmarkId = message.bookmarkId as string;
      const bm = index.get(bookmarkId);
      const tabId = bm?.tabId;
      if (tabId) {
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
      } else if (bm?.url) {
        const newTab = await chrome.tabs.create({ url: bm.url });
        index.associate(bookmarkId, newTab.id!, {
          id: newTab.id!,
          url: newTab.url,
          title: newTab.title,
          favIconUrl: newTab.favIconUrl,
        });
        await addTabToGroup(newTab.id!, bm.isPinned ? "pinned" : "bookmarked");
      }
      return await getState();
    }

    case "activateOpenTab": {
      const tabId = message.tabId as number;
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      return await getState();
    }

    case "closeTab": {
      const bookmarkId = message.bookmarkId as string;
      const tabId = index.getTabId(bookmarkId);
      if (tabId !== null) {
        await chrome.tabs.remove(tabId);
        index.dissociate(bookmarkId);
      }
      return await getState();
    }

    case "closeOpenTab": {
      const tabId = message.tabId as number;
      await chrome.tabs.remove(tabId);
      return await getState();
    }

    case "pinBookmark": {
      const bookmarkId = message.bookmarkId as string;
      index.pin(bookmarkId);
      await savePinnedIds();
      await chrome.bookmarks.move(bookmarkId, { parentId: otherBookmarksFolderId });
      const tabId = index.getTabId(bookmarkId);
      if (tabId !== null) await addTabToGroup(tabId, "pinned");
      return await getState();
    }

    case "unpinBookmark": {
      const bookmarkId = message.bookmarkId as string;
      index.unpin(bookmarkId);
      await savePinnedIds();
      const tabId = index.getTabId(bookmarkId);
      if (tabId !== null) await addTabToGroup(tabId, "bookmarked");
      return await getState();
    }

    case "promoteTab": {
      const tabId = message.tabId as number;
      const parentId = message.parentId as string | undefined;
      const tab = await chrome.tabs.get(tabId);
      const createOpts: { title?: string; url?: string; parentId?: string } = {
        title: tab.title || tab.url,
        url: tab.url,
      };
      if (message.pinned) {
        createOpts.parentId = otherBookmarksFolderId;
      } else if (parentId) {
        createOpts.parentId = parentId;
      }
      const bm = await chrome.bookmarks.create(createOpts);
      // Rebuild to get tree structure right
      const tree = await chrome.bookmarks.getTree();
      const tabs = await queryTabs();
      index.rebuild(
        tree[0].children as BookmarkNode[] ?? [],
        tabs,
        index.getPinnedIds(),
        otherBookmarksFolderId,
      );
      index.associate(bm.id, tabId, {
        id: tabId,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
      });
      if (message.pinned) {
        index.pin(bm.id);
        await savePinnedIds();
      }
      await addTabToGroup(tabId, message.pinned ? "pinned" : "bookmarked");
      return await getState();
    }

    case "createFolder": {
      const parentId = message.parentId as string;
      const title = message.title as string;
      const created = await chrome.bookmarks.create({ parentId, title });
      return { id: created.id };
    }

    case "removeFolder": {
      const folderId = message.folderId as string;
      await chrome.bookmarks.removeTree(folderId);
      if (index.cleanupPinned()) await savePinnedIds();
      // Rebuild tree
      const tree = await chrome.bookmarks.getTree();
      const tabs = await queryTabs();
      index.rebuild(
        tree[0].children as BookmarkNode[] ?? [],
        tabs,
        index.getPinnedIds(),
        otherBookmarksFolderId,
      );
      return await getState();
    }

    case "unbookmarkTab": {
      const bookmarkId = message.bookmarkId as string;
      const tabId = index.getTabId(bookmarkId);
      index.removeBookmark(bookmarkId);
      if (tabId !== null) {
        await ungroupTab(tabId);
      }
      await savePinnedIds();
      await chrome.bookmarks.remove(bookmarkId);
      return await getState();
    }

    case "removeBookmark": {
      const bookmarkId = message.bookmarkId as string;
      index.removeBookmark(bookmarkId);
      await savePinnedIds();
      await chrome.bookmarks.remove(bookmarkId);
      return await getState();
    }

    case "reorderPinned": {
      const bookmarkId = message.bookmarkId as string;
      const toIndex = message.toIndex as number;
      index.reorderPinned(bookmarkId, toIndex);
      await savePinnedIds();
      return await getState();
    }

    case "replaceBookmarkUrl": {
      const bookmarkId = message.bookmarkId as string;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url) {
        await chrome.bookmarks.update(bookmarkId, {
          url: activeTab.url,
          title: activeTab.title || activeTab.url,
        });
        const tabs = await queryTabs();
        index.updateBookmarkUrl(bookmarkId, activeTab.url, tabs);
        index.associate(bookmarkId, activeTab.id!, {
          id: activeTab.id!,
          url: activeTab.url,
          title: activeTab.title,
          favIconUrl: activeTab.favIconUrl,
        });
      }
      return await getState();
    }

    case "reorderOpenTab": {
      const tabId = message.tabId as number;
      const toIndex = message.toIndex as number;
      const state = await getState();
      if (toIndex < state.openTabs.length) {
        const targetTabId = state.openTabs[toIndex].tabId;
        const allTabs = await chrome.tabs.query({});
        const targetTab = allTabs.find((t) => t.id === targetTabId);
        if (targetTab) {
          await chrome.tabs.move(tabId, { index: targetTab.index });
        }
      } else {
        await chrome.tabs.move(tabId, { index: -1 });
      }
      return await getState();
    }

    case "reorderBookmark": {
      const bookmarkId = message.bookmarkId as string;
      const parentId = message.parentId as string;
      const idx = message.index as number;
      await chrome.bookmarks.move(bookmarkId, { parentId, index: idx });
      // Rebuild tree
      const tree = await chrome.bookmarks.getTree();
      const tabs = await queryTabs();
      index.rebuild(
        tree[0].children as BookmarkNode[] ?? [],
        tabs,
        index.getPinnedIds(),
        otherBookmarksFolderId,
      );
      return await getState();
    }

    case "getPinnedIds":
      return index.getPinnedIds();

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// State projection
// ---------------------------------------------------------------------------

async function getState() {
  const activeTabId = await getActiveTabId();
  const tabs = await queryTabs();
  return index.getState(activeTabId, tabs);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

let notifyTimeout: ReturnType<typeof setTimeout> | null = null;

function notifySidePanel(): void {
  if (notifyTimeout) clearTimeout(notifyTimeout);
  notifyTimeout = setTimeout(async () => {
    try {
      await chrome.runtime.sendMessage({ type: "stateUpdated" });
    } catch {
      // Side panel might not be open
    }
  }, 50);
}
