// A TCP proxy between Komga and the Plugin Host, so seam 1 can stage an outage without touching
// Docker from inside a test. Komga's Bridge talks to this proxy; the proxy talks to the real host.
//   POST :8081/mode/pass       forward traffic
//   POST :8081/mode/down       refuse connections, as if the Plugin Host were stopped
//   POST :8081/mode/blackhole  accept connections and never answer, as if the host were wedged
const TARGET = {
  hostname: Deno.env.get("TARGET_HOST") ?? "plugin-host",
  port: Number(Deno.env.get("TARGET_PORT") ?? 8080),
};
const LISTEN_PORT = 8080;
const CONTROL_PORT = 8081;

type Mode = "pass" | "down" | "blackhole";
let mode: Mode = "pass";
let listener: Deno.Listener | undefined;
const open = new Set<Deno.Conn>();

function closeAll() {
  for (const conn of open) {
    try {
      conn.close();
    } catch { /* already closed */ }
  }
  open.clear();
}

async function handle(conn: Deno.Conn) {
  open.add(conn);
  if (mode === "blackhole") return; // hold the connection, say nothing
  try {
    const upstream = await Deno.connect(TARGET);
    open.add(upstream);
    await Promise.race([
      conn.readable.pipeTo(upstream.writable),
      upstream.readable.pipeTo(conn.writable),
    ]);
  } catch { /* either side went away */ } finally {
    for (const c of [conn]) {
      try {
        c.close();
      } catch { /* already closed */ }
    }
    open.delete(conn);
  }
}

async function accept(l: Deno.Listener) {
  try {
    for await (const conn of l) handle(conn);
  } catch { /* listener closed */ }
}

function setMode(next: Mode) {
  mode = next;
  closeAll();
  if (next === "down") {
    listener?.close();
    listener = undefined;
  } else if (!listener) {
    listener = Deno.listen({ port: LISTEN_PORT });
    accept(listener);
  }
}

setMode("pass");
Deno.serve({ port: CONTROL_PORT }, (req) => {
  const next = new URL(req.url).pathname.replace("/mode/", "");
  if (req.method !== "POST" || !["pass", "down", "blackhole"].includes(next)) {
    return new Response(null, { status: 400 });
  }
  setMode(next as Mode);
  return new Response(next);
});
