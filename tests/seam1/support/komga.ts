// Drives Komga the way a user or client would: only through its address.
export const KOMGA_URL = Deno.env.get("KOMGA_URL") ?? "http://localhost:25600";
export const ADMIN = { email: "admin@example.org", password: "seam1-password" };
const basic = "Basic " + btoa(`${ADMIN.email}:${ADMIN.password}`);

export async function waitFor<T>(
  what: string,
  attempt: () => Promise<T | undefined | false>,
  seconds = 180,
): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await attempt();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timed out waiting for ${what}${lastError ? `: ${lastError}` : ""}`);
}

/** A request to Komga as the admin, with JSON in and out. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", basic);
  return await fetch(`${KOMGA_URL}${path}`, { ...init, headers });
}

export async function startedAndClaimed(): Promise<void> {
  await waitFor("Komga to start", async () => {
    const response = await fetch(`${KOMGA_URL}/api/v1/claim`);
    const claimed = response.ok && (await response.json()).isClaimed;
    if (!response.ok) return false;
    if (!claimed) {
      const claim = await fetch(`${KOMGA_URL}/api/v1/claim`, {
        method: "POST",
        headers: { "X-Komga-Email": ADMIN.email, "X-Komga-Password": ADMIN.password },
      });
      await claim.body?.cancel();
    }
    return true;
  });
}

export async function createLibrary(name: string, root: string): Promise<string> {
  const response = await api("/api/v1/libraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, root }),
  });
  if (!response.ok) throw new Error(`creating library failed: ${response.status} ${await response.text()}`);
  return (await response.json()).id;
}

export async function seriesNamed(name: string) {
  const response = await api("/api/v1/series?size=100");
  const page = await response.json();
  return page.content?.find((s: { name: string }) => s.name === name);
}
