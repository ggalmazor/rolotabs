/**
 * Move an item within a list to a new index. Returns a new array.
 * Does not mutate the original. Clamps index to valid bounds.
 * Returns a copy unchanged if the item is not found.
 */
export function reorderItem<T>(list: T[], item: T, toIndex: number): T[] {
  const fromIndex = list.indexOf(item);
  if (fromIndex === -1) return [...list];

  const result = [...list];
  result.splice(fromIndex, 1);
  const clamped = Math.max(0, Math.min(toIndex, result.length));
  result.splice(clamped, 0, item);
  return result;
}
