import assert from "node:assert/strict";
import { writeSeries } from "./support/fixture-library.ts";
import { api, createLibrary, seriesNamed, startedAndClaimed, waitFor } from "./support/komga.ts";

const LIBRARY = "/data";

Deno.test("the reference plugin's series metadata appears after a scan", async () => {
  await startedAndClaimed();
  await writeSeries(LIBRARY, "Plugin Series", {
    "plugin-metadata.json": JSON.stringify({
      summary: "Supplied by the reference plugin",
      publisher: "Reference Press",
      genres: ["Action", "Comedy"],
    }),
    "001.cbz.plugin-metadata.json": JSON.stringify({
      title: "Plugin Book Title",
      summary: "Book summary from the reference plugin",
      number: "7",
      releaseDate: "2021-03-04",
      authors: [{ name: "Jane Doe", role: "writer" }],
      tags: ["Plugin Tag"],
      isbn: "9780306406157",
    }),
  });
  await writeSeries(LIBRARY, "Plain Series");
  await createLibrary("Fixture", LIBRARY);

  // Komga scans in the background; poll its REST API for the result.
  const series = await waitFor("the plugin's metadata on the series", async () => {
    const found = await seriesNamed("Plugin Series");
    return found?.metadata?.summary === "Supplied by the reference plugin" && found;
  });
  assert.equal(series.metadata.publisher, "Reference Press");
  // Komga stores genres in lower case.
  assert.deepEqual([...series.metadata.genres].sort(), ["action", "comedy"]);

  // A series without the plugin's file is scanned normally and gets nothing from the plugin.
  const plain = await waitFor("the plain series", () => seriesNamed("Plain Series"));
  assert.equal(plain.metadata.summary, "");
  assert.equal(plain.metadata.publisher, "");

  const response = await api(`/api/v1/series/${series.id}`);
  assert.equal((await response.json()).metadata.summary, "Supplied by the reference plugin");
});

Deno.test("the reference plugin's book metadata appears on the book after a scan", async () => {
  await startedAndClaimed();
  const series = await waitFor("the plugin series", () => seriesNamed("Plugin Series"));
  const book = await waitFor("the plugin's metadata on the book", async () => {
    const response = await api(`/api/v1/series/${series.id}/books`);
    const found = (await response.json()).content?.[0];
    return found?.metadata?.title === "Plugin Book Title" && found;
  });
  assert.equal(book.metadata.summary, "Book summary from the reference plugin");
  assert.equal(book.metadata.number, "7");
  assert.equal(book.metadata.releaseDate, "2021-03-04");
  assert.equal(book.metadata.isbn, "9780306406157");
  assert.deepEqual(book.metadata.authors, [{ name: "Jane Doe", role: "writer" }]);
  // Komga stores tags in lower case.
  assert.deepEqual(book.metadata.tags, ["plugin tag"]);

  // A book without the plugin's file is scanned normally and gets nothing from the plugin.
  const plain = await waitFor("the plain series", () => seriesNamed("Plain Series"));
  const plainBook = (await (await api(`/api/v1/series/${plain.id}/books`)).json()).content[0];
  assert.equal(plainBook.metadata.summary, "");
});
