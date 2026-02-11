/**
 * Drop ghost indicator — shows a translucent preview of the dragged item
 * at the insertion point.
 */

let ghost: HTMLElement | null = null;

function getGhost(): HTMLElement {
  if (!ghost) {
    ghost = document.createElement("div");
    ghost.className = "drop-ghost";
    ghost.style.display = "none";
  }
  return ghost;
}

/** Remove ghost from its current parent. */
function detachGhost(): void {
  if (ghost?.parentElement) {
    ghost.remove();
  }
}

/**
 * Show a ghost element at the drop position within a list container.
 * Returns the insertion index.
 */
export function showDropIndicator(container: HTMLElement, y: number, label?: string): number {
  const g = getGhost();
  detachGhost();
  g.textContent = label || "";
  g.className = "drop-ghost";
  g.style.display = "";

  const children = Array.from(container.children).filter(
    (c) => c !== ghost && !c.classList.contains("empty-state")
  ) as HTMLElement[];

  if (children.length === 0) {
    container.appendChild(g);
    return 0;
  }

  let insertIndex = children.length;
  for (let i = 0; i < children.length; i++) {
    const rect = children[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      insertIndex = i;
      break;
    }
  }

  if (insertIndex < children.length) {
    container.insertBefore(g, children[insertIndex]);
  } else {
    container.appendChild(g);
  }

  return insertIndex;
}

/**
 * Show a ghost element at the drop position within a grid container.
 * Returns the insertion index.
 */
export function showGridDropIndicator(container: HTMLElement, x: number, y: number, label?: string): number {
  const g = getGhost();
  detachGhost();
  g.textContent = label || "";
  g.className = "drop-ghost drop-ghost-grid";
  g.style.display = "";

  const children = Array.from(container.children).filter(
    (c) => c !== ghost && !c.classList.contains("pinned-grid-empty")
  ) as HTMLElement[];

  if (children.length === 0) {
    container.appendChild(g);
    return 0;
  }

  let insertIndex = children.length;
  for (let i = 0; i < children.length; i++) {
    const rect = children[i].getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    if (y < midY - rect.height / 2) {
      insertIndex = i;
      break;
    }
    if (y < midY + rect.height / 2 && x < midX) {
      insertIndex = i;
      break;
    }
  }

  if (insertIndex < children.length) {
    container.insertBefore(g, children[insertIndex]);
  } else {
    container.appendChild(g);
  }

  return insertIndex;
}

/**
 * Show a ghost in a folder header area (drop into folder).
 */
export function showFolderDropGhost(folderHeader: HTMLElement, label?: string): void {
  const g = getGhost();
  detachGhost();
  g.textContent = label || "";
  g.className = "drop-ghost drop-ghost-folder";
  g.style.display = "";

  // Insert after the folder header
  const parent = folderHeader.parentElement!;
  const children = parent.querySelector(".folder-children");
  if (children) {
    children.insertBefore(g, children.firstChild);
  } else {
    parent.appendChild(g);
  }
}

/**
 * Show a danger ghost (for delete actions).
 */
export function showUnbookmarkDropGhost(container: HTMLElement, label?: string): void {
  const g = getGhost();
  detachGhost();
  g.textContent = label || "📂→";
  g.className = "drop-ghost drop-ghost-unbookmark";
  g.style.display = "";
  container.appendChild(g);
}

export function showDangerDropGhost(container: HTMLElement, label?: string): void {
  const g = getGhost();
  detachGhost();
  g.textContent = label || "🗑";
  g.className = "drop-ghost drop-ghost-danger";
  g.style.display = "";
  container.appendChild(g);
}

/** Hide and detach the ghost. */
export function hideDropIndicator(): void {
  if (ghost) {
    ghost.style.display = "none";
    detachGhost();
  }
}
