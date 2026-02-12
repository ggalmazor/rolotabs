/** A single menu item. */
export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  action: () => void | Promise<void>;
}

/** A separator between groups of items. */
export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

let activeMenu: HTMLElement | null = null;
let dismissListener: ((e: MouseEvent) => void) | null = null;
let keyListener: ((e: KeyboardEvent) => void) | null = null;

/** Close any open context menu. */
export function closeContextMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
  if (dismissListener) {
    document.removeEventListener("mousedown", dismissListener, true);
    dismissListener = null;
  }
  if (keyListener) {
    document.removeEventListener("keydown", keyListener, true);
    keyListener = null;
  }
}

/**
 * Show a context menu at the given position.
 */
export function showContextMenu(x: number, y: number, entries: MenuEntry[]): void {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  for (const entry of entries) {
    if ("separator" in entry) {
      const sep = document.createElement("div");
      sep.className = "context-menu-separator";
      menu.appendChild(sep);
      continue;
    }

    const item = document.createElement("div");
    item.className = "context-menu-item";
    if (entry.danger) item.classList.add("is-danger");

    if (entry.icon) {
      const icon = document.createElement("span");
      icon.className = "context-menu-icon";
      icon.textContent = entry.icon;
      item.appendChild(icon);
    }

    const label = document.createElement("span");
    label.className = "context-menu-label";
    label.textContent = entry.label;
    item.appendChild(label);

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      closeContextMenu();
      entry.action();
    });

    menu.appendChild(item);
  }

  document.body.appendChild(menu);
  activeMenu = menu;

  // Position: keep within viewport
  const rect = menu.getBoundingClientRect();
  // deno-lint-ignore no-window
  const maxX = window.innerWidth - rect.width - 4;
  // deno-lint-ignore no-window
  const maxY = window.innerHeight - rect.height - 4;
  menu.style.left = `${Math.min(x, maxX)}px`;
  menu.style.top = `${Math.min(y, maxY)}px`;

  // Dismiss on click outside or Escape
  dismissListener = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      closeContextMenu();
    }
  };
  keyListener = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeContextMenu();
    }
  };
  // Use setTimeout so the current click doesn't immediately dismiss
  setTimeout(() => {
    document.addEventListener("mousedown", dismissListener!, true);
    document.addEventListener("keydown", keyListener!, true);
  }, 0);
}
