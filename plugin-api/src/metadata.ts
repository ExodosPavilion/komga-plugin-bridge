// Scan-time metadata: what Komga asks a plugin for, and what a plugin may answer.

/** The series Komga is scanning or refreshing. `path` is the series folder. */
export interface SeriesRef {
  id: string;
  name: string;
  path: string;
  libraryId: string;
}

/** The book Komga is scanning or refreshing. `path` is the book file. */
export interface BookRef {
  id: string;
  name: string;
  path: string;
  seriesId: string;
  libraryId: string;
}

/** Series metadata a plugin supplies. Every field is optional; supply what you know. */
export interface SeriesMetadata {
  title?: string;
  summary?: string;
  publisher?: string;
  language?: string;
  genres?: string[];
}

export interface BookAuthor {
  name: string;
  /** For example "writer", "penciller", "colorist". */
  role: string;
}

/** Book metadata a plugin supplies. Every field is optional; supply what you know. */
export interface BookMetadata {
  title?: string;
  summary?: string;
  number?: string;
  /** A calendar date, yyyy-mm-dd. */
  releaseDate?: string;
  authors?: BookAuthor[];
  tags?: string[];
  isbn?: string;
}
