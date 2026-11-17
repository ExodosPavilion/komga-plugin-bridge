// The reference plugin: reads deliberately small custom metadata files beside a series or book and
// supplies them as metadata. It is not meant for real use; it proves and tests the plugin
// system, and shows the shape of a plugin.
//
// A series folder may contain `plugin-metadata.json`:
//   { "summary": "...", "publisher": "...", "genres": ["...", "..."] }
// A book file `001.cbz` may have `001.cbz.plugin-metadata.json` beside it:
//   { "title": "...", "summary": "...", "number": "1", "releaseDate": "2020-05-17",
//     "authors": [{ "name": "...", "role": "writer" }], "tags": ["..."], "isbn": "..." }

import type { BookMetadata, Plugin, SeriesMetadata } from "@komga-plugin-bridge/plugin-api";

const FILE = "plugin-metadata.json";

async function readJsonOrNull<T>(path: string): Promise<T | null> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
  return JSON.parse(text);
}

export default {
  /** Called when Komga scans or refreshes a series. `series.path` is the series folder. */
  async getSeriesMetadata({ series }) {
    const file = await readJsonOrNull<SeriesMetadata>(`${series.path}/${FILE}`);
    if (!file) return null;
    const { summary, publisher, genres } = file;
    return { summary, publisher, genres };
  },

  /** Called when Komga scans or refreshes a book. `book.path` is the book file. */
  async getBookMetadata({ book }) {
    const file = await readJsonOrNull<BookMetadata>(`${book.path}.${FILE}`);
    if (!file) return null;
    const { title, summary, number, releaseDate, authors, tags, isbn } = file;
    return { title, summary, number, releaseDate, authors, tags, isbn };
  },
} satisfies Plugin;
