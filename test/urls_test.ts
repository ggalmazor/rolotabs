import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { urlsMatch } from "../src/lib/urls.ts";

describe("urlsMatch", () => {
  it("matches identical URLs", () => {
    assertEquals(urlsMatch("https://example.com/page", "https://example.com/page"), true);
  });

  it("ignores trailing slashes", () => {
    assertEquals(urlsMatch("https://example.com/", "https://example.com"), true);
    assertEquals(urlsMatch("https://example.com/path/", "https://example.com/path"), true);
  });

  it("ignores fragments", () => {
    assertEquals(urlsMatch("https://example.com/page#top", "https://example.com/page"), true);
    assertEquals(urlsMatch("https://example.com/page#a", "https://example.com/page#b"), true);
  });

  it("preserves query strings", () => {
    assertEquals(urlsMatch("https://example.com?q=1", "https://example.com?q=1"), true);
    assertEquals(urlsMatch("https://example.com?q=1", "https://example.com?q=2"), false);
    assertEquals(urlsMatch("https://example.com?q=1", "https://example.com"), false);
  });

  it("returns false for null/undefined/empty", () => {
    assertEquals(urlsMatch(null, "https://example.com"), false);
    assertEquals(urlsMatch("https://example.com", null), false);
    assertEquals(urlsMatch(null, null), false);
    assertEquals(urlsMatch("", ""), false);
    assertEquals(urlsMatch(undefined, undefined), false);
  });

  it("different origins don't match", () => {
    assertEquals(urlsMatch("https://example.com", "https://other.com"), false);
    assertEquals(urlsMatch("http://example.com", "https://example.com"), false);
  });

  it("different paths don't match", () => {
    assertEquals(urlsMatch("https://example.com/a", "https://example.com/b"), false);
  });

  it("falls back to string equality for invalid URLs", () => {
    assertEquals(urlsMatch("not-a-url", "not-a-url"), true);
    assertEquals(urlsMatch("not-a-url", "also-not-a-url"), false);
  });

  it("normalizes multiple trailing slashes", () => {
    assertEquals(urlsMatch("https://example.com///", "https://example.com"), true);
  });
});
