// Komga's events, as a plugin receives them. Subscribe in the manifest:
//   "contributions": [{ "type": "events", "subscribe": ["LibraryScanned"] }]
// A plugin receives only the event types it subscribed to. Payloads carry ids and names only.

/** Something in Komga named in an event: a library, collection or read list. */
export interface NamedRef {
  /** Komga's id for it. */
  id: string;
  /** Its name. */
  name: string;
}

/** A series named in an event. */
export interface SeriesEventRef extends NamedRef {
  /** Komga's id for the library the series is in. */
  libraryId: string;
}

/** A book named in an event. */
export interface BookEventRef extends NamedRef {
  /** Komga's id for the series the book is in. */
  seriesId: string;
  /** Komga's id for the library the book is in. */
  libraryId: string;
}

/**
 * Each event type Komga forwards, with its payload. Payloads carry ids and names only; read more
 * through {@link KomgaApi} when the plugin holds "komga:read".
 */
export interface KomgaEventMap {
  /** A library was created. */
  LibraryAdded: { library: NamedRef };
  /** A library's settings were changed. */
  LibraryUpdated: { library: NamedRef };
  /** A library was deleted. */
  LibraryDeleted: { library: NamedRef };
  /** Fires before Komga's follow-up tasks (analysis, metadata refresh) have run. */
  LibraryScanned: { library: NamedRef };
  /** A scan found a new series. */
  SeriesAdded: { series: SeriesEventRef };
  /** A series or its metadata changed. */
  SeriesUpdated: { series: SeriesEventRef };
  /** A series was removed. */
  SeriesDeleted: { series: SeriesEventRef };
  /** A scan found a new book. */
  BookAdded: { book: BookEventRef };
  /** A book or its metadata changed. */
  BookUpdated: { book: BookEventRef };
  /** A book was removed. */
  BookDeleted: { book: BookEventRef };
  /** Komga's book import finished, for one file: `success` says whether it worked, `message` why not. */
  BookImported: { book: BookEventRef | null; sourceFile: string; success: boolean; message: string | null };
  /** A collection was created. */
  CollectionAdded: { collection: NamedRef };
  /** A collection was changed. */
  CollectionUpdated: { collection: NamedRef };
  /** A collection was deleted. */
  CollectionDeleted: { collection: NamedRef };
  /** A read list was created. */
  ReadListAdded: { readList: NamedRef };
  /** A read list was changed. */
  ReadListUpdated: { readList: NamedRef };
  /** A read list was deleted. */
  ReadListDeleted: { readList: NamedRef };
  /** A user's reading progress in a book changed. */
  ReadProgressChanged: { bookId: string; userId: string };
  /** A user's reading progress in a book was removed. */
  ReadProgressDeleted: { bookId: string; userId: string };
  /** A user's reading progress across a series changed. */
  ReadProgressSeriesChanged: { seriesId: string; userId: string };
  /** A user's reading progress across a series was removed. */
  ReadProgressSeriesDeleted: { seriesId: string; userId: string };
  /** A thumbnail was added to a book. */
  ThumbnailBookAdded: { thumbnailId: string; bookId: string };
  /** A thumbnail was removed from a book. */
  ThumbnailBookDeleted: { thumbnailId: string; bookId: string };
  /** A thumbnail was added to a series. */
  ThumbnailSeriesAdded: { thumbnailId: string; seriesId: string };
  /** A thumbnail was removed from a series. */
  ThumbnailSeriesDeleted: { thumbnailId: string; seriesId: string };
  /** A thumbnail was added to a collection. */
  ThumbnailSeriesCollectionAdded: { thumbnailId: string; collectionId: string };
  /** A thumbnail was removed from a collection. */
  ThumbnailSeriesCollectionDeleted: { thumbnailId: string; collectionId: string };
  /** A thumbnail was added to a read list. */
  ThumbnailReadListAdded: { thumbnailId: string; readListId: string };
  /** A thumbnail was removed from a read list. */
  ThumbnailReadListDeleted: { thumbnailId: string; readListId: string };
  /** A user account was changed. */
  UserUpdated: { user: { id: string; email: string } };
  /** A user account was deleted. */
  UserDeleted: { user: { id: string; email: string } };
}

/** The name of a Komga event, as listed in a manifest's `subscribe`. */
export type KomgaEventType = keyof KomgaEventMap;

/**
 * An event, discriminated on `type`: narrow with `event.type === "LibraryScanned"`.
 *
 * ```ts
 * import type { Plugin } from "@komga-plugin-bridge/plugin-api";
 *
 * export default {
 *   async onEvent(event, api) {
 *     if (event.type === "LibraryScanned") {
 *       await api.storage.set("lastScan", event.data.library.id);
 *     }
 *   },
 * } satisfies Plugin;
 * ```
 */
export type KomgaEvent = { [T in KomgaEventType]: { type: T; data: KomgaEventMap[T] } }[KomgaEventType];
