/**
 * Lightweight drop indicator for reordering items in a list.
 * Shows a horizontal line between items to indicate where the drop will land.
 */

let indicator: HTMLElement | null = null;

function getIndicator(): HTMLElement {
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "drop-indicator";
    indicator.style.display = "none";
    document.body.appendChild(indicator);
  }
  return indicator;
}

/** Show the drop indicator between items. */
export function showDropIndicator(container: HTMLElement, y: number): number {
  const ind = getIndicator();
  const children = Array.from(container.children).filter(
    (c) => !c.classList.contains("drop-indicator") && !c.classList.contains("empty-state")
  ) as HTMLElement[];

  if (children.length === 0) {
    ind.style.display = "none";
    return 0;
  }

  // Find which gap the cursor is closest to
  let insertIndex = children.length;
  for (let i = 0; i < children.length; i++) {
    const rect = children[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (y < midY) {
      insertIndex = i;
      break;
    }
  }

  // Position the indicator — horizontal line
  const containerRect = container.getBoundingClientRect();
  let indicatorY: number;
  if (insertIndex < children.length) {
    indicatorY = children[insertIndex].getBoundingClientRect().top;
  } else {
    const last = children[children.length - 1].getBoundingClientRect();
    indicatorY = last.bottom;
  }

  ind.style.display = "block";
  ind.style.left = `${containerRect.left}px`;
  ind.style.width = `${containerRect.width}px`;
  ind.style.top = `${indicatorY - 1}px`;
  ind.style.height = "2px";

  return insertIndex;
}

/** Show the drop indicator for a grid (zone 1 pinned). */
export function showGridDropIndicator(container: HTMLElement, x: number, y: number): number {
  const ind = getIndicator();
  const children = Array.from(container.children).filter(
    (c) => !c.classList.contains("drop-indicator") && !c.classList.contains("pinned-grid-empty")
  ) as HTMLElement[];

  if (children.length === 0) {
    ind.style.display = "none";
    return 0;
  }

  // Find closest gap in the grid
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

  // Position indicator as a vertical line
  const containerRect = container.getBoundingClientRect();
  if (insertIndex < children.length) {
    const rect = children[insertIndex].getBoundingClientRect();
    ind.style.display = "block";
    ind.style.left = `${rect.left - 1}px`;
    ind.style.width = `2px`;
    ind.style.top = `${rect.top}px`;
    ind.style.height = `${rect.height}px`;
  } else {
    const last = children[children.length - 1].getBoundingClientRect();
    ind.style.display = "block";
    ind.style.left = `${last.right - 1}px`;
    ind.style.width = `2px`;
    ind.style.top = `${last.top}px`;
    ind.style.height = `${last.height}px`;
  }

  return insertIndex;
}

/** Hide the drop indicator. */
export function hideDropIndicator(): void {
  if (indicator) {
    indicator.style.display = "none";
    indicator.style.height = "2px";
    indicator.style.width = "";
  }
}
