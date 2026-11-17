import assert from "node:assert/strict";
import { startTestHost } from "./support/host.ts";
import { FakeBridge } from "./support/fake-bridge.ts";
import { withHost as withStartedHost } from "./support/with-host.ts";

const withHost = (
  plugins: string[],
  body: (bridge: FakeBridge) => Promise<void>,
  callTimeoutMs = 3000,
  failureThreshold = 3,
) => withStartedHost({ plugins, callTimeoutMs, failureThreshold }, (_host, bridge) => body(bridge));

const routes = async (bridge: FakeBridge) => (await (await bridge.request("/bridge/response-filters")).json()).routes;

const filter = async (bridge: FakeBridge, path: string, body: unknown) => {
  const response = await bridge.request("/bridge/response-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: { method: "GET", path, query: "" }, body }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

Deno.test("with no filter plugin, no route is filtered and nothing changes", () =>
  withHost(["reference"], async (bridge) => {
    assert.deepEqual(await routes(bridge), []);
    const { status, body } = await filter(bridge, "/api/v1/libraries", [{ name: "A" }]);
    assert.equal(status, 200);
    assert.deepEqual(body, { changed: false });
  }));

Deno.test("a filter plugin announces its routes and changes matching responses", () =>
  withHost(["response-filter", "reference"], async (bridge) => {
    assert.deepEqual(await routes(bridge), ["/api/v1/libraries", "/api/v1/series/*"]);
    const { body } = await filter(bridge, "/api/v1/libraries", [{ name: "Keep" }, { name: "Hidden" }]);
    assert.deepEqual(body, { changed: true, body: [{ name: "Keep" }] });
  }));

Deno.test("a route pattern with a star matches one path segment", () =>
  withHost(["response-filter"], async (bridge) => {
    const hit = await filter(bridge, "/api/v1/series/abc", { id: "abc" });
    assert.deepEqual(hit.body, {
      changed: true,
      body: { id: "abc", filteredBy: "response-filter", path: "/api/v1/series/abc" },
    });
    assert.deepEqual((await filter(bridge, "/api/v1/series/abc/books", { id: "abc" })).body, { changed: false });
    assert.deepEqual((await filter(bridge, "/api/v1/books/abc", { id: "abc" })).body, { changed: false });
  }));

Deno.test("a filter that hangs is cut off, counted as a failure, and the response is unchanged", () =>
  withHost(["response-filter-hanger"], async (bridge) => {
    const started = Date.now();
    const { status, body } = await filter(bridge, "/api/v1/libraries", [{ name: "Hidden" }]);
    assert.equal(status, 200);
    assert.deepEqual(body, { changed: false });
    assert.ok(Date.now() - started < 2000);
    const failures = await bridge.failures("response-filter-hanger");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].kind, "timeout");
  }, 300));

Deno.test("a filter that throws leaves the response unchanged and repeated failures disable it", () =>
  withHost(["response-filter-crasher"], async (bridge) => {
    for (let i = 0; i < 2; i++) {
      assert.deepEqual((await filter(bridge, "/api/v1/libraries", [{ name: "x" }])).body, { changed: false });
    }
    assert.equal((await bridge.failures("response-filter-crasher")).length, 2);
    assert.deepEqual(await routes(bridge), ["/api/v1/libraries"]);
    await filter(bridge, "/api/v1/libraries", []);
    // Disabled after the threshold: it no longer filters, and no longer announces routes.
    assert.deepEqual(await routes(bridge), []);
  }, 3000, 3));

Deno.test("a failing filter does not stop another filter from working", () =>
  withHost(["response-filter", "response-filter-crasher"], async (bridge) => {
    const { body } = await filter(bridge, "/api/v1/libraries", [{ name: "Keep" }, { name: "Hidden" }]);
    assert.deepEqual(body, { changed: true, body: [{ name: "Keep" }] });
  }));

Deno.test("filter routes need the shared secret", () =>
  withHost(["response-filter"], async (bridge) => {
    assert.equal(await bridge.status("/bridge/response-filters", null), 401);
    assert.equal(await bridge.status("/bridge/response-filters", "wrong"), 401);
  }));
