// The Plugin Manager page. It is built from sections: every file in ./sections/ is a section,
// listed by the host in sections.json, in file name order. To add a feature, add a file there
// (name it with a number prefix to place it). A section is an ES module whose default export is
//
//   { title: "Plugins", async render(element) { ... } }
//
// `render` fills `element` and may call `render` again later to refresh itself. Use h() and api()
// from ../lib.js. A section that throws shows its error and does not stop the others.
import { h } from "./lib.js";

const root = document.getElementById("sections");

const sections = await fetch("sections.json", { credentials: "same-origin" }).then((r) => r.json());
for (const file of sections) {
  const body = h("div", {}, h("p", { class: "muted" }, "Loading..."));
  root.append(h("section", {}, body));
  try {
    const section = (await import(`./${file}`)).default;
    body.replaceChildren(h("h2", {}, section.title));
    const content = h("div");
    body.append(content);
    await section.render(content);
  } catch (error) {
    body.append(h("p", { class: "error" }, `This section failed to load: ${error.message}`));
  }
}
