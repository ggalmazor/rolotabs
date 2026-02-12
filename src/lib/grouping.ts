/// <reference types="npm:chrome-types" />

/**
 * Tab group management for Rolotabs.
 *
 * Manages two Chrome tab groups (📌 Pinned, 📚 Bookmarks) and handles
 * recovery, consolidation, and positioning.
 */

let pinnedGroupId: number | null = null;
let bookmarkedGroupId: number | null = null;

/** Recover existing group IDs after service worker restart. */
export async function recoverGroupIds(): Promise<void> {
  const pinnedGroups = await chrome.tabGroups.query({ title: "📌 Pinned" });
  if (pinnedGroups.length > 0) {
    pinnedGroupId = pinnedGroups[0].id;
    // Consolidate duplicates
    await consolidateGroups(pinnedGroups, pinnedGroupId);
  }
  const bookmarkedGroups = await chrome.tabGroups.query({ title: "📚 Bookmarks" });
  if (bookmarkedGroups.length > 0) {
    bookmarkedGroupId = bookmarkedGroups[0].id;
    await consolidateGroups(bookmarkedGroups, bookmarkedGroupId);
  }
}

/** Merge tabs from duplicate groups into the primary one. */
async function consolidateGroups(
  groups: chrome.tabGroups.TabGroup[],
  keepGroupId: number,
): Promise<void> {
  for (let i = 1; i < groups.length; i++) {
    try {
      const tabs = await chrome.tabs.query({ groupId: groups[i].id });
      if (tabs.length > 0) {
        const tabIds = tabs.map((t) => t.id!);
        if (tabIds.length > 0) {
          await chrome.tabs.group({
            tabIds: tabIds as [number, ...number[]],
            groupId: keepGroupId,
          });
        }
      }
    } catch {
      // Group may have been auto-removed
    }
  }
}

/** Ensure a group exists with the given label. Returns group ID or -1 if none exists. */
async function ensureGroup(
  label: string,
  color: string,
  currentGroupId: number | null,
): Promise<number> {
  if (currentGroupId !== null) {
    try {
      await chrome.tabGroups.get(currentGroupId);
      return currentGroupId;
    } catch {
      // Group was closed
    }
  }
  const groups = await chrome.tabGroups.query({ title: label });
  if (groups.length > 0) {
    await consolidateGroups(groups, groups[0].id);
    return groups[0].id;
  }
  return -1;
}

/** Add a tab to the appropriate group (pinned or bookmarked). */
export async function addTabToGroup(
  tabId: number,
  zone: "pinned" | "bookmarked",
): Promise<void> {
  const label = zone === "pinned" ? "📌 Pinned" : "📚 Bookmarks";
  const color = zone === "pinned" ? "blue" : "grey";

  try {
    let groupId = zone === "pinned" ? pinnedGroupId : bookmarkedGroupId;
    groupId = await ensureGroup(label, color, groupId);

    if (groupId === -1) {
      groupId = await chrome.tabs.group({ tabIds: [tabId] });
    } else {
      await chrome.tabs.group({ tabIds: [tabId], groupId });
    }

    await chrome.tabGroups.update(groupId, { title: label, color, collapsed: false });

    if (zone === "pinned") {
      pinnedGroupId = groupId;
    } else {
      bookmarkedGroupId = groupId;
    }

    await positionGroups();
  } catch {
    // Grouping failed (e.g. tab already closed) — not critical
  }
}

/** Position groups: pinned leftmost, bookmarked second. */
export async function positionGroups(): Promise<void> {
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

/** Ungroup a tab if it's in a managed group but shouldn't be. */
export async function ungroupIfNotManaged(tabId: number, isBookmarked: boolean): Promise<void> {
  if (isBookmarked) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === undefined || tab.groupId === -1) return;
    if (tab.groupId === pinnedGroupId || tab.groupId === bookmarkedGroupId) {
      await chrome.tabs.ungroup(tabId);
    }
  } catch {
    // Tab may have been closed
  }
}

/** Ungroup a specific tab (e.g. when unbookmarking). */
export async function ungroupTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.ungroup(tabId);
  } catch {
    // Tab may not be in a group
  }
  await positionGroups();
}

/** Get the current pinned group ID (for external checks). */
export function getPinnedGroupId(): number | null {
  return pinnedGroupId;
}

/** Get the current bookmarked group ID (for external checks). */
export function getBookmarkedGroupId(): number | null {
  return bookmarkedGroupId;
}
