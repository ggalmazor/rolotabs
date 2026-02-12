/** Build a favicon URL using the Chrome extension favicon API. */
export function faviconUrl(url?: string): string {
  if (!url) return "icons/icon16.png";
  try {
    new URL(url);
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${
      encodeURIComponent(url)
    }&size=32`;
  } catch {
    return "icons/icon16.png";
  }
}
