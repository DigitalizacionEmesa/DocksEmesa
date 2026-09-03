// =====================================================================
// auth.js - Sistema de autenticación EMESA DOCK (Supabase vía backend)
// =====================================================================
// El login se delega en el endpoint /login de Flask, que a su vez usa
// Supabase Auth (sign_in_with_password). La sesión del navegador se
// guarda en localStorage bajo la clave 'dockEmesaUser' (patrón de la
// plantilla, que usaba 'usuarioSGA').

const STORAGE_KEY = 'dockEmesaUser';

const Auth = (function () {
  'use strict';

  // --- Gestión de sesión local ---
  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const user = JSON.parse(raw);
      return (user && user.id) ? user : null;
    } catch (e) {
      console.error('❌ Error al leer sesión:', e);
      return null;
    }
  }

  function setCurrentUser(user) {
    if (user && user.id) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function clearCurrentUser() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isAuthenticated() {
    return !!getCurrentUser();
  }

  // --- Login con Supabase (a través del backend) ---
  async function login(email, password) {
    const data = await SupabaseApp.api('/login', {
      method: 'POST',
      body: { email, password }
    });

    if (!data.ok || !data.user) {
      throw new Error(data.error || 'Usuario o contraseña incorrectos.');
    }

    setCurrentUser(data.user);

    // Avisar a la interfaz
    window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: data.user }));
    return data.user;
  }

  // --- Logout ---
  async function logout() {
    try {
      await SupabaseApp.api('/logout', { method: 'POST' });
    } catch (e) {
      console.warn('⚠️ Error en logout del backend:', e);
    }
    clearCurrentUser();
    window.dispatchEvent(new CustomEvent('userLoggedOut'));
  }

  // --- Widget de usuario en el header ---
  function updateUserWidget() {
    const container = document.getElementById('loginWidgetContainer');
    if (!container) return;

    const user = getCurrentUser();

    if (user) {
      const nombre = user.nombre || user.email || 'Usuario';
      container.innerHTML = `
        <div class="user-info">
          <span class="user-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" style="vertical-align:middle;">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" fill="#fff"/>
            </svg>
          </span>
          <span class="user-name">${nombre}</span>
          <button class="logout-btn" onclick="Auth.logout().then(() => window.location.href='/')" title="Cerrar Sesión">
            Salir
          </button>
        </div>
      `;
      container.style.display = 'flex';
    } else {
      container.innerHTML = '';
      container.style.display = 'none';
    }
  }

  // --- Inicialización ---
  function init() {
    updateUserWidget();
    window.addEventListener('userLoggedIn', updateUserWidget);
    window.addEventListener('userLoggedOut', updateUserWidget);
  }

  // API pública
  return {
    login,
    logout,
    getCurrentUser,
    setCurrentUser,
    clearCurrentUser,
    isAuthenticated,
    updateUserWidget,
    init
  };
})();

window.Auth = Auth;

// Auto-inicializar el widget cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Auth.init());
} else {
  Auth.init();
}

console.log('🔐 Auth cargado - Autenticación EMESA DOCK (Supabase)');
