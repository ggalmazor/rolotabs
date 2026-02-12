import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { BookmarkIndex } from "../src/lib/bookmark-index.ts";
import type { BookmarkNode, TabInfo } from "../src/lib/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mimics tree[0].children from chrome.bookmarks.getTree() — the array
 *  of top-level folders (Bookmarks Bar, Other Bookmarks) that background.ts
 *  passes to BookmarkIndex.rebuild(). */
function makeTree(...children: BookmarkNode[]): BookmarkNode[] {
  return [
    { id: "1", title: "Bookmarks Bar", children: [] },
    { id: "2", title: "Other Bookmarks", children },
  ];
}

function tab(id: number, url: string, opts?: Partial<TabInfo>): TabInfo {
  return { id, url, title: url, ...opts };
}

function bm(id: string, url: string, opts?: Partial<BookmarkNode>): BookmarkNode {
  return { id, title: url, url, parentId: "2", ...opts };
}

function folder(id: string, title: string, children: BookmarkNode[]): BookmarkNode {
  return { id, title, parentId: "2", children };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BookmarkIndex", () => {
  let index: BookmarkIndex;

  beforeEach(() => {
    index = new BookmarkIndex();
  });

  // -------------------------------------------------------------------------
  // rebuild + getState
  // -------------------------------------------------------------------------

  describe("rebuild and getState", () => {
    it("produces correct zones for a simple setup", () => {
      const tree = makeTree(bm("bm1", "https://a.com"), bm("bm2", "https://b.com"));
      const tabs = [tab(1, "https://a.com"), tab(2, "https://c.com")];

      index.rebuild(tree, tabs, [], "2");
      const state = index.getState(1, tabs);

      // Zone 1: no pinned
      assertEquals(state.pinned.length, 0);

      // Zone 2: two bookmarks, bm1 loaded
      const allBookmarks = state.bookmarks.flatMap((r) => r.children ?? []);
      assertEquals(allBookmarks.length, 2);
      const a = allBookmarks.find((b) => b.id === "bm1")!;
      assertEquals(a.isLoaded, true);
      assertEquals(a.isActive, true);
      assertEquals(a.tabId, 1);

      const b = allBookmarks.find((b) => b.id === "bm2")!;
      assertEquals(b.isLoaded, false);
      assertEquals(b.tabId, null);

      // Zone 3: tab 2 is unlinked
      assertEquals(state.openTabs.length, 1);
      assertEquals(state.openTabs[0].tabId, 2);
      assertEquals(state.openTabs[0].url, "https://c.com");
    });

    it("pinned bookmarks appear in zone 1 and are excluded from zone 2", () => {
      const tree = makeTree(bm("bm1", "https://a.com"), bm("bm2", "https://b.com"));
      index.rebuild(tree, [], ["bm1"], "2");
      const state = index.getState(null, []);

      assertEquals(state.pinned.length, 1);
      assertEquals(state.pinned[0].id, "bm1");
      assertEquals(state.pinned[0].isPinned, true);

      const zone2Items = state.bookmarks.flatMap((r) => r.children ?? []);
      assertEquals(zone2Items.length, 1);
      assertEquals(zone2Items[0].id, "bm2");
    });

    it("filters chrome:// and extension URLs from zone 3", () => {
      const tree = makeTree();
      const tabs = [
        tab(1, "chrome://extensions"),
        tab(2, "chrome-extension://abc/popup.html"),
        tab(3, "https://real.com"),
      ];
      index.rebuild(tree, tabs, [], "2");
      const state = index.getState(null, tabs);

      assertEquals(state.openTabs.length, 1);
      assertEquals(state.openTabs[0].url, "https://real.com");
    });

    it("preserves folder structure in zone 2", () => {
      const tree = makeTree(
        folder("f1", "Work", [bm("bm1", "https://a.com"), bm("bm2", "https://b.com")]),
        bm("bm3", "https://c.com"),
      );
      index.rebuild(tree, [], [], "2");
      const state = index.getState(null, []);

      const zone2 = state.bookmarks.flatMap((r) => r.children ?? []);
      assertEquals(zone2.length, 2); // folder + bm3
      const f = zone2.find((n) => n.isFolder)!;
      assertEquals(f.title, "Work");
      assertEquals(f.children?.length, 2);
    });

    it("does not double-assign the same tab to two bookmarks", () => {
      const tree = makeTree(bm("bm1", "https://a.com"), bm("bm2", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      const state = index.getState(null, tabs);
      const allBm = state.bookmarks.flatMap((r) => r.children ?? []);
      const loaded = allBm.filter((b) => b.isLoaded);
      assertEquals(loaded.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Associations
  // -------------------------------------------------------------------------

  describe("associate and dissociate", () => {
    it("associate marks a bookmark as loaded", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], [], "2");

      index.associate("bm1", 42, tab(42, "https://a.com"));
      const state = index.getState(42, [tab(42, "https://a.com")]);

      const b = state.bookmarks.flatMap((r) => r.children ?? []).find((b) => b.id === "bm1")!;
      assertEquals(b.isLoaded, true);
      assertEquals(b.tabId, 42);
      assertEquals(b.isActive, true);
    });

    it("dissociate marks a bookmark as unloaded", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      index.dissociate("bm1");
      const state = index.getState(null, tabs);

      const b = state.bookmarks.flatMap((r) => r.children ?? []).find((b) => b.id === "bm1")!;
      assertEquals(b.isLoaded, false);
      assertEquals(b.tabId, null);
    });

    it("dissociateTab removes the association by tab ID", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      index.dissociateTab(1);
      const b = index.get("bm1")!;
      assertEquals(b.isLoaded, false);
    });

    it("reassociating a tab breaks the old bookmark's association", () => {
      const tree = makeTree(bm("bm1", "https://a.com"), bm("bm2", "https://b.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      // Now associate the same tab with bm2
      index.associate("bm2", 1);

      assertEquals(index.get("bm1")!.isLoaded, false);
      assertEquals(index.get("bm2")!.isLoaded, true);
      assertEquals(index.get("bm2")!.tabId, 1);
    });
  });

  // -------------------------------------------------------------------------
  // tryAssociateByUrl
  // -------------------------------------------------------------------------

  describe("tryAssociateByUrl", () => {
    it("matches an unloaded bookmark by URL", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], [], "2");

      const result = index.tryAssociateByUrl(5, "https://a.com");
      assertEquals(result, "bm1");
      assertEquals(index.get("bm1")!.tabId, 5);
      assertEquals(index.get("bm1")!.isLoaded, true);
    });

    it("returns null when no bookmark matches", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], [], "2");

      const result = index.tryAssociateByUrl(5, "https://z.com");
      assertEquals(result, null);
    });

    it("skips already-loaded bookmarks", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      // bm1 is already loaded with tab 1
      const result = index.tryAssociateByUrl(2, "https://a.com");
      assertEquals(result, null);
    });

    it("matches URLs ignoring trailing slashes", () => {
      const tree = makeTree(bm("bm1", "https://a.com/path/"));
      index.rebuild(tree, [], [], "2");

      const result = index.tryAssociateByUrl(5, "https://a.com/path");
      assertEquals(result, "bm1");
    });
  });

  // -------------------------------------------------------------------------
  // handleTabNavigation
  // -------------------------------------------------------------------------

  describe("handleTabNavigation", () => {
    it("keeps association when navigating away (no other bookmark matches)", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      index.handleTabNavigation(1, "https://different.com", tab(1, "https://different.com"));

      const b = index.get("bm1")!;
      assertEquals(b.isLoaded, true);
      assertEquals(b.tabId, 1);
      assertEquals(b.tabUrl, "https://different.com");
    });

    it("reassociates when navigating to a URL matching another bookmark", () => {
      const tree = makeTree(bm("bm1", "https://a.com"), bm("bm2", "https://b.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      index.handleTabNavigation(1, "https://b.com", tab(1, "https://b.com"));

      assertEquals(index.get("bm1")!.isLoaded, false);
      assertEquals(index.get("bm2")!.isLoaded, true);
      assertEquals(index.get("bm2")!.tabId, 1);
    });

    it("associates an untracked tab when it navigates to a bookmark URL", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], [], "2");

      index.handleTabNavigation(5, "https://a.com", tab(5, "https://a.com"));

      assertEquals(index.get("bm1")!.isLoaded, true);
      assertEquals(index.get("bm1")!.tabId, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Pinned management
  // -------------------------------------------------------------------------

  describe("pin, unpin, reorderPinned", () => {
    it("pin adds to pinnedIds and marks isPinned", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], [], "2");

      index.pin("bm1");

      assertEquals(index.getPinnedIds(), ["bm1"]);
      assertEquals(index.get("bm1")!.isPinned, true);
    });

    it("pin is idempotent", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], [], "2");

      index.pin("bm1");
      index.pin("bm1");

      assertEquals(index.getPinnedIds(), ["bm1"]);
    });

    it("unpin removes from pinnedIds and clears isPinned", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], ["bm1"], "2");

      index.unpin("bm1");

      assertEquals(index.getPinnedIds(), []);
      assertEquals(index.get("bm1")!.isPinned, false);
    });

    it("reorderPinned moves items", () => {
      const tree = makeTree(
        bm("a", "https://a.com"),
        bm("b", "https://b.com"),
        bm("c", "https://c.com"),
      );
      index.rebuild(tree, [], ["a", "b", "c"], "2");

      index.reorderPinned("c", 0);

      assertEquals(index.getPinnedIds(), ["c", "a", "b"]);
    });

    it("cleanupPinned removes IDs not in the index", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], ["bm1", "deleted", "gone"], "2");

      const changed = index.cleanupPinned();

      assertEquals(changed, true);
      assertEquals(index.getPinnedIds(), ["bm1"]);
    });

    it("cleanupPinned returns false when nothing changed", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], ["bm1"], "2");

      const changed = index.cleanupPinned();
      assertEquals(changed, false);
    });
  });

  // -------------------------------------------------------------------------
  // Active tab
  // -------------------------------------------------------------------------

  describe("setActiveTab", () => {
    it("marks the associated bookmark as active", () => {
      const tree = makeTree(bm("bm1", "https://a.com"), bm("bm2", "https://b.com"));
      const tabs = [tab(1, "https://a.com"), tab(2, "https://b.com")];
      index.rebuild(tree, tabs, [], "2");

      const state = index.getState(2, tabs);
      const allBm = state.bookmarks.flatMap((r) => r.children ?? []);

      assertEquals(allBm.find((b) => b.id === "bm1")!.isActive, false);
      assertEquals(allBm.find((b) => b.id === "bm2")!.isActive, true);
    });

    it("marks zone 3 tab as active", () => {
      const tree = makeTree();
      const tabs = [tab(1, "https://a.com"), tab(2, "https://b.com")];
      index.rebuild(tree, tabs, [], "2");

      const state = index.getState(2, tabs);
      assertEquals(state.openTabs.find((t) => t.tabId === 1)!.isActive, false);
      assertEquals(state.openTabs.find((t) => t.tabId === 2)!.isActive, true);
    });

    it("handles null activeTabId (no tab active)", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      const state = index.getState(null, tabs);
      const b = state.bookmarks.flatMap((r) => r.children ?? []).find((b) => b.id === "bm1")!;
      assertEquals(b.isActive, false);
    });
  });

  // -------------------------------------------------------------------------
  // Tab info updates
  // -------------------------------------------------------------------------

  describe("updateTabInfo", () => {
    it("updates favicon on associated bookmark", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      index.updateTabInfo(1, { favIconUrl: "https://a.com/favicon.ico" });

      assertEquals(index.get("bm1")!.favIconUrl, "https://a.com/favicon.ico");
    });

    it("does nothing for unassociated tabs", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], [], "2");

      // tab 99 is not associated
      index.updateTabInfo(99, { favIconUrl: "https://x.com/icon.png" });

      assertEquals(index.get("bm1")!.favIconUrl, undefined);
    });
  });

  // -------------------------------------------------------------------------
  // Bookmark mutations
  // -------------------------------------------------------------------------

  describe("addBookmark", () => {
    it("adds a bookmark and associates with a matching tab", () => {
      const tree = makeTree();
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      index.addBookmark(bm("bm1", "https://a.com"), tabs);

      const b = index.get("bm1")!;
      assertEquals(b.isLoaded, true);
      assertEquals(b.tabId, 1);
    });

    it("adds a bookmark without a matching tab", () => {
      const tree = makeTree();
      index.rebuild(tree, [], [], "2");

      index.addBookmark(bm("bm1", "https://a.com"), []);

      const b = index.get("bm1")!;
      assertEquals(b.isLoaded, false);
      assertEquals(b.tabId, null);
    });
  });

  describe("removeBookmark", () => {
    it("removes bookmark and cleans up associations", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      index.removeBookmark("bm1");

      assertEquals(index.get("bm1"), undefined);
      assertEquals(index.isTabAssociated(1), false);
    });

    it("removes from pinned if pinned", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      index.rebuild(tree, [], ["bm1"], "2");

      index.removeBookmark("bm1");

      assertEquals(index.getPinnedIds(), []);
    });
  });

  describe("updateBookmarkUrl", () => {
    it("updates URL and reassociates with matching tab", () => {
      const tree = makeTree(bm("bm1", "https://old.com"));
      const tabs = [tab(1, "https://new.com")];
      index.rebuild(tree, tabs, [], "2");

      // bm1 is not loaded (URL doesn't match any tab)
      assertEquals(index.get("bm1")!.isLoaded, false);

      index.updateBookmarkUrl("bm1", "https://new.com", tabs);

      assertEquals(index.get("bm1")!.url, "https://new.com");
      assertEquals(index.get("bm1")!.isLoaded, true);
      assertEquals(index.get("bm1")!.tabId, 1);
    });

    it("breaks old association when URL changes", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      assertEquals(index.get("bm1")!.isLoaded, true);

      index.updateBookmarkUrl("bm1", "https://different.com", []);

      assertEquals(index.get("bm1")!.isLoaded, false);
      assertEquals(index.get("bm1")!.tabId, null);
      assertEquals(index.isTabAssociated(1), false);
    });
  });

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  describe("lookups", () => {
    it("getBookmarkIdForTab returns the associated bookmark", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      assertEquals(index.getBookmarkIdForTab(1), "bm1");
      assertEquals(index.getBookmarkIdForTab(999), undefined);
    });

    it("getTabId returns the associated tab", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com")];
      index.rebuild(tree, tabs, [], "2");

      assertEquals(index.getTabId("bm1"), 1);
      assertEquals(index.getTabId("nonexistent"), null);
    });

    it("isTabAssociated returns correct boolean", () => {
      const tree = makeTree(bm("bm1", "https://a.com"));
      const tabs = [tab(1, "https://a.com"), tab(2, "https://b.com")];
      index.rebuild(tree, tabs, [], "2");

      assertEquals(index.isTabAssociated(1), true);
      assertEquals(index.isTabAssociated(2), false);
    });
  });
});
