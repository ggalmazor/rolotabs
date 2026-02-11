import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { urlsMatch } from "../lib/urls.js";

describe("urlsMatch", () => {
  it("matches identical URLs", () => {
    assert.ok(urlsMatch("https://example.com/page", "https://example.com/page"));
  });

  it("ignores trailing slashes", () => {
    assert.ok(urlsMatch("https://example.com/", "https://example.com"));
    assert.ok(urlsMatch("https://example.com/path/", "https://example.com/path"));
  });

  it("ignores fragments", () => {
    assert.ok(urlsMatch("https://example.com/page#top", "https://example.com/page"));
    assert.ok(urlsMatch("https://example.com/page#a", "https://example.com/page#b"));
  });

  it("preserves query strings", () => {
    assert.ok(urlsMatch("https://example.com?q=1", "https://example.com?q=1"));
    assert.ok(!urlsMatch("https://example.com?q=1", "https://example.com?q=2"));
    assert.ok(!urlsMatch("https://example.com?q=1", "https://example.com"));
  });

  it("returns false for null/undefined/empty", () => {
    assert.ok(!urlsMatch(null, "https://example.com"));
    assert.ok(!urlsMatch("https://example.com", null));
    assert.ok(!urlsMatch(null, null));
    assert.ok(!urlsMatch("", ""));
    assert.ok(!urlsMatch(undefined, undefined));
  });

  it("different origins don't match", () => {
    assert.ok(!urlsMatch("https://example.com", "https://other.com"));
    assert.ok(!urlsMatch("http://example.com", "https://example.com"));
  });

  it("different paths don't match", () => {
    assert.ok(!urlsMatch("https://example.com/a", "https://example.com/b"));
  });

  it("falls back to string equality for invalid URLs", () => {
    assert.ok(urlsMatch("not-a-url", "not-a-url"));
    assert.ok(!urlsMatch("not-a-url", "also-not-a-url"));
  });

  it("normalizes multiple trailing slashes", () => {
    assert.ok(urlsMatch("https://example.com///", "https://example.com"));
  });
});
