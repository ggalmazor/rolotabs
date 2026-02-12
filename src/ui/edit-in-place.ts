/** Inline rename: replaces element text with an input field. */
export function editInPlace(
  el: HTMLElement,
  currentValue: string,
  onSave: (newValue: string) => void,
): void {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "edit-in-place";
  input.value = currentValue;

  el.textContent = "";
  el.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    input.remove();
    const val = input.value.trim();
    if (commit && val && val !== currentValue) {
      el.textContent = val;
      onSave(val);
    } else {
      el.textContent = currentValue;
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}
