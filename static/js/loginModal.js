// =====================================================================
// loginModal.js - Modal de Login Universal MESA DOCK
// =====================================================================
// Se muestra automáticamente cuando no hay sesión activa.
// La autenticación la gestiona Auth (Supabase vía backend /login).

const LOGIN_MODAL_CONFIG = {
  AUTO_CHECK_INTERVAL: 30000,  // Verificar sesión cada 30s
  REDIRECT_DELAY: 1200,
  STYLES_LOADED: false
};

let loginModalState = {
  isOpen: false,
  checkInterval: null
};

// ------------------------------------------------------------------
// Estilos
// ------------------------------------------------------------------
function loadLoginModalStyles() {
  if (LOGIN_MODAL_CONFIG.STYLES_LOADED) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/static/css/loginModal.css';
  document.head.appendChild(link);
  LOGIN_MODAL_CONFIG.STYLES_LOADED = true;
}

// ------------------------------------------------------------------
// HTML del modal
// ------------------------------------------------------------------
function createLoginModalHTML() {
  return `
    <div id="loginModalOverlay" class="login-modal-overlay">
      <div class="login-modal-container">
        <div class="login-modal-header">
          <h2 data-original-text="Acceso Requerido">🔐 Acceso Requerido</h2>
          <p data-original-text="Debes iniciar sesión para continuar">Debes iniciar sesión para continuar</p>
        </div>

        <form class="login-modal-form" id="loginModalForm">
          <div class="login-modal-field">
            <label for="loginModalEmail" class="login-modal-label" data-original-text="Email">Email</label>
            <input type="email" id="loginModalEmail" name="email"
                   class="login-modal-input"
                   placeholder="usuario@empresa.com"
                   data-original-placeholder="usuario@empresa.com"
                   required autocomplete="email">
          </div>

          <div class="login-modal-field">
            <label for="loginModalPassword" class="login-modal-label" data-original-text="Contraseña">Contraseña</label>
            <input type="password" id="loginModalPassword" name="password"
                   class="login-modal-input"
                   placeholder="••••••••"
                   data-original-placeholder="••••••••"
                   required autocomplete="current-password">
          </div>

          <div id="loginModalMessage" class="login-modal-message"></div>

          <div class="login-modal-buttons">
            <button type="submit" class="login-modal-btn-primary" id="loginModalSubmit">
              <span class="login-modal-btn-text" data-original-text="Iniciar Sesión">Iniciar Sesión</span>
              <span class="login-modal-spinner" style="display: none;">⟳</span>
            </button>
          </div>
        </form>

        <div class="login-modal-footer">
          <small data-original-text="💡 Tip: Inicia sesión con tu cuenta corporativa MESA (Supabase)">
            💡 Tip: Inicia sesión con tu cuenta corporativa MESA (Supabase)
          </small>
        </div>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------------
// Verificación de sesión
// ------------------------------------------------------------------
function checkUserSession() {
  return !!(window.Auth && window.Auth.isAuthenticated());
}

// ------------------------------------------------------------------
// Mostrar / ocultar
// ------------------------------------------------------------------
function showLoginModal() {
  if (loginModalState.isOpen || checkUserSession()) return;

  loadLoginModalStyles();

  const holder = document.createElement('div');
  holder.innerHTML = createLoginModalHTML();
  document.body.appendChild(holder.firstElementChild);

  setupLoginModalEvents();

  if (window.GlobalHeader && window.GlobalHeader.translatePage) {
    window.GlobalHeader.translatePage();
  }

  setTimeout(() => {
    const overlay = document.getElementById('loginModalOverlay');
    if (overlay) overlay.classList.add('active');
    const input = document.getElementById('loginModalEmail');
    if (input) input.focus();
  }, 10);

  loginModalState.isOpen = true;
  console.log('🔐 Modal de login mostrado - Usuario no autenticado');
}

function hideLoginModal() {
  const overlay = document.getElementById('loginModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
  loginModalState.isOpen = false;
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
function setupLoginModalEvents() {
  const form = document.getElementById('loginModalForm');
  const emailInput = document.getElementById('loginModalEmail');
  const passwordInput = document.getElementById('loginModalPassword');

  form.addEventListener('submit', handleLoginSubmit);

  emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') passwordInput.focus();
  });
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') form.dispatchEvent(new Event('submit'));
  });

  [emailInput, passwordInput].forEach(input => {
    input.addEventListener('input', () => {
      clearLoginMessage();
      input.classList.remove('error');
    });
  });
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const t = (key) => (window.GlobalHeader && window.GlobalHeader.translate)
                     ? window.GlobalHeader.translate(key) : key;

  const email = document.getElementById('loginModalEmail').value.trim();
  const password = document.getElementById('loginModalPassword').value.trim();
  const submitBtn = document.getElementById('loginModalSubmit');
  const btnText = submitBtn.querySelector('.login-modal-btn-text');
  const spinner = submitBtn.querySelector('.login-modal-spinner');

  if (!email || !password) {
    showLoginMessage(t('Por favor, complete todos los campos.'), 'error');
    return;
  }

  submitBtn.disabled = true;
  btnText.style.display = 'none';
  spinner.style.display = 'inline';
  clearLoginMessage();

  try {
    const user = await Auth.login(email, password);
    if (user) {
      showLoginMessage(`${t('¡Bienvenido')}, ${user.nombre || email}!`, 'success');
      setTimeout(() => {
        hideLoginModal();
        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: user }));
        console.log('✅ Usuario autenticado:', user.email);
        window.location.reload();
      }, LOGIN_MODAL_CONFIG.REDIRECT_DELAY);
    }
  } catch (err) {
    console.error('Error en login:', err);
    showLoginMessage(err.message || t('Usuario o contraseña incorrectos.'), 'error');
    document.getElementById('loginModalEmail').classList.add('error');
    document.getElementById('loginModalPassword').classList.add('error');
  } finally {
    submitBtn.disabled = false;
    btnText.style.display = 'inline';
    spinner.style.display = 'none';
  }
}

// ------------------------------------------------------------------
// Mensajes
// ------------------------------------------------------------------
function showLoginMessage(message, type = 'info') {
  const div = document.getElementById('loginModalMessage');
  if (div) {
    div.textContent = message;
    div.className = `login-modal-message ${type}`;
    div.style.display = 'block';
  }
}

function clearLoginMessage() {
  const div = document.getElementById('loginModalMessage');
  if (div) {
    div.style.display = 'none';
    div.textContent = '';
    div.className = 'login-modal-message';
  }
}

// ------------------------------------------------------------------
// Verificación automática de sesión
// ------------------------------------------------------------------
function startSessionCheck() {
  if (loginModalState.checkInterval) clearInterval(loginModalState.checkInterval);

  if (!checkUserSession()) {
    setTimeout(showLoginModal, 400);
  }

  loginModalState.checkInterval = setInterval(() => {
    if (!checkUserSession() && !loginModalState.isOpen) {
      showLoginModal();
    }
  }, LOGIN_MODAL_CONFIG.AUTO_CHECK_INTERVAL);
}

function stopSessionCheck() {
  if (loginModalState.checkInterval) {
    clearInterval(loginModalState.checkInterval);
    loginModalState.checkInterval = null;
  }
}

function getCurrentUser() {
  return (window.Auth && window.Auth.getCurrentUser()) || null;
}

function logoutUser() {
  if (window.Auth) {
    Auth.logout().then(() => window.location.href = '/');
  }
}

// ------------------------------------------------------------------
// API pública
// ------------------------------------------------------------------
window.LoginModal = {
  show: showLoginModal,
  hide: hideLoginModal,
  checkUser: checkUserSession,
  getCurrentUser,
  logout: logoutUser,
  startAutoCheck: startSessionCheck,
  stopAutoCheck: stopSessionCheck,
  config: LOGIN_MODAL_CONFIG,
  get isOpen() { return loginModalState.isOpen; },
  get hasUser() { return checkUserSession(); }
};

// Auto-inicialización
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startSessionCheck();
    if (window.Auth) window.Auth.updateUserWidget();
  });
} else {
  startSessionCheck();
  if (window.Auth) window.Auth.updateUserWidget();
}

window.addEventListener('beforeunload', stopSessionCheck);

console.log('🔐 LoginModal cargado - Sistema de autenticación universal');
