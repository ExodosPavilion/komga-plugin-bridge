// Stand-in for Komga's REST API, for tests of the Plugin Host's calls to Komga. It answers with
// canned data and records every request it receives. Later tickets add the endpoints they need.
export interface FakeKomga {
  url: string;
  apiKey: string;
  requests: { method: string; path: string; apiKey: string | null }[];
  stop(): Promise<void>;
}

export function startFakeKomga(apiKey = "fake-komga-api-key"): FakeKomga {
  const requests: FakeKomga["requests"] = [];
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, (req) => {
    const url = new URL(req.url);
    requests.push({ method: req.method, path: url.pathname, apiKey: req.headers.get("X-API-Key") });
    if (req.headers.get("X-API-Key") !== apiKey) return new Response(null, { status: 401 });
    if (url.pathname === "/api/v1/libraries") return Response.json([]);
    return new Response(null, { status: 404 });
  });
  return {
    url: `http://127.0.0.1:${server.addr.port}`,
    apiKey,
    requests,
    stop: () => server.shutdown(),
  };
}
