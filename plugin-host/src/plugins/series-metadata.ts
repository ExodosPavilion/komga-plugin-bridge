// Series metadata as plugins supply it, and how several plugins' answers combine.
import { mergeFirstWins } from "./merge.ts";
/** Series metadata as the Plugin Host passes it to the Bridge: the plugins' answers, merged. */
export interface SeriesMetadata {
  /** The series title. */
  title?: string;
  /** A description of the series. */
  summary?: string;
  /** The series' publisher. */
  publisher?: string;
  /** The series' language, as a BCP 47 tag. */
  language?: string;
  /** The series' genres. */
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
  return mergeFirstWins(results, sanitizeSeriesMetadata);
}
