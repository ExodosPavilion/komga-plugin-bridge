// Install a plugin from a GitHub release, and check for updates on demand. The version you choose
// is pinned: nothing is looked up unless you press a button. An update that asks for new
// capabilities lands in "Install a plugin > Waiting for approval", disabled until you approve it.
import { api, fill, h } from "../lib.js";

const result = (message, isError) => h("p", { class: isError ? "error" : "muted" }, message);

async function install(repo, tag, status) {
  fill(status, result(`Installing ${tag}...`));
  try {
    const installed = await api("api/plugins/install-github", { method: "POST", body: { repo, tag } });
    fill(status, result(
      `Installed ${installed.id} ${installed.version}.` +
        (installed.pending.length > 0 ? ` It is disabled until you approve: ${installed.pending.join(", ")}.` : ""),
    ));
    setTimeout(() => location.reload(), 2000);
  } catch (error) {
    fill(status, result(error.message, true));
  }
}

function releaseList(repo, releases, status) {
  if (releases.length === 0) return h("p", { class: "muted" }, "This repository has no releases.");
  return h(
    "table",
    {},
    h("tr", {}, h("th", {}, "Release"), h("th", {}, "Published"), h("th", {}, "")),
    releases.map((release) =>
      h(
        "tr",
        { "data-tag": release.tag },
        h("td", {}, release.name === release.tag ? release.tag : `${release.name} (${release.tag})`, release.prerelease ? " pre-release" : ""),
        h("td", {}, release.publishedAt.slice(0, 10)),
        h(
          "td",
          {},
          release.archive
            ? h("button", { onclick: () => install(repo, release.tag, status) }, "Install this version")
            : h("span", { class: "muted" }, "no plugin archive attached"),
        ),
      )
    ),
  );
}

export async function render(element) {
  const status = h("div", {});
  const releases = h("div", {});
  const input = h("input", { type: "text", size: 48, placeholder: "https://github.com/owner/plugin-repository" });
  const list = h("button", {
    onclick: async () => {
      fill(releases);
      fill(status);
      try {
        const found = await api(`api/github/releases?repo=${encodeURIComponent(input.value)}`);
        fill(releases, releaseList(input.value, found, status));
      } catch (error) {
        fill(status, result(error.message, true));
      }
    },
  }, "Show releases");

  const updates = h("div", {});
  const check = h("button", {
    onclick: async () => {
      check.disabled = true;
      fill(updates, result("Checking...", false));
      try {
        const reports = await api("api/plugins/updates");
        fill(updates, 
          reports.length === 0 ? h("p", { class: "muted" }, "No plugin was installed from GitHub.") : reports.map((report) =>
            h(
              "div",
              { "data-plugin": report.id },
              h("h4", {}, `${report.id} (pinned to ${report.installed})`),
              report.newer.length === 0
                ? h("p", { class: "muted" }, "Up to date.")
                : h("ul", {}, report.newer.map((release) =>
                  h(
                    "li",
                    {},
                    `${release.tag} `,
                    release.archive
                      ? h("button", { onclick: () => install(report.repo, release.tag, updates) }, "Update to this version")
                      : h("span", { class: "muted" }, "no plugin archive attached"),
                  )
                )),
            )
          ),
        );
      } catch (error) {
        fill(updates, result(error.message, true));
      } finally {
        check.disabled = false;
      }
    },
  }, "Check for updates");

  fill(element, 
    h("p", { class: "muted" }, "Paste a repository address, pick a release, and the packaged plugin attached to it is installed, pinned to that version."),
    h("div", {}, input, list),
    releases,
    status,
    h("h3", {}, "Updates"),
    h("p", { class: "muted" }, "Updates are only checked when you ask. An update that asks for new capabilities stays disabled until you approve them."),
    check,
    updates,
  );
}

export default { title: "Install from GitHub", render };
