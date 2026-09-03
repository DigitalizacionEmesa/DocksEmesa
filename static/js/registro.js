// =====================================================================
// registro.js - Registro de usuario EMESA DOCK
// =====================================================================
// Pantalla publica para que un usuario se registre por primera vez.
// Reutiliza los mismos campos del formulario de creacion de usuario de
// configuracion (email, password, nombre, apellidos, rol, departamento,
// proveedor, plantas asignadas) y llama a POST /api/usuarios.

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function (k) { return window.GlobalHeader.translate(k); }
    : function (k) { return k; };

  var roles = [], departamentos = [], proveedores = [], plantas = [];

  function esc(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

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

  async function cargarMaestros() {
    try {
      var res = await Promise.all([
        SupabaseApp.api('/api/crud/roles?limit=50'),
        SupabaseApp.api('/api/crud/departamentos?limit=200'),
        SupabaseApp.api('/api/crud/proveedores?limit=200'),
        SupabaseApp.api('/api/crud/plantas?limit=500')
      ]);
      roles = res[0].datos || [];
      departamentos = res[1].datos || [];
      proveedores = res[2].datos || [];
      plantas = res[3].datos || [];
    } catch (e) {
      roles = []; departamentos = []; proveedores = []; plantas = [];
      console.error('Error cargando maestros:', e);
    }
  }

  function poblarSelects() {
    var rol = document.getElementById('f_rol_id');
    rol.innerHTML = '<option value="">\u2014 ' + t('Selecciona un rol') + ' \u2014</option>'
      + roles.map(function (r) { return '<option value="' + r.id + '">' + esc(r.nombre) + '</option>'; }).join('');
    if (!roles.length) rol.innerHTML = '<option value="">' + t('No hay roles definidos') + '</option>';

    document.getElementById('f_departamento_id').innerHTML =
      '<option value="">\u2014</option>'
      + departamentos.map(function (d) { return '<option value="' + d.id + '">' + esc(d.nombre) + '</option>'; }).join('');

    document.getElementById('f_proveedor_id').innerHTML =
      '<option value="">\u2014</option>'
      + proveedores.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nombre) + '</option>'; }).join('');

    // El proveedor solo se rellena para el rol externo: admin/interno lo tienen bloqueado (gris)
    var rolSel = document.getElementById('f_rol_id');
    var provSel = document.getElementById('f_proveedor_id');
    function aplicarBloqueoProveedor() {
      var r = roles.find(function (x) { return x.id === rolSel.value; });
      var permitido = (r ? r.nombre : '').toLowerCase() === 'externo';
      provSel.disabled = !permitido;
      if (!permitido) provSel.value = '';
    }
    rolSel.addEventListener('change', aplicarBloqueoProveedor);
    aplicarBloqueoProveedor();

    var box = document.getElementById('plantasBox');
    box.innerHTML = plantas.length
      ? plantas.map(function (p) {
          return '<label><input type="checkbox" class="up-chk" value="' + p.id + '"> ' + esc(p.nombre) + '</label>';
        }).join('')
      : '<div class="box-placeholder" style="color:#888;font-size:.85rem;">' + t('No hay plantas creadas todavia.') + '</div>';
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  function plantasSeleccionadas() {
    return Array.prototype.slice.call(document.querySelectorAll('.up-chk:checked')).map(function (c) { return c.value; });
  }

  async function registrar(e) {
    e.preventDefault();
    limpiarMensaje();
    var btn = document.getElementById('registroBtn');
    var texto = btn.querySelector('.login-btn-text');
    var spinner = btn.querySelector('.login-spinner');

    var email = document.getElementById('f_email').value.trim();
    var password = document.getElementById('f_password').value;
    var nombre = document.getElementById('f_nombre').value.trim();
    var rolId = document.getElementById('f_rol_id').value;

    if (!email || !password || !nombre || !rolId) {
      mostrarMensaje(t('Por favor, complete todos los campos.'));
      if (!email) document.getElementById('f_email').classList.add('error');
      if (!password) document.getElementById('f_password').classList.add('error');
      if (!nombre) document.getElementById('f_nombre').classList.add('error');
      return;
    }
    if (password.length < 6) {
      mostrarMensaje(t('La contraseña debe tener al menos 6 caracteres.'));
      document.getElementById('f_password').classList.add('error');
      return;
    }

    btn.disabled = true;
    texto.style.display = 'none';
    spinner.style.display = 'inline';
    try {
      var cuerpo = {
        email: email,
        password: password,
        nombre: nombre,
        apellidos: document.getElementById('f_apellidos').value.trim(),
        rol_id: rolId,
        proveedor_id: document.getElementById('f_proveedor_id').value || null,
        departamento_id: document.getElementById('f_departamento_id').value || null,
        activo: true
      };
      var respuesta = await SupabaseApp.api('/api/usuarios', { method: 'POST', body: cuerpo });
      var uid = respuesta.id;
      // Asignar plantas seleccionadas
      var ids = plantasSeleccionadas();
      for (var i = 0; i < ids.length; i++) {
        await SupabaseApp.api('/api/crud/usuario_plantas', { method: 'POST', body: { usuario_id: uid, planta_id: ids[i] } });
      }
      window.location.href = '/?registrado=1';
    } catch (err) {
      var msg = (err && err.message) || t('Error');
      if (msg.indexOf('23505') !== -1 || /duplicate/i.test(msg)) msg = t('Ya existe un usuario con ese email.');
      mostrarMensaje(msg);
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
        if (window.GlobalHeader && window.GlobalHeader.changeLanguage) {
          window.GlobalHeader.changeLanguage(b.dataset.lang);
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // Si ya hay sesion, ir directo al dashboard
    if (window.Auth && Auth.isAuthenticated()) { window.location.href = '/dashboard'; return; }
    initLenguaje();
    await cargarMaestros();
    poblarSelects();
    document.getElementById('registroForm').addEventListener('submit', registrar);
    ['f_email', 'f_password', 'f_nombre'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', function () {
        this.classList.remove('error');
        limpiarMensaje();
      });
    });
  });
})();
