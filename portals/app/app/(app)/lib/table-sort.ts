export function sortRowsBy<R>(
  list: readonly R[],
  read: (row: R) => string | number | null | undefined,
  direction: "asc" | "desc",
): readonly R[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = read(a),
      y = read(b);
    const xEmpty = x === null || x === undefined || x === "";
    const yEmpty = y === null || y === undefined || y === "";
    // Rule 1, both halves: blanks sink whichever way the arrow points, so the
    // comparison below never sees one.
    if (xEmpty && yEmpty) return 0;
    if (xEmpty) return 1;
    if (yEmpty) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    // Rule 2: pinyin order, not UTF-16 code units.
    return String(x).localeCompare(String(y), "zh-CN") * dir;
  });
}
