import assert from "node:assert/strict";
import { join } from "node:path";
import { makeSeries, startTestHost } from "./support/host.ts";
import { book, FakeBridge } from "./support/fake-bridge.ts";
import { withHost as withStartedHost } from "./support/with-host.ts";

const withHost = (plugins: string[], body: Parameters<typeof withStartedHost>[1], callTimeoutMs = 3000) =>
  withStartedHost({ plugins, callTimeoutMs }, body);

Deno.test("the reference plugin supplies the metadata file beside a book", () =>
  withHost(["reference"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Some Series", {
      "001.cbz.plugin-metadata.json": JSON.stringify({
        title: "Chapter One",
        summary: "A book summary",
        number: "1",
        releaseDate: "2020-05-17",
        authors: [{ name: "Jane Doe", role: "writer" }],
        tags: ["fixture"],
        isbn: "9780306406157",
      }),
    });
    const { status, body } = await bridge.bookMetadata(book(join(dir, "001.cbz")));
    assert.equal(status, 200);
    assert.deepEqual(body, {
      metadata: {
        title: "Chapter One",
        summary: "A book summary",
        number: "1",
        releaseDate: "2020-05-17",
        authors: [{ name: "Jane Doe", role: "writer" }],
        tags: ["fixture"],
        isbn: "9780306406157",
      },
    });
  }));

Deno.test("a book without the metadata file gets no metadata", () =>
  withHost(["reference"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Bare Series");
    assert.deepEqual((await bridge.bookMetadata(book(join(dir, "001.cbz")))).body, { metadata: null });
  }));

Deno.test("malformed book fields are dropped, valid ones kept", () =>
  withHost(["reference"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Messy Series", {
      "001.cbz.plugin-metadata.json": JSON.stringify({
        title: "Kept",
        releaseDate: "not a date",
        authors: [{ name: "No Role" }],
        tags: "nope",
      }),
    });
    const { body } = await bridge.bookMetadata(book(join(dir, "001.cbz")));
    assert.deepEqual(body, { metadata: { title: "Kept" } });
  }));

Deno.test("book metadata needs the shared secret", () =>
  withHost([], async (_host, bridge) => {
    assert.equal((await bridge.bookMetadata(book("/x"), "wrong")).status, 401);
    assert.equal((await bridge.bookMetadata(book("/x"), null)).status, 401);
  }));

Deno.test("a crashing plugin does not stop other plugins from supplying book metadata", () =>
  withHost(["crasher", "reference"], async (host, bridge) => {
    const dir = await makeSeries(host.dirs.library, "Crash Series", {
      "001.cbz.plugin-metadata.json": JSON.stringify({ title: "Survivor" }),
    });
    const { status, body } = await bridge.bookMetadata(book(join(dir, "001.cbz")));
    assert.equal(status, 200);
    assert.equal(body.metadata.title, "Survivor");
  }));

Deno.test("a hanging plugin is cut off at the time limit and the book call still answers", () =>
  withHost(["hanger"], async (_host, bridge) => {
    const started = Date.now();
    const { status, body } = await bridge.bookMetadata(book("/x"));
    assert.equal(status, 200);
    assert.deepEqual(body, { metadata: null });
    assert.ok(Date.now() - started < 2000);
  }, 300));
