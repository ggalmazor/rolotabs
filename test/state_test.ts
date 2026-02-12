import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  buildAssociations,
  findMatchingBookmark,
  annotateNode,
  getOpenTabs,
  flattenBookmarkTree,
  isUnderRoot,
  getPinnedBookmarks,
  filterPinnedFromTree,
} from "../src/lib/state.ts";
import type { ManagedBookmark } from "../src/lib/types.ts";

describe("buildAssociations", () => {
  it("associates bookmarks with matching tabs", () => {
    const bookmarks = [
      { id: "bm1", title: "Ex", url: "https://example.com" },
      { id: "bm2", title: "Other", url: "https://other.com" },
    ];
    const tabs = [
      { id: 1, url: "https://example.com" },
      { id: 2, url: "https://unrelated.com" },
    ];

    const { bookmarkToTab, tabToBookmark } = buildAssociations(bookmarks, tabs);

    assertEquals(bookmarkToTab.get("bm1"), 1);
    assertEquals(bookmarkToTab.get("bm2"), null);
    assertEquals(tabToBookmark.get(1), "bm1");
    assertEquals(tabToBookmark.has(2), false);
  });

  it("skips folders (no url)", () => {
    const bookmarks = [{ id: "folder1", title: "Folder" }];
    const tabs = [{ id: 1, url: "https://example.com" }];

    const { bookmarkToTab } = buildAssociations(bookmarks, tabs);
    assertEquals(bookmarkToTab.size, 0);
  });

  it("does not double-assign the same tab to two bookmarks", () => {
    const bookmarks = [
      { id: "bm1", title: "A", url: "https://example.com" },
      { id: "bm2", title: "B", url: "https://example.com" },
    ];
    const tabs = [{ id: 1, url: "https://example.com" }];

    const { bookmarkToTab, tabToBookmark } = buildAssociations(bookmarks, tabs);

    assertEquals(bookmarkToTab.get("bm1"), 1);
    assertEquals(bookmarkToTab.get("bm2"), null);
    assertEquals(tabToBookmark.size, 1);
  });

  it("handles empty inputs", () => {
    const { bookmarkToTab, tabToBookmark } = buildAssociations([], []);
    assertEquals(bookmarkToTab.size, 0);
    assertEquals(tabToBookmark.size, 0);
  });
});

describe("findMatchingBookmark", () => {
  it("finds an unassociated bookmark matching the URL", () => {
    const bookmarkToTab = new Map<string, number | null>([
      ["bm1", 1],
      ["bm2", null],
    ]);
    const bookmarks = [
      { id: "bm1", title: "Ex", url: "https://example.com" },
      { id: "bm2", title: "Other", url: "https://other.com" },
    ];

    assertEquals(findMatchingBookmark("https://other.com", bookmarkToTab, bookmarks), "bm2");
  });

  it("skips already-associated bookmarks", () => {
    const bookmarkToTab = new Map<string, number | null>([["bm1", 1]]);
    const bookmarks = [{ id: "bm1", title: "Ex", url: "https://example.com" }];

    assertEquals(findMatchingBookmark("https://example.com", bookmarkToTab, bookmarks), null);
  });

  it("returns null for no match", () => {
    const bookmarkToTab = new Map<string, number | null>([["bm1", null]]);
    const bookmarks = [{ id: "bm1", title: "Ex", url: "https://example.com" }];

    assertEquals(findMatchingBookmark("https://other.com", bookmarkToTab, bookmarks), null);
  });

  it("returns null for null/empty URL", () => {
    assertEquals(findMatchingBookmark(null, new Map(), []), null);
    assertEquals(findMatchingBookmark("", new Map(), []), null);
  });
});

describe("annotateNode", () => {
  it("annotates a loaded, active bookmark", () => {
    const bookmarkToTab = new Map<string, number | null>([["bm1", 5]]);
    const node = { id: "bm1", title: "Example", url: "https://example.com", parentId: "p1", index: 0 };

    const result = annotateNode(node, bookmarkToTab, 5);

    assertEquals(result.isLoaded, true);
    assertEquals(result.isActive, true);
    assertEquals(result.isFolder, false);
    assertEquals(result.tabId, 5);
  });

  it("annotates an unloaded bookmark", () => {
    const bookmarkToTab = new Map<string, number | null>([["bm1", null]]);
    const node = { id: "bm1", title: "Example", url: "https://example.com", parentId: "p1", index: 0 };

    const result = annotateNode(node, bookmarkToTab, 5);

    assertEquals(result.isLoaded, false);
    assertEquals(result.isActive, false);
    assertEquals(result.tabId, null);
  });

  it("annotates a folder with children recursively", () => {
    const bookmarkToTab = new Map<string, number | null>([["bm1", 3]]);
    const node = {
      id: "folder1",
      title: "Folder",
      parentId: "root",
      index: 0,
      children: [
        { id: "bm1", title: "Child", url: "https://example.com", parentId: "folder1", index: 0 },
      ],
    };

    const result = annotateNode(node, bookmarkToTab, 3);

    assertEquals(result.isFolder, true);
    assertEquals(result.children?.length, 1);
    assertEquals(result.children![0].isLoaded, true);
    assertEquals(result.children![0].isActive, true);
  });

  it("handles unknown bookmark (not in map)", () => {
    const bookmarkToTab = new Map<string, number | null>();
    const node = { id: "bm99", title: "Unknown", url: "https://example.com", parentId: "p1", index: 0 };

    const result = annotateNode(node, bookmarkToTab, null);

    assertEquals(result.tabId, null);
    assertEquals(result.isLoaded, false);
    assertEquals(result.isActive, false);
  });
});

describe("getOpenTabs", () => {
  it("excludes tabs associated with bookmarks", () => {
    const tabs = [
      { id: 1, url: "https://example.com", title: "Ex" },
      { id: 2, url: "https://other.com", title: "Other" },
    ];
    const tabToBookmark = new Map<number, string>([[1, "bm1"]]);

    const result = getOpenTabs(tabs, tabToBookmark, 2);

    assertEquals(result.length, 1);
    assertEquals(result[0].tabId, 2);
    assertEquals(result[0].isActive, true);
  });

  it("filters out chrome:// and extension URLs", () => {
    const tabs = [
      { id: 1, url: "chrome://extensions/", title: "Extensions" },
      { id: 2, url: "chrome-extension://abc/popup.html", title: "Popup" },
      { id: 3, url: "https://example.com", title: "Ex" },
    ];

    const result = getOpenTabs(tabs, new Map(), null);

    assertEquals(result.length, 1);
    assertEquals(result[0].tabId, 3);
  });

  it("returns empty when all tabs are bookmarked", () => {
    const tabs = [{ id: 1, url: "https://example.com", title: "Ex" }];
    const tabToBookmark = new Map<number, string>([[1, "bm1"]]);

    assertEquals(getOpenTabs(tabs, tabToBookmark, null).length, 0);
  });
});

describe("getPinnedBookmarks", () => {
  const bookmarks: ManagedBookmark[] = [
    { id: "bm1", title: "A", url: "https://a.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
    { id: "bm2", title: "B", url: "https://b.com", isFolder: false, tabId: 1, isLoaded: true, isPinned: false, isActive: true },
    { id: "bm3", title: "C", url: "https://c.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
  ];

  it("returns pinned bookmarks in pinnedIds order", () => {
    const result = getPinnedBookmarks(["bm3", "bm1"], bookmarks);
    assertEquals(result.length, 2);
    assertEquals(result[0].id, "bm3");
    assertEquals(result[1].id, "bm1");
  });

  it("skips IDs that don't exist", () => {
    const result = getPinnedBookmarks(["bm1", "nonexistent"], bookmarks);
    assertEquals(result.length, 1);
    assertEquals(result[0].id, "bm1");
  });

  it("returns empty for empty pinnedIds", () => {
    assertEquals(getPinnedBookmarks([], bookmarks).length, 0);
  });
});

describe("filterPinnedFromTree", () => {
  it("removes pinned leaf nodes from the tree", () => {
    const tree: ManagedBookmark[] = [
      { id: "bm1", title: "A", url: "https://a.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
      { id: "bm2", title: "B", url: "https://b.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
    ];
    const result = filterPinnedFromTree(tree, new Set(["bm1"]));
    assertEquals(result.length, 1);
    assertEquals(result[0].id, "bm2");
  });

  it("removes pinned nodes from nested folders", () => {
    const tree: ManagedBookmark[] = [
      {
        id: "folder1", title: "Folder", isFolder: true, tabId: null, isLoaded: false, isPinned: false, isActive: false,
        children: [
          { id: "bm1", title: "A", url: "https://a.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
          { id: "bm2", title: "B", url: "https://b.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
        ],
      },
    ];
    const result = filterPinnedFromTree(tree, new Set(["bm1"]));
    assertEquals(result.length, 1);
    assertEquals(result[0].children!.length, 1);
    assertEquals(result[0].children![0].id, "bm2");
  });

  it("does not remove folders even if their ID is in pinnedIds", () => {
    const tree: ManagedBookmark[] = [
      {
        id: "folder1", title: "Folder", isFolder: true, tabId: null, isLoaded: false, isPinned: false, isActive: false,
        children: [
          { id: "bm1", title: "A", url: "https://a.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
        ],
      },
    ];
    const result = filterPinnedFromTree(tree, new Set(["folder1"]));
    assertEquals(result.length, 1);
    assertEquals(result[0].id, "folder1");
  });

  it("returns tree unchanged when no IDs are pinned", () => {
    const tree: ManagedBookmark[] = [
      { id: "bm1", title: "A", url: "https://a.com", isFolder: false, tabId: null, isLoaded: false, isPinned: false, isActive: false },
    ];
    const result = filterPinnedFromTree(tree, new Set());
    assertEquals(result.length, 1);
  });
});

describe("flattenBookmarkTree", () => {
  it("flattens a nested tree", () => {
    const root = {
      id: "root",
      title: "Root",
      children: [
        { id: "a", title: "A", url: "https://a.com" },
        {
          id: "folder",
          title: "Folder",
          children: [
            { id: "b", title: "B", url: "https://b.com" },
            { id: "c", title: "C", url: "https://c.com" },
          ],
        },
      ],
    };

    const result = flattenBookmarkTree(root);

    assertEquals(result.length, 4);
    assertEquals(result.map((n) => n.id), ["a", "folder", "b", "c"]);
  });

  it("returns empty for a node with no children", () => {
    assertEquals(flattenBookmarkTree({ id: "root", title: "Root" }).length, 0);
  });
});

describe("isUnderRoot", () => {
  const parents: Record<string, string> = { bm1: "folder", folder: "root", root: "0" };
  const getParentId = (id: string): string | null => parents[id] ?? null;

  it("returns true when bookmark is under root", () => {
    assertEquals(isUnderRoot("bm1", "root", getParentId), true);
  });

  it("returns true when bookmark IS the root", () => {
    assertEquals(isUnderRoot("root", "root", getParentId), true);
  });

  it("returns false when bookmark is not under root", () => {
    const otherParents: Record<string, string> = { bm2: "other", other: "0" };
    assertEquals(isUnderRoot("bm2", "root", (id) => otherParents[id] ?? null), false);
  });

  it("returns false for tree root (parentId=0)", () => {
    assertEquals(isUnderRoot("0", "root", () => null), false);
  });

  it("respects maxDepth to prevent infinite loops", () => {
    const circular: Record<string, string> = { a: "b", b: "a" };
    assertEquals(isUnderRoot("a", "root", (id) => circular[id] ?? null, 10), false);
  });
});
