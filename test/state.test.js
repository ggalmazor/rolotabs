import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAssociations,
  findMatchingBookmark,
  annotateNode,
  getUnlinkedTabs,
  flattenBookmarkTree,
  isUnderRoot,
} from "../lib/state.js";

describe("buildAssociations", () => {
  it("associates bookmarks with matching tabs", () => {
    const bookmarks = [
      { id: "bm1", url: "https://example.com" },
      { id: "bm2", url: "https://other.com" },
    ];
    const tabs = [
      { id: 1, url: "https://example.com" },
      { id: 2, url: "https://unrelated.com" },
    ];

    const { bookmarkToTab, tabToBookmark } = buildAssociations(bookmarks, tabs);

    assert.equal(bookmarkToTab.get("bm1"), 1);
    assert.equal(bookmarkToTab.get("bm2"), null);
    assert.equal(tabToBookmark.get(1), "bm1");
    assert.equal(tabToBookmark.has(2), false);
  });

  it("skips folders (no url)", () => {
    const bookmarks = [{ id: "folder1", title: "Folder" }];
    const tabs = [{ id: 1, url: "https://example.com" }];

    const { bookmarkToTab } = buildAssociations(bookmarks, tabs);

    assert.equal(bookmarkToTab.size, 0);
  });

  it("does not double-assign the same tab to two bookmarks", () => {
    const bookmarks = [
      { id: "bm1", url: "https://example.com" },
      { id: "bm2", url: "https://example.com" },
    ];
    const tabs = [{ id: 1, url: "https://example.com" }];

    const { bookmarkToTab, tabToBookmark } = buildAssociations(bookmarks, tabs);

    assert.equal(bookmarkToTab.get("bm1"), 1);
    assert.equal(bookmarkToTab.get("bm2"), null);
    assert.equal(tabToBookmark.size, 1);
  });

  it("handles empty inputs", () => {
    const { bookmarkToTab, tabToBookmark } = buildAssociations([], []);
    assert.equal(bookmarkToTab.size, 0);
    assert.equal(tabToBookmark.size, 0);
  });
});

describe("findMatchingBookmark", () => {
  it("finds an unassociated bookmark matching the URL", () => {
    const bookmarkToTab = new Map([
      ["bm1", 1],
      ["bm2", null],
    ]);
    const bookmarks = [
      { id: "bm1", url: "https://example.com" },
      { id: "bm2", url: "https://other.com" },
    ];

    const result = findMatchingBookmark("https://other.com", bookmarkToTab, bookmarks);
    assert.equal(result, "bm2");
  });

  it("skips already-associated bookmarks", () => {
    const bookmarkToTab = new Map([["bm1", 1]]);
    const bookmarks = [{ id: "bm1", url: "https://example.com" }];

    const result = findMatchingBookmark("https://example.com", bookmarkToTab, bookmarks);
    assert.equal(result, null);
  });

  it("returns null for no match", () => {
    const bookmarkToTab = new Map([["bm1", null]]);
    const bookmarks = [{ id: "bm1", url: "https://example.com" }];

    const result = findMatchingBookmark("https://other.com", bookmarkToTab, bookmarks);
    assert.equal(result, null);
  });

  it("returns null for null/empty URL", () => {
    assert.equal(findMatchingBookmark(null, new Map(), []), null);
    assert.equal(findMatchingBookmark("", new Map(), []), null);
  });
});

describe("annotateNode", () => {
  it("annotates a loaded, active bookmark", () => {
    const bookmarkToTab = new Map([["bm1", 5]]);
    const node = { id: "bm1", title: "Example", url: "https://example.com", parentId: "p1", index: 0 };

    const result = annotateNode(node, bookmarkToTab, 5);

    assert.equal(result.isLoaded, true);
    assert.equal(result.isActive, true);
    assert.equal(result.isFolder, false);
    assert.equal(result.tabId, 5);
  });

  it("annotates an unloaded bookmark", () => {
    const bookmarkToTab = new Map([["bm1", null]]);
    const node = { id: "bm1", title: "Example", url: "https://example.com", parentId: "p1", index: 0 };

    const result = annotateNode(node, bookmarkToTab, 5);

    assert.equal(result.isLoaded, false);
    assert.equal(result.isActive, false);
    assert.equal(result.tabId, null);
  });

  it("annotates a folder with children recursively", () => {
    const bookmarkToTab = new Map([["bm1", 3]]);
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

    assert.equal(result.isFolder, true);
    assert.equal(result.children.length, 1);
    assert.equal(result.children[0].isLoaded, true);
    assert.equal(result.children[0].isActive, true);
  });

  it("handles unknown bookmark (not in map)", () => {
    const bookmarkToTab = new Map();
    const node = { id: "bm99", title: "Unknown", url: "https://example.com", parentId: "p1", index: 0 };

    const result = annotateNode(node, bookmarkToTab, null);

    assert.equal(result.tabId, null);
    assert.equal(result.isLoaded, false);
    assert.equal(result.isActive, false);
  });
});

describe("getUnlinkedTabs", () => {
  it("returns tabs not associated with any bookmark", () => {
    const tabs = [
      { id: 1, url: "https://example.com", title: "Ex" },
      { id: 2, url: "https://other.com", title: "Other" },
    ];
    const tabToBookmark = new Map([[1, "bm1"]]);

    const result = getUnlinkedTabs(tabs, tabToBookmark, 2);

    assert.equal(result.length, 1);
    assert.equal(result[0].tabId, 2);
    assert.equal(result[0].isActive, true);
  });

  it("filters out chrome:// and extension URLs", () => {
    const tabs = [
      { id: 1, url: "chrome://extensions/", title: "Extensions" },
      { id: 2, url: "chrome-extension://abc/popup.html", title: "Popup" },
      { id: 3, url: "https://example.com", title: "Ex" },
    ];

    const result = getUnlinkedTabs(tabs, new Map(), null);

    assert.equal(result.length, 1);
    assert.equal(result[0].tabId, 3);
  });

  it("returns empty for no unlinked tabs", () => {
    const tabs = [{ id: 1, url: "https://example.com", title: "Ex" }];
    const tabToBookmark = new Map([[1, "bm1"]]);

    const result = getUnlinkedTabs(tabs, tabToBookmark, null);
    assert.equal(result.length, 0);
  });
});

describe("flattenBookmarkTree", () => {
  it("flattens a nested tree", () => {
    const root = {
      id: "root",
      children: [
        { id: "a", url: "https://a.com" },
        {
          id: "folder",
          children: [
            { id: "b", url: "https://b.com" },
            { id: "c", url: "https://c.com" },
          ],
        },
      ],
    };

    const result = flattenBookmarkTree(root);

    assert.equal(result.length, 4); // a, folder, b, c
    assert.deepEqual(
      result.map((n) => n.id),
      ["a", "folder", "b", "c"]
    );
  });

  it("returns empty for a node with no children", () => {
    const result = flattenBookmarkTree({ id: "root" });
    assert.equal(result.length, 0);
  });
});

describe("isUnderRoot", () => {
  // Simple tree: root -> folder -> bm1
  const parents = { bm1: "folder", folder: "root", root: "0" };
  const getParentId = (id) => parents[id] ?? null;

  it("returns true when bookmark is under root", () => {
    assert.ok(isUnderRoot("bm1", "root", getParentId));
  });

  it("returns true when bookmark IS the root", () => {
    assert.ok(isUnderRoot("root", "root", getParentId));
  });

  it("returns false when bookmark is not under root", () => {
    const otherParents = { bm2: "other", other: "0" };
    const getOtherParent = (id) => otherParents[id] ?? null;
    assert.ok(!isUnderRoot("bm2", "root", getOtherParent));
  });

  it("returns false for tree root (parentId=0)", () => {
    assert.ok(!isUnderRoot("0", "root", () => null));
  });

  it("respects maxDepth to prevent infinite loops", () => {
    // Circular reference
    const circular = { a: "b", b: "a" };
    const getCircular = (id) => circular[id] ?? null;
    assert.ok(!isUnderRoot("a", "root", getCircular, 10));
  });
});
