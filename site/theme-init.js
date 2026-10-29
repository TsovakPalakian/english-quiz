// Run before styles and body parsing; the site's CSP allows same-origin scripts.
(() => {
  const root = document.documentElement;
  root.setAttribute("data-theme", "almond");
  try {
    const size = localStorage.getItem("enquiz-display-size") || "comfortable";
    root.setAttribute("data-display-size", ["small", "compact", "comfortable", "large", "extra-large"].includes(size) ? size : "comfortable");
    if (localStorage.getItem("enquiz-high-visibility") === "1") root.setAttribute("data-high-visibility", "1");
  } catch (e) {}
  try {
    const explicitTheme = localStorage.getItem("enquiz-theme");
    const savedTheme = explicitTheme && explicitTheme !== "auto" ? explicitTheme : "almond";
    if (savedTheme.indexOf("user-") === 0) {
      const list = JSON.parse(localStorage.getItem("enquiz-custom-themes") || "[]");
      const theme = Array.isArray(list) ? list.find((row) => row && row.id === savedTheme && row.vars) : null;
      if (!theme) return;
      root.setAttribute("data-theme", "user");
      root.setAttribute("data-painted-theme", savedTheme);
      const keys = ["--bg", "--card", "--ink", "--mute", "--line", "--acc", "--acc-s", "--ok", "--ok-s", "--bad", "--bad-s", "--on-acc", "--photo-wash"];
      for (const key of keys) {
        const value = theme.vars[key];
        if (typeof value === "string" && (key === "--photo-wash" ? /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i : /^#[0-9a-f]{6}$/i).test(value)) root.style.setProperty(key, value);
      }
      if (["light", "dark"].includes(theme.vars["color-scheme"])) root.style.setProperty("color-scheme", theme.vars["color-scheme"]);
      let picture = null;
      try { picture = JSON.parse(localStorage.getItem("enquiz-theme-picture") || "null"); } catch (e) {}
      let photo = "";
      const stamp = typeof theme.photo === "string" && theme.photo.startsWith("stage-local/themes/") ? theme.photo.slice(theme.photo.lastIndexOf("/") + 1) : "";
      if (theme.photo && picture && picture.id === theme.id && picture.stamp === stamp && typeof picture.url === "string" && picture.url.startsWith("data:image/")) photo = picture.url;
      else if (typeof theme.photo === "string" && theme.photo.startsWith("data:image/")) photo = theme.photo;
      else if (typeof theme.photo === "string" && theme.photo.startsWith("stage-local/themes/")) photo = "/api/theme-photo?id=" + encodeURIComponent(theme.id) + "&v=" + theme.photo.slice(theme.photo.lastIndexOf("/") + 1);
      if (photo) root.style.setProperty("--theme-photo", "url(" + JSON.stringify(photo) + ")");
      if (theme.name) window.__themeLabel = theme.name;
    } else {
      root.setAttribute("data-theme", savedTheme);
      if (explicitTheme) root.setAttribute("data-painted-theme", savedTheme);
    }
  } catch (e) {}
  if (typeof document !== "undefined") {
    const updateThemeCycle = () => {
      try {
        const label = window.__themeLabel;
        const button = document.getElementById("themeCycle");
        if (label && button) {
          const parts = String(label).split(/\s+(?:\u2014|\u2013|-)\s+/);
          const title = button.querySelector(".theme-title");
          const sub = button.querySelector(".theme-sub");
          if (title) title.textContent = parts[0] || label;
          if (sub) sub.textContent = parts.length > 1 ? parts[1] : "";
        }
      } catch (e) {}
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updateThemeCycle);
    } else {
      updateThemeCycle();
    }
  }
})();
