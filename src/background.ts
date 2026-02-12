/// <reference types="npm:chrome-types" />

// Rolotabs — Background Service Worker
// Manages tab↔bookmark associations using the browser's full bookmark tree.
// Pinned bookmarks are tracked in chrome.storage.local.

import { urlsMatch } from "./lib/urls.ts";
import {
  annotateNode,
  filterPinnedFromTree,
  flattenBookmarkTree,
  getOpenTabs,
  getPinnedBookmarks,
} from "./lib/state.ts";
import type { BookmarkNode } from "./lib/types.ts";
import { reorderItem } from "./lib/reorder.ts";

// In-memory state: bookmarkId → tabId (or null if unloaded)
const bookmarkToTab = new Map<string, number | null>();
// Reverse map: tabId → bookmarkId
const tabToBookmark = new Map<number, string>();

// Pinned bookmark IDs (ordered), loaded from storage
let pinnedIds: string[] = [];

// "Other Bookmarks" folder ID — the root destination for pinned bookmarks
let otherBookmarksFolderId: string | null = null;

// Tab group IDs for zone-based grouping
let pinnedGroupId: number | null = null;
let bookmarkedGroupId: number | null = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

chrome.runtime.onStartup.addListener(async () => {
  await init();
});

// Also init when the service worker wakes up (e.g. after idle)
init();

async function init(): Promise<void> {
  await findOtherBookmarksFolder();
  await loadPinnedIds();
  await rebuildAssociations();
  await notifySidePanel();
}

async function findOtherBookmarksFolder(): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const other = tree[0].children!.find(
    (n) => n.title === "Other Bookmarks" || n.title === "Other bookmarks"
  );
  otherBookmarksFolderId = other?.id ?? tree[0].children![1]?.id ?? "2";
}

async function loadPinnedIds(): Promise<void> {
  const stored = await chrome.storage.local.get("pinnedIds");
  pinnedIds = (stored.pinnedIds as string[]) ?? [];
}

async function savePinnedIds(): Promise<void> {
  await chrome.storage.local.set({ pinnedIds });
}

/** Remove any pinned IDs that no longer exist as bookmarks. */
async function cleanupPinnedIds(): Promise<boolean> {
  const before = pinnedIds.length;
  const valid: string[] = [];
  for (const id of pinnedIds) {
    try {
      await chrome.bookmarks.get(id);
      valid.push(id);
    } catch {
      // Bookmark was deleted
    }
  }
  pinnedIds = valid;
  return pinnedIds.length !== before;
}

// ---------------------------------------------------------------------------
// Tab grouping
// ---------------------------------------------------------------------------

async function ensureGroup(
  label: string,
  color: chrome.tabGroups.ColorEnum,
  currentGroupId: number | null,
): Promise<number> {
  // Check if existing group is still valid
  if (currentGroupId !== null) {
    try {
      await chrome.tabGroups.get(currentGroupId);
      return currentGroupId;
    } catch {
      // Group was closed
    }
  }
  // Find an existing group with our label
  const groups = await chrome.tabGroups.query({ title: label });
  if (groups.length > 0) {
    return groups[0].id;
  }
  // Will be created when first tab is added
  return -1;
}

async function addTabToGroup(
  tabId: number,
  zone: "pinned" | "bookmarked",
): Promise<void> {
  const label = zone === "pinned" ? "📌 Pinned" : "📚 Bookmarks";
  const color: chrome.tabGroups.ColorEnum = zone === "pinned" ? "blue" : "grey";

  try {
    let groupId = zone === "pinned" ? pinnedGroupId : bookmarkedGroupId;

    // Validate existing group
    groupId = await ensureGroup(label, color, groupId);

    if (groupId === -1) {
      // Create new group with this tab
      groupId = await chrome.tabs.group({ tabIds: [tabId] });
    } else {
      // Add tab to existing group
      await chrome.tabs.group({ tabIds: [tabId], groupId });
    }
    // Always (re-)apply title and color
    await chrome.tabGroups.update(groupId, { title: label, color, collapsed: false });

    if (zone === "pinned") {
      pinnedGroupId = groupId;
    } else {
      bookmarkedGroupId = groupId;
    }

    // Position groups: pinned leftmost, bookmarked second
    await positionGroups();
  } catch {
    // Grouping failed (e.g. tab already closed) — not critical
  }
}

async function positionGroups(): Promise<void> {
  try {
    if (pinnedGroupId !== null) {
      try {
        await chrome.tabGroups.move(pinnedGroupId, { index: 0 });
      } catch {
        pinnedGroupId = null;
      }
    }
    if (bookmarkedGroupId !== null) {
      try {
        const targetIndex = pinnedGroupId !== null ? 1 : 0;
        await chrome.tabGroups.move(bookmarkedGroupId, { index: targetIndex });
      } catch {
        bookmarkedGroupId = null;
      }
    }
  } catch {
    // Not critical
  }
}

// ---------------------------------------------------------------------------
// Association logic
// ---------------------------------------------------------------------------

async function rebuildAssociations(): Promise<void> {
  bookmarkToTab.clear();
  tabToBookmark.clear();

  const allBookmarks = await getAllBookmarks();
  const tabs = await chrome.tabs.query({});

  for (const bm of allBookmarks) {
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
  const tree = await chrome.bookmarks.getTree();
  return flattenBookmarkTree(tree[0] as BookmarkNode);
}

// ---------------------------------------------------------------------------
// Tab events
// ---------------------------------------------------------------------------

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.url || tab.pendingUrl) {
    await tryAssociateTab(tab);
  }
  // Ungroup tabs that inherited a managed group but aren't bookmarked.
  // Delay to let Chrome assign the inherited groupId.
  if (tab.id) {
    const tabId = tab.id;
    setTimeout(async () => {
      try {
        const fresh = await chrome.tabs.get(tabId);
        await ungroupIfNotBookmarked(fresh);
      } catch {
        // tab may have been closed
      }
    }, 500);
  }
  await notifySidePanel();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const oldBookmarkId = tabToBookmark.get(tabId);
    if (oldBookmarkId) {
      // Temporarily break association to let tryAssociateTab find a new match
      bookmarkToTab.set(oldBookmarkId, null);
      tabToBookmark.delete(tabId);
      const matched = await tryAssociateTab(tab);
      if (!matched) {
        // No other bookmark matched — restore original association
        // (tab will show as "navigated away" in the UI)
        bookmarkToTab.set(oldBookmarkId, tabId);
        tabToBookmark.set(tabId, oldBookmarkId);
      }
    } else {
      await tryAssociateTab(tab);
    }
  }
  if (changeInfo.status === "complete" || changeInfo.title || changeInfo.favIconUrl) {
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

/** Ungroup a tab if it's in a managed group (pinned/bookmarked) but not actually bookmarked. */
async function ungroupIfNotBookmarked(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || tab.groupId === undefined || tab.groupId === -1) return;
  // Already associated with a bookmark — leave it
  if (tabToBookmark.has(tab.id)) return;
  // Only ungroup from our managed groups
  if (tab.groupId === pinnedGroupId || tab.groupId === bookmarkedGroupId) {
    try {
      await chrome.tabs.ungroup(tab.id);
    } catch {
      // tab may have been closed
    }
  }
}

async function tryAssociateTab(tab: chrome.tabs.Tab): Promise<boolean> {
  const url = tab.url || tab.pendingUrl;
  if (!url) return false;

  for (const [bmId, tabId] of bookmarkToTab.entries()) {
    if (tabId !== null) continue;
    try {
      const [bm] = await chrome.bookmarks.get(bmId);
      if (bm.url && urlsMatch(bm.url, url)) {
        bookmarkToTab.set(bmId, tab.id!);
        tabToBookmark.set(tab.id!, bmId);
        return true;
      }
    } catch {
      // bookmark may have been deleted
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Bookmark events
// ---------------------------------------------------------------------------

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
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
});

chrome.bookmarks.onRemoved.addListener(async (id, _removeInfo) => {
  const tabId = bookmarkToTab.get(id);
  if (tabId !== undefined) {
    bookmarkToTab.delete(id);
    if (tabId !== null) {
      tabToBookmark.delete(tabId);
    }
  }
  // Remove from pinned if it was there
  const idx = pinnedIds.indexOf(id);
  if (idx !== -1) {
    pinnedIds.splice(idx, 1);
    await savePinnedIds();
  }
  await notifySidePanel();
});

chrome.bookmarks.onMoved.addListener(async () => {
  await notifySidePanel();
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
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
});

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
      const isPinned = pinnedIds.includes(bookmarkId);
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
          await addTabToGroup(newTab.id!, isPinned ? "pinned" : "bookmarked");
        }
      }
      return await getFullState();
    }

    case "activateOpenTab": {
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

    case "closeOpenTab": {
      const tabId = message.tabId as number;
      await chrome.tabs.remove(tabId);
      return await getFullState();
    }

    case "pinBookmark": {
      const bookmarkId = message.bookmarkId as string;
      if (!pinnedIds.includes(bookmarkId)) {
        pinnedIds.push(bookmarkId);
        await savePinnedIds();
        if (otherBookmarksFolderId) {
          await chrome.bookmarks.move(bookmarkId, { parentId: otherBookmarksFolderId });
        }
        // Move tab to pinned group if loaded
        const tabId = bookmarkToTab.get(bookmarkId);
        if (tabId) await addTabToGroup(tabId, "pinned");
      }
      return await getFullState();
    }

    case "unpinBookmark": {
      const bookmarkId = message.bookmarkId as string;
      const idx = pinnedIds.indexOf(bookmarkId);
      if (idx !== -1) {
        pinnedIds.splice(idx, 1);
        await savePinnedIds();
        // Move tab to bookmarked group if loaded
        const tabId = bookmarkToTab.get(bookmarkId);
        if (tabId) await addTabToGroup(tabId, "bookmarked");
      }
      return await getFullState();
    }

    case "promoteTab": {
      // Create a bookmark from an open tab
      const tabId = message.tabId as number;
      const parentId = message.parentId as string | undefined;
      const tab = await chrome.tabs.get(tabId);
      const createOpts: chrome.bookmarks.BookmarkCreateArg = {
        title: tab.title || tab.url,
        url: tab.url,
      };
      if (message.pinned) {
        // Pinned bookmarks go to root
        createOpts.parentId = otherBookmarksFolderId ?? undefined;
      } else if (parentId) {
        createOpts.parentId = parentId;
      }
      const bm = await chrome.bookmarks.create(createOpts);
      bookmarkToTab.set(bm.id, tabId);
      tabToBookmark.set(tabId, bm.id);
      if (message.pinned) {
        pinnedIds.push(bm.id);
        await savePinnedIds();
      }
      await addTabToGroup(tabId, message.pinned ? "pinned" : "bookmarked");
      return await getFullState();
    }

    case "moveBookmark": {
      const bookmarkId = message.bookmarkId as string;
      const parentId = message.parentId as string;
      const index = message.index as number | undefined;
      await chrome.bookmarks.move(bookmarkId, { parentId, index });
      return await getFullState();
    }

    case "createFolder": {
      const parentId = message.parentId as string;
      const title = message.title as string;
      const created = await chrome.bookmarks.create({ parentId, title });
      return { id: created.id };
    }

    case "removeFolder": {
      const folderId = message.folderId as string;
      // removeTree handles non-empty folders
      await chrome.bookmarks.removeTree(folderId);
      // Clean up any pinned IDs that were inside
      const removed = await cleanupPinnedIds();
      if (removed) await savePinnedIds();
      return await getFullState();
    }

    case "unbookmarkTab": {
      // Remove bookmark but keep the tab open and ungroup it
      const bookmarkId = message.bookmarkId as string;
      const tabId = bookmarkToTab.get(bookmarkId);
      bookmarkToTab.delete(bookmarkId);
      if (tabId) {
        tabToBookmark.delete(tabId);
        try {
          await chrome.tabs.ungroup(tabId);
        } catch {
          // Tab may not be in a group
        }
        await positionGroups();
      }
      // Remove from pinned if needed
      const pinnedIdx = pinnedIds.indexOf(bookmarkId);
      if (pinnedIdx !== -1) {
        pinnedIds.splice(pinnedIdx, 1);
        await savePinnedIds();
      }
      await chrome.bookmarks.remove(bookmarkId);
      return await getFullState();
    }

    case "removeBookmark": {
      const bookmarkId = message.bookmarkId as string;
      const tabId = bookmarkToTab.get(bookmarkId);
      bookmarkToTab.delete(bookmarkId);
      if (tabId) {
        tabToBookmark.delete(tabId);
      }
      const idx = pinnedIds.indexOf(bookmarkId);
      if (idx !== -1) {
        pinnedIds.splice(idx, 1);
        await savePinnedIds();
      }
      await chrome.bookmarks.remove(bookmarkId);
      return await getFullState();
    }

    case "reorderPinned": {
      const bookmarkId = message.bookmarkId as string;
      const toIndex = message.toIndex as number;
      pinnedIds = reorderItem(pinnedIds, bookmarkId, toIndex);
      await savePinnedIds();
      return await getFullState();
    }

    case "replaceBookmarkUrl": {
      const bookmarkId = message.bookmarkId as string;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url) {
        // Update bookmark URL and title
        await chrome.bookmarks.update(bookmarkId, { url: activeTab.url, title: activeTab.title || activeTab.url });
        // Update association: old tab mapping is stale, reassociate
        const oldTabId = bookmarkToTab.get(bookmarkId);
        if (oldTabId != null) {
          tabToBookmark.delete(oldTabId);
        }
        bookmarkToTab.set(bookmarkId, activeTab.id!);
        tabToBookmark.set(activeTab.id!, bookmarkId);
      }
      return await getFullState();
    }

    case "reorderOpenTab": {
      const tabId = message.tabId as number;
      const toIndex = message.toIndex as number;
      // Get current open tabs in order to find the target Chrome tab index
      const currentTabs = await chrome.tabs.query({});
      const openTabsList = getOpenTabs(
        currentTabs.map((t) => ({ id: t.id!, url: t.url, title: t.title, favIconUrl: t.favIconUrl })),
        tabToBookmark,
        null,
      );
      // Find the Chrome index to move to
      if (toIndex < openTabsList.length) {
        const targetTabId = openTabsList[toIndex].tabId;
        const targetTab = currentTabs.find((t) => t.id === targetTabId);
        if (targetTab) {
          await chrome.tabs.move(tabId, { index: targetTab.index });
        }
      } else {
        // Move to end
        await chrome.tabs.move(tabId, { index: -1 });
      }
      return await getFullState();
    }

    case "reorderBookmark": {
      const bookmarkId = message.bookmarkId as string;
      const parentId = message.parentId as string;
      const index = message.index as number;
      await chrome.bookmarks.move(bookmarkId, { parentId, index });
      return await getFullState();
    }

    case "getPinnedIds":
      return pinnedIds;

    default:
      return null;
  }
}

// Build the full state object for the side panel
async function getFullState() {
  const tree = await chrome.bookmarks.getTree();
  const rootChildren = tree[0].children ?? [];

  const allTabs = await chrome.tabs.query({});
  const [activeTabInfo] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const activeTabId = activeTabInfo?.id ?? null;

  // Build tab favicon and URL maps for live updates
  const tabFavIcons = new Map<number, string | undefined>();
  const tabUrls = new Map<number, string | undefined>();
  for (const t of allTabs) {
    if (t.id) {
      if (t.favIconUrl) tabFavIcons.set(t.id, t.favIconUrl);
      if (t.url) tabUrls.set(t.id, t.url);
    }
  }

  // Annotate the full bookmark tree
  const annotatedRoots = rootChildren.map((n) =>
    annotateNode(n as BookmarkNode, bookmarkToTab, activeTabId, tabFavIcons, tabUrls)
  );

  // Flatten for pinned lookup
  const allAnnotatedFlat = annotatedRoots.flatMap((root) => {
    const flat = [root];
    function walk(node: typeof root) {
      if (node.children) {
        for (const c of node.children) {
          flat.push(c);
          walk(c);
        }
      }
    }
    walk(root);
    return flat;
  });

  // Zone 1: pinned bookmarks (ordered by pinnedIds)
  const pinned = getPinnedBookmarks(pinnedIds, allAnnotatedFlat);

  // Zone 2: full bookmark tree minus pinned items
  const pinnedSet = new Set(pinnedIds);
  const bookmarks = annotatedRoots.map((root) => ({
    ...root,
    children: root.children ? filterPinnedFromTree(root.children, pinnedSet) : undefined,
  }));

  // Zone 3: open tabs not matching any bookmark
  const openTabs = getOpenTabs(
    allTabs.map((t) => ({ id: t.id!, url: t.url, title: t.title, favIconUrl: t.favIconUrl })),
    tabToBookmark,
    activeTabId,
  );

  return {
    pinned,
    bookmarks,
    openTabs,
    activeTabId,
    pinnedIds,
    rootFolderId: otherBookmarksFolderId!,
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
