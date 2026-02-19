/// <reference types="npm:chrome-types" />

import type { PanelState } from "../lib/types.ts";
import {
  hideDropIndicator,
  showDangerDropGhost,
  showDropIndicator,
  showGridDropIndicator,
} from "../lib/drop-indicator.ts";

export interface DropZoneDelegate {
  sendMessage(message: { type: string; [key: string]: unknown }): Promise<unknown>;
  refreshState(): Promise<void>;
  getState(): PanelState | null;
}

let delegate: DropZoneDelegate;
let pendingDropIndex = 0;

export function initDropZones(d: DropZoneDelegate): void {
  delegate = d;
}

export function setupDropZone(element: HTMLElement, zone: "pinned" | "bookmarks"): void {
  if (element.dataset.dropZone) {
    element.dataset.dropTarget = zone;
    return;
  }
  element.dataset.dropZone = "true";
  element.dataset.dropTarget = zone;

  element.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    const target = element.dataset.dropTarget!;
    if (target === "pinned") {
      pendingDropIndex = showGridDropIndicator(element, e.clientX, e.clientY);
    } else {
      pendingDropIndex = showDropIndicator(element, e.clientY);
    }
  });

  element.addEventListener("dragleave", (e) => {
    if (!element.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  });

  element.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;

    const data = JSON.parse(raw);
    const target = element.dataset.dropTarget!;
    const state = delegate.getState();

    if (data.type === "openTab") {
      if (target === "pinned") {
        await delegate.sendMessage({ type: "promoteTab", tabId: data.tabId, pinned: true });
      } else {
        await delegate.sendMessage({
          type: "promoteTab",
          tabId: data.tabId,
          parentId: state?.rootFolderId,
        });
      }
    } else if (data.type === "bookmark") {
      if (target === "pinned") {
        if (state?.pinnedIds.includes(data.bookmarkId)) {
          await delegate.sendMessage({
            type: "reorderPinned",
            bookmarkId: data.bookmarkId,
            toIndex: pendingDropIndex,
          });
        } else {
          await delegate.sendMessage({ type: "pinBookmark", bookmarkId: data.bookmarkId });
        }
      } else {
        await delegate.sendMessage({ type: "unpinBookmark", bookmarkId: data.bookmarkId });
        if (state?.rootFolderId) {
          await delegate.sendMessage({
            type: "reorderBookmark",
            bookmarkId: data.bookmarkId,
            parentId: state.rootFolderId,
            index: pendingDropIndex,
          });
        }
      }
    }

    await delegate.refreshState();
  });
}

export function setupUnbookmarkDropZone(element: HTMLElement): void {
  if (element.dataset.dropZone) return;
  element.dataset.dropZone = "true";

  element.addEventListener("dragover", (e) => {
    if (document.body.classList.contains("is-dragging-from-zone3")) return;
    const raw = e.dataTransfer!.types.includes("application/rolotabs");
    if (!raw) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    if (document.body.classList.contains("is-dragging-inactive")) {
      const list = document.getElementById("unlinked-list")!;
      showDangerDropGhost(list, "delete bookmark");
    } else {
      const list = document.getElementById("unlinked-list")!;
      showDropIndicator(list, e.clientY);
    }
  });

  element.addEventListener("dragleave", (e) => {
    if (!element.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  });

  element.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.type === "bookmark" && !data.isFolder) {
      await delegate.sendMessage({ type: "unbookmarkTab", bookmarkId: data.bookmarkId });
      await delegate.refreshState();
    }
  });
}

export function setupOpenTabReorderDropZone(list: HTMLElement): void {
  if (list.dataset.reorderZone) return;
  list.dataset.reorderZone = "true";

  list.addEventListener("dragover", (e) => {
    const raw = e.dataTransfer!.types.includes("application/rolotabs");
    if (!raw) return;

    if (document.body.classList.contains("is-dragging-from-zone3")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "move";
      pendingDropIndex = showDropIndicator(list, e.clientY);
    } else if (document.body.classList.contains("is-dragging")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "move";
      if (document.body.classList.contains("is-dragging-inactive")) {
        showDangerDropGhost(list, "delete bookmark");
      } else {
        pendingDropIndex = showDropIndicator(list, e.clientY);
      }
    }
  });

  list.addEventListener("dragleave", (e) => {
    if (!list.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  });

  list.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.type === "openTab") {
      await delegate.sendMessage({
        type: "reorderOpenTab",
        tabId: data.tabId,
        toIndex: pendingDropIndex,
      });
      await delegate.refreshState();
    } else if (data.type === "bookmark" && !data.isFolder) {
      await delegate.sendMessage({ type: "unbookmarkTab", bookmarkId: data.bookmarkId });
      await delegate.refreshState();
    }
  });
}

/**
 * Set up a drop zone on a folder's children container so items can be
 * reordered within the folder. Stops propagation so the outer bookmarks
 * list drop zone doesn't steal the event.
 */
export function setupFolderChildrenDropZone(element: HTMLElement, folderId: string): void {
  if (element.dataset.dropZone) return;
  element.dataset.dropZone = "true";

  element.addEventListener("dragover", (e) => {
    const raw = e.dataTransfer!.types.includes("application/rolotabs");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = "move";
    pendingDropIndex = showDropIndicator(element, e.clientY);
  });

  element.addEventListener("dragleave", (e) => {
    const related = e.relatedTarget as Node | null;
    // Only hide if leaving the container entirely (not moving into the ghost or a child)
    if (!element.contains(related)) {
      hideDropIndicator();
    }
  });

  element.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDropIndicator();

    const raw = e.dataTransfer!.getData("application/rolotabs");
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.type === "openTab") {
      await delegate.sendMessage({ type: "promoteTab", tabId: data.tabId, parentId: folderId });
    } else if (data.type === "bookmark") {
      await delegate.sendMessage({
        type: "reorderBookmark",
        bookmarkId: data.bookmarkId,
        parentId: folderId,
        index: pendingDropIndex,
      });
    }

    await delegate.refreshState();
  });
}

export async function handleDropOnFolder(e: DragEvent, folderId: string): Promise<void> {
  hideDropIndicator();
  const raw = e.dataTransfer!.getData("application/rolotabs");
  if (!raw) return;
  const data = JSON.parse(raw);

  if (data.type === "openTab") {
    await delegate.sendMessage({ type: "promoteTab", tabId: data.tabId, parentId: folderId });
  } else if (data.type === "bookmark") {
    await delegate.sendMessage({
      type: "reorderBookmark",
      bookmarkId: data.bookmarkId,
      parentId: folderId,
      index: 0,
    });
  }
  await delegate.refreshState();
}
