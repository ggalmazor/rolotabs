/**
 * Compare URLs loosely: ignore trailing slashes and fragments, keep query strings.
 */
export function urlsMatch(url1: string | null | undefined, url2: string | null | undefined): boolean {
  if (!url1 || !url2) return false;
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    return normalize(a) === normalize(b);
  } catch {
    return url1 === url2;
  }
}

function normalize(url: URL): string {
  return url.origin + url.pathname.replace(/\/+$/, "") + url.search;
}
