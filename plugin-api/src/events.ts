// Komga's events, as a plugin receives them. Subscribe in the manifest:
//   "contributions": [{ "type": "events", "subscribe": ["LibraryScanned"] }]
// A plugin receives only the event types it subscribed to. Payloads carry ids and names only.

export interface NamedRef {
  id: string;
  name: string;
}
export interface SeriesEventRef extends NamedRef {
  libraryId: string;
}
export interface BookEventRef extends NamedRef {
  seriesId: string;
  libraryId: string;
}

/** Each event type Komga forwards, with its payload. */
export interface KomgaEventMap {
  LibraryAdded: { library: NamedRef };
  LibraryUpdated: { library: NamedRef };
  LibraryDeleted: { library: NamedRef };
  /** Fires before Komga's follow-up tasks (analysis, metadata refresh) have run. */
  LibraryScanned: { library: NamedRef };
  SeriesAdded: { series: SeriesEventRef };
  SeriesUpdated: { series: SeriesEventRef };
  SeriesDeleted: { series: SeriesEventRef };
  BookAdded: { book: BookEventRef };
  BookUpdated: { book: BookEventRef };
  BookDeleted: { book: BookEventRef };
  BookImported: { book: BookEventRef | null; sourceFile: string; success: boolean; message: string | null };
  CollectionAdded: { collection: NamedRef };
  CollectionUpdated: { collection: NamedRef };
  CollectionDeleted: { collection: NamedRef };
  ReadListAdded: { readList: NamedRef };
  ReadListUpdated: { readList: NamedRef };
  ReadListDeleted: { readList: NamedRef };
  ReadProgressChanged: { bookId: string; userId: string };
  ReadProgressDeleted: { bookId: string; userId: string };
  ReadProgressSeriesChanged: { seriesId: string; userId: string };
  ReadProgressSeriesDeleted: { seriesId: string; userId: string };
  ThumbnailBookAdded: { thumbnailId: string; bookId: string };
  ThumbnailBookDeleted: { thumbnailId: string; bookId: string };
  ThumbnailSeriesAdded: { thumbnailId: string; seriesId: string };
  ThumbnailSeriesDeleted: { thumbnailId: string; seriesId: string };
  ThumbnailSeriesCollectionAdded: { thumbnailId: string; collectionId: string };
  ThumbnailSeriesCollectionDeleted: { thumbnailId: string; collectionId: string };
  ThumbnailReadListAdded: { thumbnailId: string; readListId: string };
  ThumbnailReadListDeleted: { thumbnailId: string; readListId: string };
  UserUpdated: { user: { id: string; email: string } };
  UserDeleted: { user: { id: string; email: string } };
}

export type KomgaEventType = keyof KomgaEventMap;

/** An event, discriminated on `type`: narrow with `event.type === "LibraryScanned"`. */
export type KomgaEvent = { [T in KomgaEventType]: { type: T; data: KomgaEventMap[T] } }[KomgaEventType];
