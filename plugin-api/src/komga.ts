// Komga's data, through the Plugin Host. Reading needs the "komga:read" capability, writing
// "komga:write"; both must be declared in the manifest and approved by the admin. The Plugin Host
// makes the real request to Komga's REST API, so a plugin never holds an API key.
//
// The shapes below follow Komga's REST API loosely: the fields a plugin is most likely to use are
// typed, and anything else Komga returns is still there under its own name as `unknown`.

export interface Library {
  id: string;
  name: string;
  root: string;
  [field: string]: unknown;
}

export interface KomgaSeries {
  id: string;
  libraryId: string;
  name: string;
  url: string;
  booksCount: number;
  metadata: {
    status: string;
    title: string;
    titleSort: string;
    summary: string;
    publisher: string;
    language: string;
    genres: string[];
    tags: string[];
    [field: string]: unknown;
  };
  [field: string]: unknown;
}

export interface KomgaBook {
  id: string;
  seriesId: string;
  libraryId: string;
  name: string;
  url: string;
  number: number;
  metadata: {
    title: string;
    summary: string;
    number: string;
    releaseDate?: string;
    authors: { name: string; role: string }[];
    tags: string[];
    isbn: string;
    [field: string]: unknown;
  };
  [field: string]: unknown;
}

/** Fields of a series' metadata to change. Each `...Lock` field stops Komga's own refresh from overwriting it. */
export interface SeriesMetadataUpdate {
  status?: "ENDED" | "ONGOING" | "ABANDONED" | "HIATUS";
  title?: string;
  titleSort?: string;
  summary?: string;
  publisher?: string;
  language?: string;
  genres?: string[];
  tags?: string[];
  titleLock?: boolean;
  titleSortLock?: boolean;
  summaryLock?: boolean;
  publisherLock?: boolean;
  languageLock?: boolean;
  genresLock?: boolean;
  tagsLock?: boolean;
}

/** Fields of a book's metadata to change. */
export interface BookMetadataUpdate {
  title?: string;
  summary?: string;
  number?: string;
  numberSort?: number;
  /** A calendar date, yyyy-mm-dd. */
  releaseDate?: string | null;
  authors?: { name: string; role: string }[];
  tags?: string[];
  isbn?: string;
  titleLock?: boolean;
  summaryLock?: boolean;
  numberLock?: boolean;
  numberSortLock?: boolean;
  releaseDateLock?: boolean;
  authorsLock?: boolean;
  tagsLock?: boolean;
  isbnLock?: boolean;
}

/** What `api.komga` offers a hook. */
export interface KomgaApi {
  /** Needs "komga:read". */
  getSeries(seriesId: string): Promise<KomgaSeries>;
  /** Needs "komga:read". */
  getBook(bookId: string): Promise<KomgaBook>;
  /** Needs "komga:read". */
  listLibraries(): Promise<Library[]>;
  /** Needs "komga:write". */
  updateSeriesMetadata(seriesId: string, update: SeriesMetadataUpdate): Promise<null>;
  /** Needs "komga:write". */
  updateBookMetadata(bookId: string, update: BookMetadataUpdate): Promise<null>;
}
