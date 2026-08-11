// =====================================================================
// permisos.js - Sistema de permisos por rol (frontend)
// =====================================================================
// Roles simplificados: admin, interno, proveedor (TEXT en BD)

(function () {
  'use strict';

  const MODULO_PERMISO = {
    plantas: 'plantas:ver',
    naves: 'naves:ver',
    muelles: 'muelles:ver',
    v_muelles: 'muelles:ver',
    disponibilidad_muelles: 'disponibilidad:ver',
    proveedores: 'proveedores:ver',
    proveedor_muelles: 'proveedores:ver',
    excepciones_muelles: 'disponibilidad:gestionar',
    departamentos: 'config:general',
    roles: 'config:roles',
    usuarios: 'config:usuarios'
  };

  const MENU_PERMISO = {
    configuracion: 'menu:configuracion',
    muelles: 'menu:muelles',
    proveedores: 'menu:proveedores',
    reservas: 'menu:reservas'
  };

  function getPermisos() {
    const user = window.Auth ? Auth.getCurrentUser() : null;
    return (user && Array.isArray(user.permisos)) ? user.permisos : [];
  }

  function getRoles() {
    const user = window.Auth ? Auth.getCurrentUser() : null;
    return (user && Array.isArray(user.roles)) ? user.roles : [];
  }

  function tienePermiso(permiso, lista) {
    const permisos = lista || getPermisos();
    if (!permisos.length) return false;
    if (permisos.indexOf('*') !== -1) return true;
    for (const p of permisos) {
      if (p === permiso) return true;
      if (p.endsWith(':*') && permiso.indexOf(p.slice(0, -1)) === 0) return true;
    }
    return false;
  }

  function tieneRol(...roles) {
    const misRoles = getRoles();
    return roles.some(r => misRoles.indexOf(r) !== -1);
  }

  function puedeVerMenu(menu) {
    const permiso = MENU_PERMISO[menu];
    if (!permiso) return true;
    return tienePermiso(permiso);
  }

  function puedeVerModulo(tabla) {
    const permiso = MODULO_PERMISO[tabla];
    if (!permiso) return false;
    return tienePermiso(permiso);
  }

  function puedeVerAlgunModulo() {
    return Object.values(MODULO_PERMISO).some(p => tienePermiso(p));
  }

  function tieneAccesoConfig() {
    return puedeVerMenu('configuracion') || puedeVerAlgunModulo();
  }

  function filtrarModulos(claves) {
    return (claves || []).filter(clave => puedeVerModulo(clave));
  }

  async function refresh() {
    if (!window.SupabaseApp) return null;
    try {
      const data = await SupabaseApp.api('/api/me');
      if (data.ok && data.user && window.Auth) {
        Auth.setCurrentUser(data.user);
      }
      return data.user || null;
    } catch (e) {
      return null;
    }
  }

  window.Permisos = {
    MODULO_PERMISO,
    MENU_PERMISO,
    getPermisos,
    getRoles,
    tienePermiso,
    tieneRol,
    puedeVerMenu,
    puedeVerModulo,
    puedeVerAlgunModulo,
    tieneAccesoConfig,
    filtrarModulos,
    refresh
  };

  async function init() {
    await refresh();
    window.dispatchEvent(new CustomEvent('permisosActualizados'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('Permisos cargado - Sistema simplificado');
})();
