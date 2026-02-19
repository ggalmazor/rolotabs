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
    (c) => c !== ghost && !c.classList.contains("empty-state"),
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
export function showGridDropIndicator(
  container: HTMLElement,
  x: number,
  y: number,
  label?: string,
): number {
  const g = getGhost();
  detachGhost();
  g.textContent = label || "";
  g.className = "drop-ghost drop-ghost-grid";
  g.style.display = "";

  const children = Array.from(container.children).filter(
    (c) => c !== ghost && !c.classList.contains("pinned-grid-empty"),
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
 * Always highlights the folder header with a CSS class to avoid
 * inserting the ghost outside the header element, which would cause
 * spurious dragleave events and flicker.
 */
export function showFolderDropGhost(folderHeader: HTMLElement, _label?: string): void {
  detachGhost();
  // Clear any previous folder highlight before setting the new one
  document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  folderHeader.classList.add("drop-target");
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
  container.prepend(g);
}

/** Hide and detach the ghost. */
export function hideDropIndicator(): void {
  if (ghost) {
    ghost.style.display = "none";
    detachGhost();
  }
  // Clear any folder header drop-target highlights
  document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
}
