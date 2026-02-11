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

/** Bookmark annotated with live tab status. */
export interface AnnotatedBookmark {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  isFolder: boolean;
  tabId: number | null;
  isLoaded: boolean;
  isActive: boolean;
  children?: AnnotatedBookmark[];
}

/** An open tab shown in zone 3. */
export interface OpenTab {
  tabId: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  isActive: boolean;
  isBookmarked: boolean;
}

/** The two Maps that track bookmark↔tab associations. */
export interface Associations {
  bookmarkToTab: Map<string, number | null>;
  tabToBookmark: Map<number, string>;
}

/** Folder IDs for the Rolotabs bookmark structure. */
export interface FolderIds {
  rootFolderId: string;
  pinnedFolderId: string;
  tabsFolderId: string;
}

/** Full state sent from background to side panel. */
export interface PanelState {
  pinned: AnnotatedBookmark[];
  tabs: AnnotatedBookmark[];
  openTabs: OpenTab[];
  activeTabId: number | null;
  folderIds: FolderIds;
}
