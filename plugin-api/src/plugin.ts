// What a plugin's module exports. Every hook is optional and is called as `hook(params, api)`.
// A hook that throws, or runs past the time limit, counts as a failure of the plugin.
//
// Each group of hooks is its own interface; `Plugin` extends all of them. A new kind of hook is a new
// interface in its own file, plus one line below.
import type { PluginApi } from "./api.ts";
import type { KomgaEvent } from "./events.ts";
import type { FilterHooks } from "./filtering.ts";
import type { BookMetadata, BookRef, SeriesMetadata, SeriesRef } from "./metadata.ts";

export type MaybePromise<T> = T | Promise<T>;

/** Scan-time metadata. Return null (or nothing) when the plugin has nothing for this one. */
export interface MetadataHooks {
  /** Called when Komga scans or refreshes a series. */
  getSeriesMetadata?(
    params: { series: SeriesRef },
    api: PluginApi,
  ): MaybePromise<SeriesMetadata | null | undefined | void>;
  /** Called when Komga scans or refreshes a book. */
  getBookMetadata?(
    params: { book: BookRef },
    api: PluginApi,
  ): MaybePromise<BookMetadata | null | undefined | void>;
}

/** Events the plugin subscribed to in its manifest. */
export interface EventHooks {
  onEvent?(event: KomgaEvent, api: PluginApi): MaybePromise<void>;
}

export interface Plugin extends MetadataHooks, EventHooks, FilterHooks {}
