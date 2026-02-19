import { urlsMatch } from "./urls.ts";
import type { BookmarkNode, ManagedBookmark, OpenTab, PanelState, TabInfo } from "./types.ts";

/**
 * BookmarkIndex — the core model of Rolotabs.
 *
 * A read-through cache that projects Chrome's bookmark tree and tab state
 * into an enriched model with Rolotabs-specific attributes (pinned state,
 * tab associations). Chrome is the source of truth for bookmarks and tabs;
 * this index owns pinned order and association tracking.
 *
 * Design:
 * - Flat lookup maps for fast queries (byId, byTabId, byUrl)
 * - Tree structure maintained for rendering
 * - Targeted updates on Chrome events (no full rebuild on every interaction)
 * - `getState()` produces the PanelState for the side panel
 */
export class BookmarkIndex {
  // Primary store
  private byId = new Map<string, ManagedBookmark>();

  // Reverse indexes
  private tabToBookmarkId = new Map<number, string>();
  private urlToBookmarkIds = new Map<string, Set<string>>();

  // Pinned state (owned by Rolotabs)
  private pinnedIds: string[] = [];

  // Tree roots (for rendering)
  private roots: ManagedBookmark[] = [];

  // Root folder ID (Other Bookmarks)
  rootFolderId: string = "";

  // ---------------------------------------------------------------------------
  // Rebuild — full refresh from Chrome APIs
  // ---------------------------------------------------------------------------

  rebuild(
    tree: BookmarkNode[],
    tabs: TabInfo[],
    pinnedIds: string[],
    rootFolderId: string,
  ): void {
    this.byId.clear();
    this.tabToBookmarkId.clear();
    this.urlToBookmarkIds.clear();
    this.pinnedIds = [...pinnedIds];
    this.rootFolderId = rootFolderId;

    const pinnedSet = new Set(pinnedIds);

    // Build flat bookmark index
    const flatBookmarks: { id: string; url?: string }[] = [];
    const flatten = (node: BookmarkNode) => {
      if (node.url) flatBookmarks.push({ id: node.id, url: node.url });
      if (node.children) node.children.forEach(flatten);
    };
    tree.forEach((root) => root.children?.forEach(flatten));

    // URL index for fast association
    for (const bm of flatBookmarks) {
      if (bm.url) {
        const normalized = this.normalizeUrl(bm.url);
        if (normalized) {
          let set = this.urlToBookmarkIds.get(normalized);
          if (!set) {
            set = new Set();
            this.urlToBookmarkIds.set(normalized, set);
          }
          set.add(bm.id);
        }
      }
    }

    // Associate tabs with bookmarks
    const tabById = new Map<number, TabInfo>();
    const usedTabIds = new Set<number>();

    for (const t of tabs) {
      tabById.set(t.id, t);
    }

    // Match bookmarks to tabs by URL
    for (const bm of flatBookmarks) {
      if (!bm.url) continue;
      const matchingTab = tabs.find(
        (t) => urlsMatch(t.url, bm.url) && !usedTabIds.has(t.id),
      );
      if (matchingTab) {
        usedTabIds.add(matchingTab.id);
        this.tabToBookmarkId.set(matchingTab.id, bm.id);
      }
    }

    // Build a reverse map for fast bookmark→tab lookup during annotation
    const bookmarkIdToTabId = new Map<string, number>();
    for (const [tid, bid] of this.tabToBookmarkId.entries()) {
      bookmarkIdToTabId.set(bid, tid);
    }

    // Build annotated tree
    const annotate = (node: BookmarkNode): ManagedBookmark => {
      const associatedTabId = bookmarkIdToTabId.get(node.id) ?? null;

      const tab = associatedTabId !== null ? tabById.get(associatedTabId) : null;

      const managed: ManagedBookmark = {
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        index: node.index,
        isFolder: !node.url,
        isPinned: pinnedSet.has(node.id),
        tabId: associatedTabId,
        isLoaded: associatedTabId !== null,
        isActive: false, // set later by setActiveTab
      };

      if (tab) {
        if (tab.favIconUrl) managed.favIconUrl = tab.favIconUrl;
        if (tab.url) managed.tabUrl = tab.url;
      }

      if (node.children) {
        managed.children = node.children.map(annotate);
      }

      this.byId.set(node.id, managed);
      return managed;
    };

    this.roots = tree.map(annotate);
  }

  // ---------------------------------------------------------------------------
  // Active tab
  // ---------------------------------------------------------------------------

  setActiveTab(tabId: number | null): void {
    // Clear previous active
    for (const bm of this.byId.values()) {
      bm.isActive = false;
    }
    if (tabId !== null) {
      const bookmarkId = this.tabToBookmarkId.get(tabId);
      if (bookmarkId) {
        const bm = this.byId.get(bookmarkId);
        if (bm) bm.isActive = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Association management
  // ---------------------------------------------------------------------------

  associate(bookmarkId: string, tabId: number, tab?: TabInfo): void {
    // Break any existing association for this tab
    const oldBookmarkId = this.tabToBookmarkId.get(tabId);
    if (oldBookmarkId && oldBookmarkId !== bookmarkId) {
      const oldBm = this.byId.get(oldBookmarkId);
      if (oldBm) {
        oldBm.tabId = null;
        oldBm.isLoaded = false;
        oldBm.isActive = false;
        oldBm.tabUrl = undefined;
        oldBm.favIconUrl = undefined;
      }
    }

    // Break any existing association for this bookmark
    const oldTabId = this.getTabId(bookmarkId);
    if (oldTabId !== null) {
      this.tabToBookmarkId.delete(oldTabId);
    }

    this.tabToBookmarkId.set(tabId, bookmarkId);
    const bm = this.byId.get(bookmarkId);
    if (bm) {
      bm.tabId = tabId;
      bm.isLoaded = true;
      if (tab) {
        if (tab.favIconUrl) bm.favIconUrl = tab.favIconUrl;
        if (tab.url) bm.tabUrl = tab.url;
      }
    }
  }

  dissociate(bookmarkId: string): void {
    const tabId = this.getTabId(bookmarkId);
    if (tabId !== null) {
      this.tabToBookmarkId.delete(tabId);
    }
    const bm = this.byId.get(bookmarkId);
    if (bm) {
      bm.tabId = null;
      bm.isLoaded = false;
      bm.isActive = false;
      bm.tabUrl = undefined;
      bm.favIconUrl = undefined;
    }
  }

  dissociateTab(tabId: number): void {
    const bookmarkId = this.tabToBookmarkId.get(tabId);
    if (bookmarkId) {
      this.dissociate(bookmarkId);
    }
  }

  /**
   * Try to associate a tab with an unloaded bookmark by URL.
   * Returns the matched bookmark ID, or null if no match.
   */
  tryAssociateByUrl(tabId: number, url: string, tab?: TabInfo): string | null {
    const normalized = this.normalizeUrl(url);
    if (!normalized) return null;

    const candidates = this.urlToBookmarkIds.get(normalized);
    if (!candidates) return null;

    for (const bmId of candidates) {
      const bm = this.byId.get(bmId);
      if (bm && !bm.isLoaded) {
        this.associate(bmId, tabId, tab);
        return bmId;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Pinned management
  // ---------------------------------------------------------------------------

  getPinnedIds(): string[] {
    return [...this.pinnedIds];
  }

  pin(bookmarkId: string): void {
    if (!this.pinnedIds.includes(bookmarkId)) {
      this.pinnedIds.push(bookmarkId);
      const bm = this.byId.get(bookmarkId);
      if (bm) bm.isPinned = true;
    }
  }

  unpin(bookmarkId: string): void {
    const idx = this.pinnedIds.indexOf(bookmarkId);
    if (idx !== -1) {
      this.pinnedIds.splice(idx, 1);
      const bm = this.byId.get(bookmarkId);
      if (bm) bm.isPinned = false;
    }
  }

  reorderPinned(bookmarkId: string, toIndex: number): void {
    const fromIndex = this.pinnedIds.indexOf(bookmarkId);
    if (fromIndex === -1) return;
    this.pinnedIds.splice(fromIndex, 1);
    const clamped = Math.max(0, Math.min(toIndex, this.pinnedIds.length));
    this.pinnedIds.splice(clamped, 0, bookmarkId);
  }

  /** Remove pinned IDs that are no longer in the index. Returns true if any were removed. */
  cleanupPinned(): boolean {
    const before = this.pinnedIds.length;
    this.pinnedIds = this.pinnedIds.filter((id) => this.byId.has(id));
    for (const bm of this.byId.values()) {
      bm.isPinned = this.pinnedIds.includes(bm.id);
    }
    return this.pinnedIds.length !== before;
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  get(bookmarkId: string): ManagedBookmark | undefined {
    return this.byId.get(bookmarkId);
  }

  getBookmarkIdForTab(tabId: number): string | undefined {
    return this.tabToBookmarkId.get(tabId);
  }

  getTabId(bookmarkId: string): number | null {
    for (const [tabId, bmId] of this.tabToBookmarkId.entries()) {
      if (bmId === bookmarkId) return tabId;
    }
    return null;
  }

  isTabAssociated(tabId: number): boolean {
    return this.tabToBookmarkId.has(tabId);
  }

  // ---------------------------------------------------------------------------
  // Tab state updates (favicon, URL changes)
  // ---------------------------------------------------------------------------

  updateTabInfo(tabId: number, info: { url?: string; favIconUrl?: string; title?: string }): void {
    const bookmarkId = this.tabToBookmarkId.get(tabId);
    if (!bookmarkId) return;
    const bm = this.byId.get(bookmarkId);
    if (!bm) return;

    if (info.favIconUrl !== undefined) bm.favIconUrl = info.favIconUrl;
    if (info.url !== undefined) bm.tabUrl = info.url;
  }

  /**
   * Handle a tab navigating to a new URL.
   * If the new URL matches a different unloaded bookmark, reassociate.
   * Otherwise, keep the current association (navigated away).
   */
  handleTabNavigation(tabId: number, newUrl: string, tab?: TabInfo): void {
    const currentBookmarkId = this.tabToBookmarkId.get(tabId);

    if (currentBookmarkId) {
      // Temporarily dissociate to let tryAssociateByUrl find a new match
      this.tabToBookmarkId.delete(tabId);
      const bm = this.byId.get(currentBookmarkId);
      if (bm) {
        bm.tabId = null;
        bm.isLoaded = false;
      }

      const newMatch = this.tryAssociateByUrl(tabId, newUrl, tab);

      if (!newMatch) {
        // No other bookmark matched — restore original association (navigated away)
        this.tabToBookmarkId.set(tabId, currentBookmarkId);
        if (bm) {
          bm.tabId = tabId;
          bm.isLoaded = true;
          bm.tabUrl = newUrl;
          if (tab?.favIconUrl) bm.favIconUrl = tab.favIconUrl;
        }
      }
    } else {
      // Tab wasn't associated — try to match it
      this.tryAssociateByUrl(tabId, newUrl, tab);
    }
  }

  // ---------------------------------------------------------------------------
  // Bookmark mutations (update the index when Chrome events fire)
  // ---------------------------------------------------------------------------

  addBookmark(node: BookmarkNode, tabs: TabInfo[]): void {
    const bm: ManagedBookmark = {
      id: node.id,
      title: node.title,
      url: node.url,
      parentId: node.parentId,
      index: node.index,
      isFolder: !node.url,
      isPinned: this.pinnedIds.includes(node.id),
      tabId: null,
      isLoaded: false,
      isActive: false,
    };

    this.byId.set(node.id, bm);

    // Add to URL index
    if (node.url) {
      const normalized = this.normalizeUrl(node.url);
      if (normalized) {
        let set = this.urlToBookmarkIds.get(normalized);
        if (!set) {
          set = new Set();
          this.urlToBookmarkIds.set(normalized, set);
        }
        set.add(node.id);
      }

      // Try to associate with an open tab
      const matchingTab = tabs.find(
        (t) => urlsMatch(t.url, node.url) && !this.tabToBookmarkId.has(t.id),
      );
      if (matchingTab) {
        this.associate(node.id, matchingTab.id, matchingTab);
      }
    }
  }

  removeBookmark(bookmarkId: string): void {
    const bm = this.byId.get(bookmarkId);
    if (!bm) return;

    // Clean up associations
    if (bm.tabId !== null) {
      this.tabToBookmarkId.delete(bm.tabId);
    }

    // Clean up URL index
    if (bm.url) {
      const normalized = this.normalizeUrl(bm.url);
      if (normalized) {
        const set = this.urlToBookmarkIds.get(normalized);
        if (set) {
          set.delete(bookmarkId);
          if (set.size === 0) this.urlToBookmarkIds.delete(normalized);
        }
      }
    }

    // Clean up pinned
    this.unpin(bookmarkId);

    this.byId.delete(bookmarkId);
  }

  updateBookmarkTitle(bookmarkId: string, newTitle: string): void {
    const bm = this.byId.get(bookmarkId);
    if (!bm) return;
    bm.title = newTitle;
  }

  updateBookmarkUrl(bookmarkId: string, newUrl: string, tabs: TabInfo[]): void {
    const bm = this.byId.get(bookmarkId);
    if (!bm) return;

    // Remove old URL from index
    if (bm.url) {
      const oldNormalized = this.normalizeUrl(bm.url);
      if (oldNormalized) {
        const set = this.urlToBookmarkIds.get(oldNormalized);
        if (set) {
          set.delete(bookmarkId);
          if (set.size === 0) this.urlToBookmarkIds.delete(oldNormalized);
        }
      }
    }

    // Break old association
    if (bm.tabId !== null) {
      this.tabToBookmarkId.delete(bm.tabId);
      bm.tabId = null;
      bm.isLoaded = false;
      bm.tabUrl = undefined;
      bm.favIconUrl = undefined;
    }

    // Update URL
    bm.url = newUrl;

    // Add new URL to index
    const newNormalized = this.normalizeUrl(newUrl);
    if (newNormalized) {
      let set = this.urlToBookmarkIds.get(newNormalized);
      if (!set) {
        set = new Set();
        this.urlToBookmarkIds.set(newNormalized, set);
      }
      set.add(bookmarkId);
    }

    // Try to associate with an open tab
    const matchingTab = tabs.find(
      (t) => urlsMatch(t.url, newUrl) && !this.tabToBookmarkId.has(t.id),
    );
    if (matchingTab) {
      this.associate(bookmarkId, matchingTab.id, matchingTab);
    }
  }

  // ---------------------------------------------------------------------------
  // State projection — produces the PanelState for the side panel
  // ---------------------------------------------------------------------------

  getState(activeTabId: number | null, allTabs: TabInfo[]): PanelState {
    this.setActiveTab(activeTabId);

    // Zone 1: pinned bookmarks in order
    const pinned: ManagedBookmark[] = [];
    for (const id of this.pinnedIds) {
      const bm = this.byId.get(id);
      if (bm) pinned.push(bm);
    }

    // Zone 2: full tree minus pinned items
    const pinnedSet = new Set(this.pinnedIds);
    const filterPinned = (nodes: ManagedBookmark[]): ManagedBookmark[] =>
      nodes
        .filter((n) => !pinnedSet.has(n.id) || n.isFolder)
        .map((n) => n.children ? { ...n, children: filterPinned(n.children) } : n);

    const rootFolder = this.roots.find((r) => r.id === this.rootFolderId);
    const bookmarks = rootFolder
      ? [{
        ...rootFolder,
        children: rootFolder.children ? filterPinned(rootFolder.children) : undefined,
      }]
      : [];

    // Zone 3: open tabs not matching any bookmark
    const openTabs: OpenTab[] = allTabs
      .filter((t) => !this.tabToBookmarkId.has(t.id))
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
      bookmarks,
      openTabs,
      activeTabId,
      pinnedIds: [...this.pinnedIds],
      rootFolderId: this.rootFolderId,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal utilities
  // ---------------------------------------------------------------------------

  private normalizeUrl(url: string): string | null {
    try {
      const u = new URL(url);
      return u.origin + u.pathname.replace(/\/+$/, "") + u.search;
    } catch {
      return url || null;
    }
  }
}
