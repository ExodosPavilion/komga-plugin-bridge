// Series metadata as plugins supply it, and how several plugins' answers combine.
export interface SeriesMetadata {
  title?: string;
  summary?: string;
  publisher?: string;
  language?: string;
  genres?: string[];
}

const stringFields = ["title", "summary", "publisher", "language"] as const;

/** Keeps only the fields the Bridge understands, with the right types. Anything else is dropped. */
export function sanitizeSeriesMetadata(value: unknown): SeriesMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const result: SeriesMetadata = {};
  for (const field of stringFields) {
    if (typeof input[field] === "string") result[field] = input[field] as string;
  }
  if (Array.isArray(input.genres) && input.genres.every((g) => typeof g === "string")) {
    result.genres = input.genres as string[];
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Plugins are given in a stable order; for each field the first plugin to supply it wins. */
export function mergeSeriesMetadata(results: unknown[]): SeriesMetadata | null {
  const merged: SeriesMetadata = {};
  for (const result of results) {
    const metadata = sanitizeSeriesMetadata(result);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (!(key in merged)) (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}
