// How several plugins' answers combine into one: plugins are given in a stable order, each answer
// is cleaned by the caller's `sanitize` (only known fields, right types), and for each field the
// first plugin to supply it wins.
export function mergeFirstWins<T extends object>(results: unknown[], sanitize: (value: unknown) => T | null): T | null {
  const merged: Partial<T> = {};
  for (const result of results) {
    const metadata = sanitize(result);
    if (!metadata) continue;
    for (const key of Object.keys(metadata) as (keyof T)[]) {
      if (!(key in merged)) merged[key] = metadata[key];
    }
  }
  return Object.keys(merged).length > 0 ? merged as T : null;
}
