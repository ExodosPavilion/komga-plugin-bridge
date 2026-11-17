import { jsonBody } from "../body.ts";
import { checkUpdates, GithubError, installRelease, listReleases } from "../../plugins/github.ts";
import type { Router } from "../router.ts";

/**
 * Install from a GitHub release, pinned, with an update check only on demand.
 *   GET  /api/github/releases?repo=<url>        -> [{tag, name, prerelease, publishedAt, archive}] newest first
 *   POST /api/plugins/install-github {repo, tag} -> as an upload; also how an update is installed
 *   GET  /api/plugins/updates                    -> [{id, repo, installed, newer: [release]}] for GitHub-installed plugins
 * Failures answer {error}: 400 bad address or archive, 404 unknown repository, 502 GitHub unreachable.
 */
export function register(router: Router) {
  const guard = async (run: () => Promise<Response>) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof GithubError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  };

  router.get("/api/github/releases", (req, ctx) =>
    guard(async () => {
      const repo = new URL(req.url).searchParams.get("repo") ?? "";
      return Response.json(await listReleases(ctx, repo));
    }));

  router.post("/api/plugins/install-github", (req, ctx) =>
    guard(async () => {
      const body = await jsonBody(req);
      if (typeof body?.repo !== "string" || typeof body?.tag !== "string") {
        return Response.json({ error: "Send the repository address and the release tag." }, { status: 400 });
      }
      const result = await installRelease(ctx, body.repo, body.tag);
      if (!result.ok) {
        console.error(`[plugin-host] refusing release ${body.tag} of ${body.repo}: ${result.reason}`);
        return Response.json({ error: result.reason }, { status: 400 });
      }
      const { ok: _ok, ...installed } = result;
      return Response.json(installed);
    }));

  router.get("/api/plugins/updates", (_req, ctx) => guard(async () => Response.json(await checkUpdates(ctx))));
}
