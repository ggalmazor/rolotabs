/** Confirmation toast with Yes/No buttons and auto-dismiss. */

let activeToast: HTMLElement | null = null;
let toastTimeout: number | null = null;

export function showConfirmToast(
  message: string,
  onConfirm: () => void,
  durationMs = 4000,
): void {
  dismissToast();

  const toast = document.createElement("div");
  toast.className = "confirm-toast";

  const text = document.createElement("span");
  text.className = "confirm-toast-text";
  text.textContent = message;

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "confirm-toast-btn confirm-toast-confirm";
  confirmBtn.textContent = "Yes";
  confirmBtn.addEventListener("click", () => {
    dismissToast();
    onConfirm();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "confirm-toast-btn confirm-toast-cancel";
  cancelBtn.textContent = "No";
  cancelBtn.addEventListener("click", () => dismissToast());

  toast.appendChild(text);
  toast.appendChild(confirmBtn);
  toast.appendChild(cancelBtn);
  document.body.appendChild(toast);
  activeToast = toast;

  toastTimeout = setTimeout(() => dismissToast(), durationMs) as unknown as number;
}

export function dismissToast(): void {
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }
  if (toastTimeout !== null) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
}
