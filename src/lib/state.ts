import { urlsMatch } from "./urls.ts";
import type { Associations, BookmarkNode, ManagedBookmark, OpenTab, TabInfo } from "./types.ts";

/**
 * Build bookmark→tab and tab→bookmark maps from bookmarks and tabs.
 */
export function buildAssociations(bookmarks: BookmarkNode[], tabs: TabInfo[]): Associations {
  const bookmarkToTab = new Map<string, number | null>();
  const tabToBookmark = new Map<number, string>();

  for (const bm of bookmarks) {
    if (!bm.url) continue; // skip folders

    const matchingTab = tabs.find(
      (t) => urlsMatch(t.url, bm.url) && !tabToBookmark.has(t.id),
    );
    if (matchingTab) {
      bookmarkToTab.set(bm.id, matchingTab.id);
      tabToBookmark.set(matchingTab.id, bm.id);
    } else {
      bookmarkToTab.set(bm.id, null);
    }
  }

  return { bookmarkToTab, tabToBookmark };
}

/**
 * Find the first unassociated bookmark matching a URL.
 */
export function findMatchingBookmark(
  url: string | null | undefined,
  bookmarkToTab: Map<string, number | null>,
  bookmarks: BookmarkNode[],
): string | null {
  if (!url) return null;
  for (const [bmId, tabId] of bookmarkToTab.entries()) {
    if (tabId !== null) continue;
    const bm = bookmarks.find((b) => b.id === bmId);
    if (bm?.url && urlsMatch(bm.url, url)) {
      return bmId;
    }
  }
  return null;
}

/**
 * Annotate a bookmark tree node with tab status info.
 */
export function annotateNode(
  node: BookmarkNode,
  bookmarkToTab: Map<string, number | null>,
  activeTabId: number | null,
  tabFavIcons?: Map<number, string | undefined>,
  tabUrls?: Map<number, string | undefined>,
): ManagedBookmark {
  const tabId = bookmarkToTab.get(node.id) ?? null;
  const result: ManagedBookmark = {
    id: node.id,
    title: node.title,
    url: node.url,
    parentId: node.parentId,
    index: node.index,
    isFolder: !node.url,
    tabId,
    isLoaded: tabId != null,
    isActive: tabId != null && tabId === activeTabId,
    isPinned: false,
  };
  if (tabId != null && tabFavIcons) {
    const icon = tabFavIcons.get(tabId);
    if (icon) result.favIconUrl = icon;
  }
  if (tabId != null && tabUrls) {
    const url = tabUrls.get(tabId);
    if (url) result.tabUrl = url;
  }
  if (node.children) {
    result.children = node.children.map((c) =>
      annotateNode(c, bookmarkToTab, activeTabId, tabFavIcons, tabUrls)
    );
  }
  return result;
}

/**
 * Get open tabs that are NOT associated with any bookmark
 * (excluding chrome:// and extension pages).
 */
export function getOpenTabs(
  allTabs: TabInfo[],
  tabToBookmark: Map<number, string>,
  activeTabId: number | null,
): OpenTab[] {
  return allTabs
    .filter((t) => !tabToBookmark.has(t.id))
    .filter((t) => !t.url?.startsWith("chrome://"))
    .filter((t) => !t.url?.startsWith("chrome-extension://"))
    .map((t) => ({
      tabId: t.id,
      title: t.title,
      url: t.url,
      favIconUrl: t.favIconUrl,
      isActive: t.id === activeTabId,
      isBookmarked: false,
    }));
}

/**
 * Flatten a bookmark tree into a list of nodes.
 */
export function flattenBookmarkTree(rootNode: BookmarkNode): BookmarkNode[] {
  const results: BookmarkNode[] = [];
  function walk(node: BookmarkNode): void {
    results.push(node);
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  if (rootNode.children) {
    for (const child of rootNode.children) {
      walk(child);
    }
  }
  return results;
}

/**
 * Given a list of pinned bookmark IDs and a flat list of annotated bookmarks,
 * return the pinned items in the order of pinnedIds.
 */
export function getPinnedBookmarks(
  pinnedIds: string[],
  allAnnotated: ManagedBookmark[],
): ManagedBookmark[] {
  const map = new Map<string, ManagedBookmark>();
  for (const bm of allAnnotated) {
    map.set(bm.id, bm);
  }
  return pinnedIds
    .map((id) => map.get(id))
    .filter((bm): bm is ManagedBookmark => bm != null);
}

/**
 * Remove pinned bookmark IDs from an annotated bookmark tree.
 * Returns a new tree with pinned leaf nodes removed.
 * Empty folders that result from removal are kept.
 */
export function filterPinnedFromTree(
  nodes: ManagedBookmark[],
  pinnedIds: Set<string>,
): ManagedBookmark[] {
  return nodes
    .filter((node) => !pinnedIds.has(node.id) || node.isFolder)
    .map((node) => {
      if (node.children) {
        return { ...node, children: filterPinnedFromTree(node.children, pinnedIds) };
      }
      return node;
    });
}

/**
 * Check if a bookmark ID is under a root folder.
 * Uses a parentId lookup function to avoid depending on Chrome APIs directly.
 */
export function isUnderRoot(
  bookmarkId: string,
  rootFolderId: string,
  getParentId: (id: string) => string | null,
  maxDepth = 20,
): boolean {
  let current: string | null = bookmarkId;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (current === rootFolderId) return true;
    const parentId = getParentId(current);
    if (!parentId || parentId === "0") return false;
    current = parentId;
    depth++;
  }
  return false;
}
