/** A Chrome bookmark node (subset of chrome.bookmarks.BookmarkTreeNode). */
export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  children?: BookmarkNode[];
}

/** A Chrome tab (subset of chrome.tabs.Tab). */
export interface TabInfo {
  id: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
}

/**
 * A bookmark enriched with extension state (pinned, tab association, live tab info).
 * This is the core model — a projection of Chrome's bookmark/tab state
 * decorated with Rolotabs business logic.
 */
export interface ManagedBookmark {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  isFolder: boolean;
  children?: ManagedBookmark[];

  // Extension state
  isPinned: boolean;

  // Tab association
  tabId: number | null;
  isLoaded: boolean;
  isActive: boolean;

  // Live tab state (when loaded)
  tabUrl?: string;
  favIconUrl?: string;
}

/** The two Maps that track bookmark↔tab associations. */
export interface Associations {
  bookmarkToTab: Map<string, number | null>;
  tabToBookmark: Map<number, string>;
}

/** An open tab shown in zone 3 (not matching any bookmark). */
export interface OpenTab {
  tabId: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  isActive: boolean;
}

/** Full state sent from background to side panel. */
export interface PanelState {
  pinned: ManagedBookmark[];
  bookmarks: ManagedBookmark[];
  openTabs: OpenTab[];
  activeTabId: number | null;
  pinnedIds: string[];
  rootFolderId: string;
}
