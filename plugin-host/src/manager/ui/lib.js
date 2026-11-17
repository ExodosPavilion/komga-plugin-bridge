// Helpers shared by the sections. Build DOM with h() (text is never parsed as HTML).

/** h("button", { onclick }, "Text", child...) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (name.startsWith("on")) el.addEventListener(name.slice(2), value);
    else if (value !== false && value != null) el.setAttribute(name, value === true ? "" : value);
  }
  return fill(el, ...children);
}

/**
 * Replaces el's children, as replaceChildren() does, but with h()'s rules: arrays are flattened
 * and null or false are skipped. Plain replaceChildren() would render them as "null" or
 * "[object HTMLElement]". Sections always fill elements through this.
 */
export function fill(el, ...children) {
  el.replaceChildren(
    ...children.flat(Infinity)
      .filter((child) => child != null && child !== false)
      .map((child) => child instanceof Node ? child : String(child)),
  );
  return el;
}

/**
 * Calls the Plugin Host through the Bridge. `path` is relative to this page, for example
 * "api/plugins". Returns the parsed JSON (or null when there is none) and throws on an error status.
 * The X-Requested-With header is what the Bridge requires on anything that changes state.
 */
export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
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
  if (!response.ok) {
    throw new Error(json?.error ?? `${method} ${path} failed with status ${response.status}`);
  }
  return json;
}
