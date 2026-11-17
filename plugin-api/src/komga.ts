// Komga's data, through the Plugin Host. Reading needs the "komga:read" capability, writing
// "komga:write"; both must be declared in the manifest and approved by the admin. The Plugin Host
// makes the real request to Komga's REST API, so a plugin never holds an API key.
//
// The shapes below follow Komga's REST API loosely: the fields a plugin is most likely to use are
// typed, and anything else Komga returns is still there under its own name as `unknown`.

/** A Komga library, as Komga's REST API returns it. */
export interface Library {
  /** Komga's id for the library. */
  id: string;
  /** The library's name. */
  name: string;
  /** The library's root folder. */
  root: string;
  /** Any other field Komga returns, under its own name. */
  [field: string]: unknown;
}

/** A Komga series, as Komga's REST API returns it. */
export interface KomgaSeries {
  /** Komga's id for the series. */
  id: string;
  /** Komga's id for the library the series is in. */
  libraryId: string;
  /** The series' name. */
  name: string;
  /** The series folder. */
  url: string;
  /** How many books the series holds. */
  booksCount: number;
  /** The series' metadata, as Komga stores it. */
  metadata: {
    /** "ENDED", "ONGOING", "ABANDONED" or "HIATUS". */
    status: string;
    /** The title shown. */
    title: string;
    /** The title used for sorting. */
    titleSort: string;
    /** A description of the series. */
    summary: string;
    /** The series' publisher. */
    publisher: string;
    /** The series' language, as a BCP 47 tag. */
    language: string;
    /** The series' genres. */
    genres: string[];
    /** The series' tags. */
    tags: string[];
    /** Any other field Komga returns, under its own name. */
    [field: string]: unknown;
  };
  /** Any other field Komga returns, under its own name. */
  [field: string]: unknown;
}

/** A Komga book, as Komga's REST API returns it. */
export interface KomgaBook {
  /** Komga's id for the book. */
  id: string;
  /** Komga's id for the series the book is in. */
  seriesId: string;
  /** Komga's id for the library the book is in. */
  libraryId: string;
  /** The book's name. */
  name: string;
  /** The book file. */
  url: string;
  /** The book's position in its series, as Komga numbers it. */
  number: number;
  /** The book's metadata, as Komga stores it. */
  metadata: {
    /** The book title. */
    title: string;
    /** A description of the book. */
    summary: string;
    /** The book's number within its series, as text. */
    number: string;
    /** A calendar date, yyyy-mm-dd, when the book has one. */
    releaseDate?: string;
    /** The people who worked on the book. */
    authors: { name: string; role: string }[];
    /** The book's tags. */
    tags: string[];
    /** The book's ISBN. */
    isbn: string;
    /** Any other field Komga returns, under its own name. */
    [field: string]: unknown;
  };
  /** Any other field Komga returns, under its own name. */
  [field: string]: unknown;
}

/** Fields of a series' metadata to change. Each `...Lock` field stops Komga's own refresh from overwriting it. */
export interface SeriesMetadataUpdate {
  /** The series' publication status. */
  status?: "ENDED" | "ONGOING" | "ABANDONED" | "HIATUS";
  /** The title shown. */
  title?: string;
  /** The title used for sorting. */
  titleSort?: string;
  /** A description of the series. */
  summary?: string;
  /** The series' publisher. */
  publisher?: string;
  /** The series' language, as a BCP 47 tag such as "en". */
  language?: string;
  /** The series' genres. Replaces the genres it has. */
  genres?: string[];
  /** The series' tags. Replaces the tags it has. */
  tags?: string[];
  /** Locks `title` against Komga's own refresh. */
  titleLock?: boolean;
  /** Locks `titleSort` against Komga's own refresh. */
  titleSortLock?: boolean;
  /** Locks `summary` against Komga's own refresh. */
  summaryLock?: boolean;
  /** Locks `publisher` against Komga's own refresh. */
  publisherLock?: boolean;
  /** Locks `language` against Komga's own refresh. */
  languageLock?: boolean;
  /** Locks `genres` against Komga's own refresh. */
  genresLock?: boolean;
  /** Locks `tags` against Komga's own refresh. */
  tagsLock?: boolean;
}

/** Fields of a book's metadata to change. Each `...Lock` field stops Komga's own refresh from overwriting it. */
export interface BookMetadataUpdate {
  /** The book title. */
  title?: string;
  /** A description of the book. */
  summary?: string;
  /** The book's number within its series, as text. */
  number?: string;
  /** The number Komga sorts books by within the series. */
  numberSort?: number;
  /** A calendar date, yyyy-mm-dd. */
  releaseDate?: string | null;
  /** The people who worked on the book. Replaces the authors it has. */
  authors?: { name: string; role: string }[];
  /** The book's tags. Replaces the tags it has. */
  tags?: string[];
  /** The book's ISBN. */
  isbn?: string;
  /** Locks `title` against Komga's own refresh. */
  titleLock?: boolean;
  /** Locks `summary` against Komga's own refresh. */
  summaryLock?: boolean;
  /** Locks `number` against Komga's own refresh. */
  numberLock?: boolean;
  /** Locks `numberSort` against Komga's own refresh. */
  numberSortLock?: boolean;
  /** Locks `releaseDate` against Komga's own refresh. */
  releaseDateLock?: boolean;
  /** Locks `authors` against Komga's own refresh. */
  authorsLock?: boolean;
  /** Locks `tags` against Komga's own refresh. */
  tagsLock?: boolean;
  /** Locks `isbn` against Komga's own refresh. */
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
