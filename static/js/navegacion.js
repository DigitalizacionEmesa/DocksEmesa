// =====================================================================
// navegacion.js - Utilidades de navegación MESA DOCK
// =====================================================================

/**
 * Navega hacia atrás en el historial. Si no hay historial, redirige
 * a una URL "casa" (por defecto el dashboard).
 * @param {string} homeUrl - URL a la que redirigir si no hay historial.
 */
function goBackOrHome(homeUrl) {
  const fallbackHome = homeUrl || '/dashboard';

  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = fallbackHome;
  }
}

// Exponer también como módulo global
window.Navegacion = {
  goBackOrHome
};
