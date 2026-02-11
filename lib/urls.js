// URL comparison utilities

/**
 * Compare URLs loosely: ignore trailing slashes and fragments, keep query strings.
 * @param {string} url1
 * @param {string} url2
 * @returns {boolean}
 */
export function urlsMatch(url1, url2) {
  if (!url1 || !url2) return false;
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    return normalize(a) === normalize(b);
  } catch {
    return url1 === url2;
  }
}

function normalize(url) {
  return url.origin + url.pathname.replace(/\/+$/, "") + url.search;
}
