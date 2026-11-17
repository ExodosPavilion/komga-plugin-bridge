/* Adds a "Plugin Manager" link to the settings navigation of Komga's two web UIs.
   Injected by pluginbridge.PluginManagerLinkFilter. Plain ASCII, no dependencies.
   Both UIs are single-page apps that draw their navigation after load, so a MutationObserver
   adds the link whenever the navigation appears (and again if the app redraws it).
   Only admins see the settings pages that contain the anchor items looked for below, so the link
   shows for admins only; the route itself refuses everyone else anyway. */
(function () {
  if (window.__pluginManagerLink) return;
  window.__pluginManagerLink = true;
  var MARK = "data-plugin-manager-link";
  // Last entry of the settings navigation: legacy UI, then the newer UI.
  var ANCHORS = ['a[href$="/settings/updates"]', 'a[href$="/server/updates"]'];
  var base = String(window.resourceBaseUrl || "/");
  if (base.charAt(base.length - 1) !== "/") base += "/";
  var HREF = base + "api/v1/plugin-manager/";

  function findAnchor() {
    for (var i = 0; i < ANCHORS.length; i++) {
      var found = document.querySelector(ANCHORS[i]);
      if (found) return found;
    }
    return null;
  }

  function add() {
    var anchor = findAnchor();
    var existing = document.querySelector("[" + MARK + "]");
    if (!anchor) return;
    if (existing && existing.previousElementSibling === anchor) return;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var link = anchor.cloneNode(true);
    link.setAttribute(MARK, "");
    link.setAttribute("href", HREF);
    link.removeAttribute("aria-current");
    link.removeAttribute("id");
    link.className = String(link.className)
      .split(/\s+/)
      .filter(function (c) {
        return c && c.indexOf("--active") < 0 && c.indexOf("router-link") < 0;
      })
      .join(" ");
    var title = link.querySelector(".v-list-item-title, .v-list-item__title");
    if (title) {
      title.textContent = "Plugin Manager";
    } else {
      link.textContent = "Plugin Manager";
    }
    var icon = link.querySelector(".v-icon");
    if (icon) {
      // Replace the cloned icon's glyph (a font class or ligature text) with a plain puzzle piece.
      icon.className = icon.className.replace(/\bmdi-[\w-]+/g, "mdi-puzzle");
      if (icon.firstChild && icon.firstChild.nodeType === 3) icon.firstChild.nodeValue = "mdi-puzzle";
    }
    anchor.parentNode.insertBefore(link, anchor.nextSibling);
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      try {
        add();
      } catch (e) {
        /* never break the page */
      }
    }, 100);
  }

  function start() {
    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
