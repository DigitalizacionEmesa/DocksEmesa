// Sidebar corporativo: activa el enlace correspondiente a la ruta actual.
(function () {
  "use strict";
  function syncActive() {
    var path = window.location.pathname.replace(/\/$/, "") || "/dashboard";
    document.querySelectorAll("[data-sidebar-route]").forEach(function (item) {
      var active = item.getAttribute("data-sidebar-route") === path;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncActive);
  else syncActive();
})();
