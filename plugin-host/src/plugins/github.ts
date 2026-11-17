// Installing from a GitHub release. The Plugin Host (which can reach the network; plugins
// cannot) lists a repository's releases, downloads the packaged archive attached to the chosen one
// and hands the bytes to installFromArchive. Nothing is built from source. The installed release
// is recorded and stays pinned: releases are looked at only when an admin asks.
import { MAX_ARCHIVE_BYTES } from "./archive.ts";
import { installFromArchive, type InstallDeps, type InstallResult } from "./install.ts";

export interface Release {
  tag: string;
  name: string;
  prerelease: boolean;
  publishedAt: string;
  /** The packaged plugin attached to the release, if there is one. */
  archive: { name: string; url: string; size: number } | null;
}

export class GithubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type GithubDeps = InstallDeps;

const API = "https://api.github.com";

/** "https://github.com/owner/name" (also ".git", a trailing slash or "owner/name") to "owner/name". */
export function parseRepo(input: string): string {
  const match = input.trim().match(
    /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/,
  );
  if (!match) throw new GithubError("Enter the address of a GitHub repository, such as https://github.com/owner/name.", 400);
  return `${match[1]}/${match[2]}`;
}

async function fetchOrFail(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new GithubError(`Could not reach GitHub: ${(error as Error).message}`, 502);
  }
}

export async function listReleases(deps: GithubDeps, repoInput: string): Promise<Release[]> {
  const repo = parseRepo(repoInput);
  const base = deps.config.githubApiUrl ?? API;
  const response = await fetchOrFail(`${base}/repos/${repo}/releases?per_page=50`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "komga-plugin-bridge" },
  });
  if (!response.ok) await response.body?.cancel();
  if (response.status === 404) throw new GithubError(`GitHub has no repository ${repo}, or it has no public releases.`, 404);
  if (!response.ok) throw new GithubError(`GitHub answered ${response.status} when listing the releases of ${repo}.`, 502);
  const list = await response.json() as Record<string, unknown>[];
  return list.filter((r) => r.draft !== true).map((r) => {
    const assets = (r.assets as Record<string, unknown>[] | undefined) ?? [];
    const zip = assets.find((a) => String(a.name).toLowerCase().endsWith(".zip"));
    return {
      tag: String(r.tag_name),
      name: String(r.name || r.tag_name),
      prerelease: r.prerelease === true,
      publishedAt: String(r.published_at ?? ""),
      archive: zip
        ? { name: String(zip.name), url: String(zip.browser_download_url), size: Number(zip.size ?? 0) }
        : null,
    };
  });
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetchOrFail(url);
  if (!response.ok) await response.body?.cancel();
  if (!response.ok) throw new GithubError(`Downloading the plugin archive failed with status ${response.status}.`, 502);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.length;
    if (total > MAX_ARCHIVE_BYTES) throw new GithubError("The release's archive is too large to be a plugin.", 400);
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/** Installs (or updates to) the chosen release and pins it. Approval rules are installFromArchive's. */
export async function installRelease(deps: GithubDeps, repoInput: string, tag: string): Promise<InstallResult> {
  const release = (await listReleases(deps, repoInput)).find((r) => r.tag === tag);
  if (!release) return { ok: false, reason: `The repository has no release tagged "${tag}".` };
  if (!release.archive) {
    return {
      ok: false,
      reason:
        `Release ${tag} has no plugin archive (.zip) attached. Plugins are installed from the packaged archive, never built from source.`,
    };
  }
  const result = await installFromArchive(deps, await download(release.archive.url));
  if (result.ok) {
    deps.db.prepare(
      `INSERT INTO plugin_sources (plugin_id, repo, tag, published_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(plugin_id) DO UPDATE SET repo = excluded.repo, tag = excluded.tag, published_at = excluded.published_at`,
    ).run(result.id, `https://github.com/${parseRepo(repoInput)}`, release.tag, release.publishedAt);
  }
  return result;
}

export interface UpdateReport {
  id: string;
  repo: string;
  installed: string;
  newer: Release[];
}

/** On demand: for each GitHub-installed plugin, the stable releases published after the pinned one. */
export async function checkUpdates(deps: GithubDeps): Promise<UpdateReport[]> {
  const sources = deps.db.prepare("SELECT plugin_id, repo, tag, published_at FROM plugin_sources ORDER BY plugin_id")
    .all();
  const reports: UpdateReport[] = [];
  for (const row of sources) {
    const repo = String(row.repo);
    const publishedAt = String(row.published_at);
    let newer: Release[] = [];
    try {
      newer = (await listReleases(deps, repo)).filter((r) => !r.prerelease && r.publishedAt > publishedAt);
    } catch (error) {
      console.error(`[plugin-host] update check for ${row.plugin_id} failed: ${(error as Error).message}`);
    }
    reports.push({ id: String(row.plugin_id), repo, installed: String(row.tag), newer });
  }
  return reports;
}
