// Response filtering: change what Komga's JSON API returns to the bundled web UI. Declare the
// routes in the manifest,
//   "contributions": [{ "type": "response-filter", "routes": ["/api/v1/libraries", "/api/v1/series/*"] }]
// (`*` is one path segment, `**` anything) and export `filterResponse`. Requests from other
// clients (apps, OPDS readers) are never filtered. Several filters apply in plugin id order.
import type { PluginApi } from "./api.ts";
import type { MaybePromise } from "./plugin.ts";
import type { JsonValue } from "./storage.ts";

export interface FilterRequest {
  method: string;
  /** The request path, for example "/api/v1/libraries". */
  path: string;
  /** The raw query string, without the "?". */
  query: string;
}

export interface FilterResponseParams {
  request: FilterRequest;
  /** Komga's JSON response body (or the previous filter's output). */
  body: JsonValue;
}

export interface FilterHooks {
  /** Return the new JSON body, or null (or nothing) to leave the response as it is. */
  filterResponse?(
    params: FilterResponseParams,
    api: PluginApi,
  ): MaybePromise<JsonValue | null | undefined | void>;
}
