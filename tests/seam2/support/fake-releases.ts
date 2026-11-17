// Stand-in for GitHub's release API and download host, for tests of installing from a release.
// It speaks the two things the Plugin Host uses: GET /repos/{owner}/{repo}/releases and the asset
// download URLs those releases point to. It records every request, so a test can show that
// nothing was fetched unless an admin asked. Real GitHub is never contacted.
export interface FakeAsset {
  name: string;
  bytes: Uint8Array;
}

export interface FakeRelease {
  tag: string;
  name?: string;
  prerelease?: boolean;
  draft?: boolean;
  publishedAt: string;
  assets: FakeAsset[];
}

export interface FakeReleases {
  url: string;
  /** Every path requested, in order. */
  requests: string[];
  /** Publishes a release on a repository ("owner/name"). */
  publish(repo: string, release: FakeRelease): void;
  stop(): Promise<void>;
}

export function startFakeReleases(initial: Record<string, FakeRelease[]> = {}): FakeReleases {
  const repos = new Map<string, FakeRelease[]>(Object.entries(initial));
  const requests: string[] = [];
  let origin = "";
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, (req) => {
    const url = new URL(req.url);
    requests.push(url.pathname);
    const list = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/releases$/);
    if (list) {
      const releases = repos.get(list[1]);
      if (!releases) return Response.json({ message: "Not Found" }, { status: 404 });
      // GitHub answers newest first.
      const sorted = [...releases].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      return Response.json(sorted.map((r) => ({
        tag_name: r.tag,
        name: r.name ?? r.tag,
        prerelease: r.prerelease ?? false,
        draft: r.draft ?? false,
        published_at: r.publishedAt,
        assets: r.assets.map((a) => ({
          name: a.name,
          size: a.bytes.length,
          browser_download_url: `${origin}/download/${list[1]}/${r.tag}/${a.name}`,
        })),
      })));
    }
    const download = url.pathname.match(/^\/download\/([^/]+\/[^/]+)\/([^/]+)\/([^/]+)$/);
    if (download) {
      const asset = repos.get(download[1])?.find((r) => r.tag === download[2])?.assets
        .find((a) => a.name === download[3]);
      if (asset) return new Response(asset.bytes as BodyInit, { headers: { "Content-Type": "application/zip" } });
    }
    return new Response(null, { status: 404 });
  });
  origin = `http://127.0.0.1:${server.addr.port}`;
  return {
    url: origin,
    requests,
    publish(repo, release) {
      repos.set(repo, [...(repos.get(repo) ?? []), release]);
    },
    stop: () => server.shutdown(),
  };
}
