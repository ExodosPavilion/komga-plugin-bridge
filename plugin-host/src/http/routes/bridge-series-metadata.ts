import { metadataCall } from "../bridge-call.ts";
import { mergeSeriesMetadata } from "../../plugins/series-metadata.ts";
import type { Router } from "../router.ts";

/**
 * Scan-time series metadata, asked for by the Bridge when Komga scans or refreshes a series.
 * Request: {"series": {"id", "name", "path", "libraryId"}}. Response: {"metadata": {...} | null}.
 */
export function register(router: Router) {
  router.post("/bridge/series-metadata", metadataCall("series", "getSeriesMetadata", mergeSeriesMetadata));
}
