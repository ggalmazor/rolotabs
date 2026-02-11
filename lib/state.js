// State management — pure logic for bookmark↔tab associations

import { urlsMatch } from "./urls.js";

/**
 * Build bookmark→tab and tab→bookmark maps from a list of bookmarks and tabs.
 * @param {Array<{id: string, url?: string}>} bookmarks
 * @param {Array<{id: number, url?: string}>} tabs
 * @returns {{ bookmarkToTab: Map<string, number|null>, tabToBookmark: Map<number, string> }}
 */
export function buildAssociations(bookmarks, tabs) {
  const bookmarkToTab = new Map();
  const tabToBookmark = new Map();

  for (const bm of bookmarks) {
    if (!bm.url) continue; // skip folders

    const matchingTab = tabs.find(
      (t) => urlsMatch(t.url, bm.url) && !tabToBookmark.has(t.id)
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
 * @param {string} url
 * @param {Map<string, number|null>} bookmarkToTab
 * @param {Array<{id: string, url?: string}>} bookmarks - flat list for URL lookup
 * @returns {string|null} bookmarkId or null
 */
export function findMatchingBookmark(url, bookmarkToTab, bookmarks) {
  if (!url) return null;
  for (const [bmId, tabId] of bookmarkToTab.entries()) {
    if (tabId !== null) continue;
    const bm = bookmarks.find((b) => b.id === bmId);
    if (bm && bm.url && urlsMatch(bm.url, url)) {
      return bmId;
    }
  }
  return null;
}

/**
 * Annotate a bookmark tree node with tab status info.
 * @param {object} node - bookmark node with optional children
 * @param {Map<string, number|null>} bookmarkToTab
 * @param {number|null} activeTabId
 * @returns {object} annotated node
 */
export function annotateNode(node, bookmarkToTab, activeTabId) {
  const tabId = bookmarkToTab.get(node.id) ?? null;
  const result = {
    id: node.id,
    title: node.title,
    url: node.url,
    parentId: node.parentId,
    index: node.index,
    isFolder: !node.url,
    tabId,
    isLoaded: tabId != null,
    isActive: tabId != null && tabId === activeTabId,
  };
  if (node.children) {
    result.children = node.children.map((c) =>
      annotateNode(c, bookmarkToTab, activeTabId)
    );
  }
  return result;
}

/**
 * Filter tabs to find "unlinked" ones (not associated with any bookmark,
 * not chrome:// or extension pages).
 * @param {Array<{id: number, url?: string, title?: string, favIconUrl?: string}>} allTabs
 * @param {Map<number, string>} tabToBookmark
 * @param {number|null} activeTabId
 * @returns {Array<object>}
 */
export function getUnlinkedTabs(allTabs, tabToBookmark, activeTabId) {
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
    }));
}

/**
 * Flatten a bookmark tree into a list of nodes.
 * @param {object} rootNode - the root node (its children are walked)
 * @returns {Array<object>}
 */
export function flattenBookmarkTree(rootNode) {
  const results = [];
  function walk(node) {
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
 * Check if a bookmark ID is under a root folder, given a parentId lookup function.
 * @param {string} bookmarkId
 * @param {string} rootFolderId
 * @param {function(string): string|null} getParentId - returns parentId or null
 * @param {number} [maxDepth=20]
 * @returns {boolean}
 */
export function isUnderRoot(bookmarkId, rootFolderId, getParentId, maxDepth = 20) {
  let current = bookmarkId;
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
