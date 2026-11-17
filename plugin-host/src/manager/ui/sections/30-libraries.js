// Where each plugin acts (per-library enablement) and the warning when a metadata plugin and one
// of Komga's built-in importers are both on for the same library.
import { api, h } from "../lib.js";

async function save(element, plugin, body) {
  try {
    await api("api/plugin-libraries", { method: "POST", body: { plugin, ...body } });
  } catch (error) {
    alert(error.message);
  }
  await render(element);
}

function pluginRow(element, plugin, komgaLibraries) {
  const chosen = new Set(plugin.libraries);
  const boxes = komgaLibraries.map((library) => {
    const box = h("input", { type: "checkbox", "data-library": library.id, checked: plugin.all || chosen.has(library.id) });
    return h("label", {}, box, ` ${library.name} `);
  });
  const everywhere = h("button", { onclick: () => save(element, plugin.id, { all: true }) }, "All libraries");
  const apply = h("button", {
    onclick: () =>
      save(element, plugin.id, {
        libraries: boxes.map((l) => l.firstChild).filter((b) => b.checked).map((b) => b.getAttribute("data-library")),
      }),
  }, "Only the checked libraries");
  return h(
    "tr",
    { "data-plugin": plugin.id },
    h("td", {}, plugin.id),
    h("td", {}, plugin.all ? "all libraries" : plugin.libraries.length === 0 ? "none" : "selected libraries"),
    h("td", {}, boxes, everywhere, apply),
  );
}

export async function render(element) {
  const [state, clashes] = await Promise.all([api("api/plugin-libraries"), api("api/plugin-clashes")]);
  const warnings = clashes.clashes.map((c) =>
    h(
      "li",
      { class: "error", "data-clash": `${c.plugin}:${c.libraryId}` },
      `${c.plugin} and Komga's own importers (${c.importers.map((i) => i.name).join(", ")}) are both on for ` +
        `"${c.libraryName}". Which one wins is not controlled: switch one off, in Komga's library settings for the importers.`,
    )
  );
  element.replaceChildren(
    state.komgaLibraries === null
      ? h("p", { class: "muted" }, `Komga's libraries are not available: ${state.unavailable}`)
      : state.plugins.length === 0
      ? h("p", { class: "muted" }, "No plugins are installed.")
      : h(
        "table",
        {},
        h("thead", {}, h("tr", {}, ["Plugin", "Acts in", "Choose"].map((t) => h("th", {}, t)))),
        h("tbody", {}, state.plugins.map((p) => pluginRow(element, p, state.komgaLibraries))),
      ),
    warnings.length === 0 ? null : h("div", {}, h("h3", {}, "Warnings"), h("ul", {}, warnings)),
  );
}

export default { title: "Libraries", render };
