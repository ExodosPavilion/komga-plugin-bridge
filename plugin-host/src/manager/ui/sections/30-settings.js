// A settings form for each plugin, generated from the fields its manifest declares. Saving goes
// through POST /api/plugin-settings, which validates; its messages are shown as they come.
import { fill, h } from "../lib.js";
import { buildValues, errorMessages, secretHint } from "../settings-form.js";

// lib.js's api() keeps only `error`, and a failed save answers `errors`, so this reads the body itself.
async function call(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch { /* not JSON */ }
  return { ok: response.ok, json };
}

function control(field) {
  const id = `setting-${field.name}`;
  if (field.secret) {
    const text = h("input", {
      type: "password",
      id,
      name: field.name,
      autocomplete: "new-password",
      placeholder: field.isSet ? "••••••••" : null,
    });
    const clear = h("input", { type: "checkbox", name: `${field.name}-clear` });
    return {
      read: () => ({ text: text.value, clear: clear.checked }),
      nodes: [text, " ", h("span", { class: "muted" }, secretHint(field)), field.isSet ? h("label", {}, " ", clear, " clear") : null],
    };
  }
  if (field.type === "boolean") {
    const box = h("input", { type: "checkbox", id, name: field.name });
    box.checked = field.value === true;
    return { read: () => ({ checked: box.checked }), nodes: [box] };
  }
  const input = h("input", {
    type: "text",
    inputmode: field.type === "number" ? "decimal" : null,
    id,
    name: field.name,
    placeholder: field.default === undefined ? null : String(field.default),
  });
  input.value = field.value === undefined ? "" : String(field.value);
  return { read: () => ({ text: input.value }), nodes: [input] };
}

function pluginForm(plugin) {
  const holder = h("div");
  const message = h("p", { role: "status" });

  function show(lines, good) {
    message.className = good ? "ok" : "error";
    fill(message, ...lines.map((line) => h("div", {}, line)));
  }

  async function load() {
    const { ok, json } = await call(`api/plugin-settings?plugin=${encodeURIComponent(plugin.id)}`);
    if (!ok) return fill(holder, h("p", { class: "error" }, errorMessages(json).join(" ")));
    const fields = json.fields;
    if (fields.length === 0) return fill(holder, h("p", { class: "muted" }, "This plugin has no settings."));
    const controls = new Map(fields.map((f) => [f.name, control(f)]));
    fill(holder, h(
      "form",
      { "data-plugin": plugin.id, onsubmit: (event) => save(event, fields, controls) },
      fields.map((f) =>
        h(
          "div",
          { class: "field" },
          h("label", { for: `setting-${f.name}` }, f.name),
          " ",
          controls.get(f.name).nodes,
          f.help ? h("div", { class: "muted" }, f.help) : null,
        )
      ),
      h("button", { type: "submit" }, "Save settings"),
    ));
  }

  async function save(event, fields, controls) {
    event.preventDefault();
    const inputs = Object.fromEntries([...controls].map(([name, c]) => [name, c.read()]));
    const { values, errors } = buildValues(fields, inputs);
    if (errors.length > 0) return show(errors, false);
    if (Object.keys(values).length === 0) return show(["Nothing has changed."], true);
    const { ok, json } = await call("api/plugin-settings", { plugin: plugin.id, values });
    if (!ok) return show(errorMessages(json), false);
    await load();
    show(["Saved."], true);
  }

  load();
  return h("details", {}, h("summary", {}, `${plugin.id} ${plugin.version}`), holder, message);
}

export async function render(element) {
  const { json: plugins } = await call("api/plugins");
  fill(element, 
    !plugins || plugins.length === 0
      ? h("p", { class: "muted" }, "No plugins are installed.")
      : plugins.map((p) => pluginForm(p)),
  );
}

export default { title: "Plugin settings", render };
