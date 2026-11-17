// The installed plugins: version, status, enabled state, enable / disable / remove, recent errors.
import { api, h } from "../lib.js";

function status(plugin) {
  if (plugin.autoDisabled) return "disabled automatically after repeated failures";
  if (!plugin.enabled) return "disabled";
  return plugin.running ? "running" : "stopped";
}

async function act(element, plugin, action, question) {
  if (question && !confirm(question)) return;
  try {
    await api(`api/plugins/${action}`, { method: "POST", body: { id: plugin.id } });
  } catch (error) {
    alert(error.message);
  }
  await render(element);
}

async function showErrors(cell, plugin) {
  const failures = await api(`api/failures?plugin=${encodeURIComponent(plugin.id)}`);
  cell.replaceChildren(
    failures.length === 0
      ? h("span", { class: "muted" }, "No errors recorded.")
      : failures.slice(0, 20).map((f) => h("pre", {}, `${f.at}  ${f.kind}: ${f.reason}`)),
  );
}

function row(element, plugin) {
  const errors = h("td", { colspan: 5 });
  const errorRow = h("tr", { hidden: true }, errors);
  const toggle = h("button", {
    onclick: () => act(element, plugin, plugin.enabled ? "disable" : "enable"),
  }, plugin.enabled ? "Disable" : "Enable");
  const remove = h("button", {
    onclick: () =>
      act(element, plugin, "remove", `Remove ${plugin.id}? Its files and settings are deleted. This cannot be undone.`),
  }, "Remove");
  const recent = h("button", {
    onclick: async () => {
      errorRow.hidden = !errorRow.hidden;
      if (!errorRow.hidden) await showErrors(errors, plugin);
    },
  }, plugin.consecutiveFailures > 0 ? `Recent errors (${plugin.consecutiveFailures} in a row)` : "Recent errors");
  return [
    h(
      "tr",
      { "data-plugin": plugin.id },
      h("td", {}, plugin.id),
      h("td", {}, plugin.version),
      h("td", {}, status(plugin)),
      h("td", {}, plugin.enabled ? "on" : "off"),
      h("td", {}, toggle, remove, recent),
    ),
    errorRow,
  ];
}

export async function render(element) {
  const [plugins, refused] = await Promise.all([api("api/plugins"), api("api/plugins/refused")]);
  element.replaceChildren(
    plugins.length === 0 ? h("p", { class: "muted" }, "No plugins are installed.") : h(
      "table",
      {},
      h("thead", {}, h("tr", {}, ["Plugin", "Version", "Status", "Enabled", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, plugins.flatMap((p) => row(element, p))),
    ),
    refused.length === 0 ? null : h(
      "div",
      {},
      h("h3", {}, "Refused at the last start"),
      h("ul", {}, refused.map((r) => h("li", {}, `${r.folder}: ${r.reason}`))),
    ),
  );
}

export default { title: "Plugins", render };
