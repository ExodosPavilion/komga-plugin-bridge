// Install a plugin by uploading its archive, and approve the capabilities a plugin declares
// before it can be enabled (plugins installed by dropping a folder wait here too).
import { api, h } from "../lib.js";

const MEANING = {
  "network": "Reach the network (any address).",
  "komga:read": "Read Komga's data (libraries, series, books).",
  "komga:write": "Change Komga's data (series and book metadata).",
};

function describe(capability) {
  if (MEANING[capability]) return MEANING[capability];
  if (capability === "file-read:*") return "Read the files in every library folder.";
  if (capability.startsWith("file-read:")) return `Read the files under ${capability.slice("file-read:".length)}.`;
  if (capability.startsWith("file-write:")) return "Write files (not supported yet: this is never granted).";
  return "Unknown capability (it grants nothing).";
}

async function upload(file) {
  const response = await fetch("api/plugins/install", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/zip" },
    body: file,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error ?? `The upload failed with status ${response.status}.`);
  return json;
}

function waiting(element, plugin) {
  const act = async (action) => {
    try {
      await api(`api/plugins/${action}`, { method: "POST", body: { id: plugin.id } });
    } catch (error) {
      alert(error.message);
    }
    location.reload();
  };
  return h(
    "div",
    { class: "pending", "data-plugin": plugin.id },
    h("h3", {}, `${plugin.id} asks for these capabilities`),
    h("ul", {}, plugin.declared.map((c) =>
      h("li", {}, h("code", {}, c), ` ${describe(c)}`, plugin.pending.includes(c) ? "" : " (approved)")
    )),
    h("p", { class: "muted" }, "It stays disabled until you approve them."),
    h("button", { onclick: () => act("approve") }, "Approve"),
    h("button", {
      onclick: async () => {
        await api("api/plugins/approve", { method: "POST", body: { id: plugin.id } }).catch((e) => alert(e.message));
        await act("enable");
      },
    }, "Approve and enable"),
  );
}

export async function render(element) {
  const message = h("p", {});
  const input = h("input", { type: "file", accept: ".zip,application/zip" });
  const button = h("button", {
    onclick: async () => {
      const file = input.files[0];
      if (!file) {
        message.textContent = "Choose a plugin archive (.zip) first.";
        return;
      }
      button.disabled = true;
      message.className = "muted";
      message.textContent = "Installing...";
      try {
        const installed = await upload(file);
        message.textContent = `Installed ${installed.id} ${installed.version}.`;
        message.textContent += installed.pending.length > 0
          ? " It is disabled until you approve its capabilities."
          : "";
        setTimeout(() => location.reload(), 1500); // the other sections show the new plugin
      } catch (error) {
        message.className = "error";
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    },
  }, "Install");

  const capabilities = await api("api/plugin-capabilities");
  const needApproval = capabilities.filter((p) => p.pending.length > 0);
  element.replaceChildren(
    h("h3", {}, "Install from a file"),
    h("p", { class: "muted" }, "Upload a plugin archive (.zip). A plugin that declares capabilities waits for your approval before it can run."),
    h("div", {}, input, button),
    message,
    needApproval.length === 0 ? null : h("h3", {}, "Waiting for approval"),
    needApproval.map((p) => waiting(element, p)),
  );
}

export default { title: "Install a plugin", render };
