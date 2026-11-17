import { metadataCall } from "../bridge-call.ts";
import { mergeBookMetadata } from "../../plugins/book-metadata.ts";
import type { Router } from "../router.ts";

/**
 * Scan-time book metadata, asked for by the Bridge when Komga scans or refreshes a book.
 * Request: {"book": {"id", "name", "path", "seriesId", "libraryId"}}. Response: {"metadata": {...} | null}.
 */
export function register(router: Router) {
  router.post("/bridge/book-metadata", metadataCall("book", "getBookMetadata", mergeBookMetadata));
}
