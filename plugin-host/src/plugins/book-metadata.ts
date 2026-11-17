// Book metadata as plugins supply it, and how several plugins' answers combine.
export interface BookAuthor {
  name: string;
  role: string;
}

export interface BookMetadata {
  title?: string;
  summary?: string;
  number?: string;
  /** ISO calendar date, yyyy-mm-dd. */
  releaseDate?: string;
  authors?: BookAuthor[];
  tags?: string[];
  isbn?: string;
}

const stringFields = ["title", "summary", "number", "isbn"] as const;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Keeps only the fields the Bridge understands, with the right types. Anything else is dropped. */
export function sanitizeBookMetadata(value: unknown): BookMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const result: BookMetadata = {};
  for (const field of stringFields) {
    if (typeof input[field] === "string") result[field] = input[field] as string;
  }
  if (typeof input.releaseDate === "string" && isCalendarDate(input.releaseDate)) {
    result.releaseDate = input.releaseDate;
  }
  if (Array.isArray(input.authors)) {
    const authors = input.authors.filter((a): a is BookAuthor =>
      typeof a === "object" && a !== null && typeof a.name === "string" && typeof a.role === "string"
    ).map((a) => ({ name: a.name, role: a.role }));
    if (authors.length > 0) result.authors = authors;
  }
  if (Array.isArray(input.tags) && input.tags.length > 0 && input.tags.every((t) => typeof t === "string")) {
    result.tags = input.tags as string[];
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Plugins are given in a stable order; for each field the first plugin to supply it wins. */
export function mergeBookMetadata(results: unknown[]): BookMetadata | null {
  const merged: BookMetadata = {};
  for (const result of results) {
    const metadata = sanitizeBookMetadata(result);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (!(key in merged)) (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}
