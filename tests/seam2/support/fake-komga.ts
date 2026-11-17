// Stand-in for Komga's REST API, for tests of the Plugin Host's calls to Komga. It answers with
// canned data and records every request it receives. Later tickets add the endpoints they need.
export interface FakeKomga {
  url: string;
  apiKey: string;
  requests: { method: string; path: string; apiKey: string | null; body?: unknown }[];
  stop(): Promise<void>;
}

export function startFakeKomga(apiKey = "fake-komga-api-key"): FakeKomga {
  const requests: FakeKomga["requests"] = [];
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, async (req) => {
    const url = new URL(req.url);
    const text = await req.text();
    requests.push({
      method: req.method,
      path: url.pathname,
      apiKey: req.headers.get("X-API-Key"),
      body: text ? JSON.parse(text) : undefined,
    });
    if (req.headers.get("X-API-Key") !== apiKey) return new Response(null, { status: 401 });
    if (url.pathname === "/api/v1/libraries") return Response.json([]);
    const series = url.pathname.match(/^\/api\/v1\/series\/([^/]+)(\/metadata)?$/);
    if (series && req.method === "GET" && !series[2]) return Response.json({ id: series[1], name: "Fake series" });
    if (series && req.method === "PATCH" && series[2]) return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  });
  return {
    url: `http://127.0.0.1:${server.addr.port}`,
    apiKey,
    requests,
    stop: () => server.shutdown(),
  };
}
