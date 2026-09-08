// =====================================================================
// registro.js - Aceptación de invitaciones de EMESA DOCK
// =====================================================================
// La cuenta ya ha sido preautorizada por un administrador. Esta página recibe
// la sesión temporal de la invitación de Supabase, permite elegir contraseña y
// completa el perfil sin aceptar roles ni proveedor desde el navegador.

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function (k) { return window.GlobalHeader.translate(k); }
    : function (k) { return k; };
  var clienteAuth = null;

  function mostrarMensaje(texto, tipo) {
    var m = document.getElementById('registroMessage');
    m.textContent = texto;
    m.className = 'login-message ' + (tipo || 'error');
    m.style.display = 'block';
  }

  function limpiarMensaje() {
    var m = document.getElementById('registroMessage');
    m.style.display = 'none';
    m.textContent = '';
    m.className = 'login-message';
  }

  function ocultarCamposAdministrativos() {
    ['f_rol_id', 'f_departamento_id', 'f_proveedor_id'].forEach(function (id) {
      var campo = document.getElementById(id);
      if (campo && campo.closest('.reg-field')) campo.closest('.reg-field').style.display = 'none';
    });
    var plantas = document.getElementById('plantasBox');
    if (plantas && plantas.closest('.reg-field')) plantas.closest('.reg-field').style.display = 'none';
  }

  async function obtenerSesionInvitacion() {
    clienteAuth = await SupabaseApp.getClient();
    if (!clienteAuth) {
      throw new Error(t('La aceptación de invitaciones no está configurada. Contacta con un administrador.'));
    }
    var respuesta = await clienteAuth.auth.getSession();
    var sesion = respuesta.data && respuesta.data.session;
    if (!sesion || !sesion.user || !sesion.user.email) {
      throw new Error(t('Abre el enlace de invitación recibido por email para crear tu cuenta.'));
    }
    var email = document.getElementById('f_email');
    email.value = sesion.user.email;
    email.readOnly = true;
    return sesion;
  }

  async function registrar(e) {
    e.preventDefault();
    limpiarMensaje();
    var btn = document.getElementById('registroBtn');
    var texto = btn.querySelector('.login-btn-text');
    var spinner = btn.querySelector('.login-spinner');
    var nombre = document.getElementById('f_nombre').value.trim();
    var password = document.getElementById('f_password').value;

    if (!nombre || !password) {
      mostrarMensaje(t('Por favor, complete nombre y contraseña.'));
      return;
    }
    if (password.length < 8) {
      mostrarMensaje(t('La contraseña debe tener al menos 8 caracteres.'));
      return;
    }

    btn.disabled = true;
    texto.style.display = 'none';
    spinner.style.display = 'inline';
    try {
      var sesion = await obtenerSesionInvitacion();
      var cambio = await clienteAuth.auth.updateUser({ password: password });
      if (cambio.error) throw cambio.error;
      await SupabaseApp.api('/api/registro/aceptar', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + sesion.access_token },
        body: {
          nombre: nombre,
          apellidos: document.getElementById('f_apellidos').value.trim()
        }
      });
      mostrarMensaje(t('Cuenta creada. Ya puedes iniciar sesión.'), 'success');
      setTimeout(function () { window.location.href = '/?registrado=1'; }, 1000);
    } catch (err) {
      mostrarMensaje((err && err.message) || t('No se pudo completar el registro.'));
    } finally {
      btn.disabled = false;
      texto.style.display = 'inline';
      spinner.style.display = 'none';
    }
  }

  function initLenguaje() {
    var guardado = localStorage.getItem('appLanguage') || 'es';
    document.querySelectorAll('.flag-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.lang === guardado);
      b.addEventListener('click', function () {
        localStorage.setItem('appLanguage', b.dataset.lang);
        document.querySelectorAll('.flag-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        if (window.GlobalHeader && window.GlobalHeader.changeLanguage) window.GlobalHeader.changeLanguage(b.dataset.lang);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initLenguaje();
    ocultarCamposAdministrativos();
    document.getElementById('registroForm').addEventListener('submit', registrar);
    try {
      await obtenerSesionInvitacion();
    } catch (err) {
      mostrarMensaje(err.message || t('No se ha podido validar la invitación.'));
      document.getElementById('registroBtn').disabled = true;
    }
  });
})();
