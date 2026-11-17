// Scan-time metadata: what Komga asks a plugin for, and what a plugin may answer.

/** The series Komga is scanning or refreshing. `path` is the series folder. */
export interface SeriesRef {
  /** Komga's id for the series. */
  id: string;
  /** The series' name, as Komga knows it. */
  name: string;
  /** The series folder, at the same path in the Plugin Host as in Komga. */
  path: string;
  /** Komga's id for the library the series is in. */
  libraryId: string;
}

/** The book Komga is scanning or refreshing. `path` is the book file. */
export interface BookRef {
  /** Komga's id for the book. */
  id: string;
  /** The book's name, as Komga knows it. */
  name: string;
  /** The book file, at the same path in the Plugin Host as in Komga. */
  path: string;
  /** Komga's id for the series the book is in. */
  seriesId: string;
  /** Komga's id for the library the book is in. */
  libraryId: string;
}

/**
 * Series metadata a plugin supplies. Every field is optional; supply what you know. When several
 * plugins answer, each field comes from the first plugin, in plugin id order, that supplies it.
 * A field of the wrong type is dropped.
 */
export interface SeriesMetadata {
  /** The series title. */
  title?: string;
  /** A description of the series. */
  summary?: string;
  /** The series' publisher. */
  publisher?: string;
  /** The series' language, as a BCP 47 tag such as "en" or "ja". */
  language?: string;
  /** The series' genres. */
  genres?: string[];
}

/** One person who worked on a book. */
export interface BookAuthor {
  /** The person's name. */
  name: string;
  /** For example "writer", "penciller", "colorist". */
  role: string;
}

/**
 * Book metadata a plugin supplies. Every field is optional; supply what you know. When several
 * plugins answer, each field comes from the first plugin, in plugin id order, that supplies it.
 * A field of the wrong type, or a release date that is not a calendar date, is dropped.
 */
export interface BookMetadata {
  /** The book title. */
  title?: string;
  /** A description of the book. */
  summary?: string;
  /** The book's number within its series, as text: "1", "1.5" or "Extra". */
  number?: string;
  /** A calendar date, yyyy-mm-dd. */
  releaseDate?: string;
  /** The people who worked on the book. */
  authors?: BookAuthor[];
  /** The book's tags. */
  tags?: string[];
  /** The book's ISBN. */
  isbn?: string;
}
