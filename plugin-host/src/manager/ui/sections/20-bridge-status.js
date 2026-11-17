// Whether the Bridge is active, and if not, why.
import { api, h } from "../lib.js";

export default {
  title: "Bridge",
  async render(element) {
    const s = await api("api/bridge/status");
    const version = s.komgaVersion ? ` (Komga ${s.komgaVersion})` : "";
    element.replaceChildren(
      !s.reported
        ? h("p", { class: "muted" }, "The Bridge has not reported to the Plugin Host since it started.")
        : s.active
        ? h("p", { class: "ok" }, `Active${version}. Last reported ${s.at}.`)
        : h("p", { class: "error" }, `Inactive${version}: ${s.reason ?? "no reason given"}. Komga runs as stock Komga.`),
    );
  },
};
