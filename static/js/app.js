// =====================================================================
// app.js - Controlador del Dashboard EMESA DOCK
// =====================================================================
// Carga la información del usuario y los datos de Supabase
// (estadísticas y estado de muelles) a través del backend Flask.

(function () {
  'use strict';

  const t = (key) => (window.GlobalHeader && window.GlobalHeader.translate)
                     ? window.GlobalHeader.translate(key) : key;

  function esc(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  // ------------------------------------------------------------------
  // Información del usuario
  // ------------------------------------------------------------------
  function mostrarInfoUsuario() {
    const user = Auth.getCurrentUser();
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const levelEl = document.getElementById('userLevel');
    const avatarEl = document.getElementById('userAvatar');

    // La tarjeta de bienvenida puede no estar presente; no bloquear el dashboard
    if (!user || !nameEl) return;

    // Nombre (no traducible)
    const nombre = user.nombre || user.email || t('Usuario');
    nameEl.textContent = nombre;
    nameEl.dataset.originalText = 'Usuario';

    // Tipo de usuario (admin / interno / proveedor)
    const rolTexto = { 'admin': t('Admin'), 'interno': t('Interno'), 'proveedor': t('Proveedor') };
    const tipo = rolTexto[user.rol] || user.rol || t('Usuario');
    roleEl.textContent = tipo;

    // Roles desde el sistema de permisos
    const mapRol = { 'admin': t('Admin'), 'interno': t('Interno'), 'proveedor': t('Proveedor'), 'externo': t('Externo') };
    const roles = (user.roles || []).map(r => mapRol[r] || r).join(', ') || tipo;
    levelEl.textContent = roles;

    // Avatar con inicial
    avatarEl.textContent = (nombre || 'M').charAt(0).toUpperCase();

    console.log('✅ Usuario cargado:', user);
  }

  // ------------------------------------------------------------------
  // Estadisticas (Supabase)
  // ------------------------------------------------------------------
  async function cargarEstadisticas() {
    try {
      const data = await SupabaseApp.api('/api/stats');

      document.getElementById('statMuelles').textContent = data.muelles_activos ?? '--';
      document.getElementById('statReservasHoy').textContent = data.reservas_hoy ?? '--';
      document.getElementById('statPendientes').textContent = data.reservas_pendientes ?? '--';
    } catch (err) {
      console.error('❌ Error cargando estadisticas:', err);
      ['statMuelles', 'statReservasHoy', 'statPendientes']
        .forEach(id => { document.getElementById(id).textContent = '--'; });
    }
  }

  // ------------------------------------------------------------------
  // Visibilidad del menú lateral según permisos por rol
  // ------------------------------------------------------------------
  function aplicarPermisosDashboard() {
    if (!window.Permisos) return;
    const ocultar = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    const mostrar = (id) => { const el = document.getElementById(id); if (el) el.style.display = ''; };

    // Reservas: visible para todos los autenticados (menu:reservas base)
    if (!Permisos.puedeVerMenu('reservas')) {
      document.querySelectorAll('[data-sidebar-route="/reservas"], [data-sidebar-route="/mis-reservas"]').forEach(el => { el.style.display = 'none'; });
    }

    // Mis Reservas: visible para todos los autenticados
    // Ver Calendario: solo admin
    if (!Permisos.tieneRol('admin')) ocultar('sidebarCalendario');

    // Configuracion: solo con acceso a configuracion
    if (!Permisos.tieneAccesoConfig()) ocultar('tab-configuracion');
  }

  // ------------------------------------------------------------------
  // Inicialización
  // ------------------------------------------------------------------
  async function init() {
    // Si no hay sesión, el LoginModal se encarga
    if (!Auth.isAuthenticated()) return;

    mostrarInfoUsuario();

    // Refrescar permisos y aplicar visibilidad por rol
    if (window.Permisos) {
      try { await Permisos.refresh(); } catch (e) { /* sin sesión */ }
      aplicarPermisosDashboard();
    }

    // Verificar permisos (roles de administración)
    verificarPermisos();

    // Cargar datos de Supabase
    cargarEstadisticas();
  }

  // Reaplicar visibilidad cuando se actualicen los permisos
  window.addEventListener('permisosActualizados', () => {
    if (window.Permisos) aplicarPermisosDashboard();
  });

  function verificarPermisos() {
    // Los módulos de configuración ya están habilitados. El control fino de
    // permisos se aplica en la base de datos (políticas RLS por rol).
    console.log('✅ Configuración habilitada para el usuario actual');
  }

  // Refrescar textos dinámicos al cambiar de idioma
  window.addEventListener('languageChanged', () => {
    mostrarInfoUsuario();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
