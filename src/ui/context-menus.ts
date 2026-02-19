/// <reference types="npm:chrome-types" />

import type { ManagedBookmark, OpenTab } from "../lib/types.ts";
import { type MenuEntry, showContextMenu } from "../lib/context-menu.ts";
import { editInPlace } from "./edit-in-place.ts";
import { showConfirmToast } from "./toast.ts";

export interface ContextMenuDelegate {
  sendMessage(message: { type: string; [key: string]: unknown }): Promise<unknown>;
  refreshState(): Promise<void>;
  removeBookmark(bookmarkId: string): Promise<void>;
  closeOpenTab(tabId: number): Promise<void>;
  setEditAfterId(id: string): void;
  expandFolder(folderId: string): void;
}

let delegate: ContextMenuDelegate;

export function initContextMenus(d: ContextMenuDelegate): void {
  delegate = d;
}

export function onPinnedContext(event: MouseEvent, item: ManagedBookmark): void {
  showContextMenu(event.clientX, event.clientY, [
    {
      label: "Unpin",
      icon: "📌",
      action: () =>
        delegate.sendMessage({ type: "unpinBookmark", bookmarkId: item.id }).then(() =>
          delegate.refreshState()
        ),
    },
    {
      label: "Replace with current URL",
      icon: "🔗",
      action: () =>
        delegate.sendMessage({ type: "replaceBookmarkUrl", bookmarkId: item.id }).then(() =>
          delegate.refreshState()
        ),
    },
    { separator: true },
    {
      label: "Delete bookmark",
      icon: "🗑",
      danger: true,
      action: () => delegate.removeBookmark(item.id),
    },
  ]);
}

export function onFolderContext(event: MouseEvent, folder: ManagedBookmark): void {
  const entries: MenuEntry[] = [
    {
      label: "New subfolder",
      icon: "📁",
      action: async () => {
        delegate.expandFolder(folder.id);
        const result = await delegate.sendMessage({
          type: "createFolder",
          parentId: folder.id,
          title: "New folder",
        }) as { id?: string };
        if (result?.id) {
          delegate.setEditAfterId(result.id);
        }
        await delegate.refreshState();
      },
    },
    {
      label: "Rename",
      icon: "✏️",
      action: () => {
        const nameEl = document.querySelector(
          `.folder-item[data-folder-id="${folder.id}"] .folder-name`,
        ) as HTMLElement;
        if (nameEl) {
          editInPlace(nameEl, folder.title, async (newTitle) => {
            await chrome.bookmarks.update(folder.id, { title: newTitle });
            delegate.refreshState();
          });
        }
      },
    },
    { separator: true },
    {
      label: "Delete folder",
      icon: "🗑",
      danger: true,
      action: () => {
        const hasChildren = folder.children && folder.children.length > 0;
        const msg = hasChildren
          ? `Delete "${folder.title}" and all contents?`
          : `Delete "${folder.title}"?`;
        showConfirmToast(msg, () => {
          delegate.sendMessage({ type: "removeFolder", folderId: folder.id }).then(() =>
            delegate.refreshState()
          );
        });
      },
    },
  ];
  showContextMenu(event.clientX, event.clientY, entries);
}

export function onBookmarkContext(event: MouseEvent, item: ManagedBookmark): void {
  showContextMenu(event.clientX, event.clientY, [
    {
      label: "Pin to top",
      icon: "📌",
      action: () =>
        delegate.sendMessage({ type: "pinBookmark", bookmarkId: item.id }).then(() =>
          delegate.refreshState()
        ),
    },
    {
      label: "Replace with current URL",
      icon: "🔗",
      action: () =>
        delegate.sendMessage({ type: "replaceBookmarkUrl", bookmarkId: item.id }).then(() =>
          delegate.refreshState()
        ),
    },
    {
      label: "Rename",
      icon: "✏️",
      action: () => {
        const titleEl = document.querySelector(
          `.tab-item[data-bookmark-id="${item.id}"] .tab-title`,
        ) as HTMLElement;
        if (titleEl) {
          editInPlace(titleEl, item.title, async (newTitle) => {
            await chrome.bookmarks.update(item.id, { title: newTitle });
            delegate.refreshState();
          });
        }
      },
    },
    { separator: true },
    {
      label: "Delete bookmark",
      icon: "🗑",
      danger: true,
      action: () => delegate.removeBookmark(item.id),
    },
  ]);
}

export function onOpenTabContext(event: MouseEvent, tab: OpenTab, allTabs: OpenTab[]): void {
  const idx = allTabs.findIndex((t) => t.tabId === tab.tabId);
  const entries: MenuEntry[] = [
    {
      label: "Pin",
      icon: "📌",
      action: () =>
        delegate.sendMessage({ type: "promoteAndPin", tabId: tab.tabId }).then(() =>
          delegate.refreshState()
        ),
    },
    {
      label: "Bookmark",
      icon: "📚",
      action: () =>
        delegate.sendMessage({ type: "promoteTab", tabId: tab.tabId }).then(() =>
          delegate.refreshState()
        ),
    },
    { separator: true },
    {
      label: "Close tab",
      icon: "✕",
      action: () => delegate.closeOpenTab(tab.tabId),
    },
  ];

  if (idx > 0) {
    entries.push({
      label: "Close all above",
      icon: "⬆",
      danger: true,
      action: () => {
        const msg = `Close ${idx} tab${idx > 1 ? "s" : ""} above?`;
        showConfirmToast(msg, async () => {
          for (const t of allTabs.slice(0, idx)) {
            await delegate.closeOpenTab(t.tabId);
          }
        });
      },
    });
  }
  if (idx < allTabs.length - 1) {
    const below = allTabs.length - idx - 1;
    entries.push({
      label: "Close all below",
      icon: "⬇",
      danger: true,
      action: () => {
        const msg = `Close ${below} tab${below > 1 ? "s" : ""} below?`;
        showConfirmToast(msg, async () => {
          for (const t of allTabs.slice(idx + 1).reverse()) {
            await delegate.closeOpenTab(t.tabId);
          }
        });
      },
    });
  }
  if (allTabs.length > 1) {
    entries.push({
      label: "Close other tabs",
      icon: "✕",
      danger: true,
      action: () => {
        const count = allTabs.length - 1;
        const msg = `Close ${count} other tab${count > 1 ? "s" : ""}?`;
        showConfirmToast(msg, async () => {
          for (const t of allTabs.filter((t) => t.tabId !== tab.tabId).reverse()) {
            await delegate.closeOpenTab(t.tabId);
          }
        });
      },
    });
  }

  showContextMenu(event.clientX, event.clientY, entries);
}
