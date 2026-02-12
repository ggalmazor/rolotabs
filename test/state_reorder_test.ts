import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { reorderItem } from "../src/lib/reorder.ts";

describe("reorderItem", () => {
  it("moves item forward in the list", () => {
    const list = ["a", "b", "c", "d"];
    assertEquals(reorderItem(list, "a", 2), ["b", "c", "a", "d"]);
  });

  it("moves item backward in the list", () => {
    const list = ["a", "b", "c", "d"];
    assertEquals(reorderItem(list, "c", 0), ["c", "a", "b", "d"]);
  });

  it("move to same position is a no-op", () => {
    const list = ["a", "b", "c"];
    assertEquals(reorderItem(list, "b", 1), ["a", "b", "c"]);
  });

  it("move to end", () => {
    const list = ["a", "b", "c"];
    assertEquals(reorderItem(list, "a", 2), ["b", "c", "a"]);
  });

  it("move to beginning", () => {
    const list = ["a", "b", "c"];
    assertEquals(reorderItem(list, "c", 0), ["c", "a", "b"]);
  });

  it("returns copy, does not mutate original", () => {
    const list = ["a", "b", "c"];
    const result = reorderItem(list, "a", 2);
    assertEquals(list, ["a", "b", "c"]);
    assertEquals(result, ["b", "c", "a"]);
  });

  it("returns copy unchanged if item not found", () => {
    const list = ["a", "b", "c"];
    assertEquals(reorderItem(list, "x", 1), ["a", "b", "c"]);
  });

  it("clamps index to bounds", () => {
    const list = ["a", "b", "c"];
    assertEquals(reorderItem(list, "a", 99), ["b", "c", "a"]);
    assertEquals(reorderItem(list, "c", -1), ["c", "a", "b"]);
  });
});
