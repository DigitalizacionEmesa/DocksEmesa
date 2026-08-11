// =====================================================================
// configuracion.js - Renderiza el menu de configuracion
// =====================================================================

(function () {
  'use strict';

  const t = (key) => (window.GlobalHeader && window.GlobalHeader.translate)
                     ? window.GlobalHeader.translate(key) : key;

  const SECCIONES = [
    {
      id: 'jerarquia',
      titulo: 'Jerarquia de muelles',
      icono: '🏗️',
      modulos: ['plantas', 'naves', 'muelles', 'v_muelles']
    },
    {
      id: 'operacion',
      titulo: 'Operacion',
      icono: '🚛',
      modulos: ['disponibilidad_muelles', 'excepciones_muelles']
    },
    {
      id: 'proveedores',
      titulo: 'Proveedores',
      icono: '🏢',
      modulos: ['proveedores', 'proveedor_muelles']
    },
    {
      id: 'organizacion',
      titulo: 'Organizacion',
      icono: '🗂️',
      modulos: ['departamentos', 'roles']
    },
    {
      id: 'usuarios',
      titulo: 'Usuarios',
      icono: '👥',
      modulos: ['usuarios']
    }
  ];

  function render() {
    const contenedor = document.getElementById('secciones');
    if (!contenedor) return;

    if (window.Permisos && !Permisos.tieneAccesoConfig()) {
      contenedor.innerHTML = '<div class="mensaje-permiso visible" style="max-width:980px;">'
        + t('No tienes permisos para acceder a la configuracion.') + '</div>';
      return;
    }

    var html = '';

    SECCIONES.forEach(function(seccion) {
      var modulos = seccion.modulos
        .filter(function(clave) { return MODULOS[clave]; })
        .filter(function(clave) { return !window.Permisos || Permisos.puedeVerModulo(clave); })
        .map(function(clave) { return MODULOS[clave]; });

      if (modulos.length === 0) return;

      html += '<h2 class="config-section-title" data-original-text="' + seccion.titulo + '">'
        + seccion.icono + ' ' + t(seccion.titulo) + '</h2>'
        + '<div class="config-grid">';

      modulos.forEach(function(mod) {
        var href = mod.url || ('/modulo?tabla=' + mod.tabla);
        html += '<button class="config-card" onclick="window.location.href=\'' + href + '\'">'
          + '<span class="cc-icon">' + mod.icono + '</span>'
          + '<span class="cc-title" data-original-text="' + mod.titulo + '">' + t(mod.titulo) + '</span>'
          + '<span class="cc-desc" data-original-text="' + mod.descripcion + '">' + t(mod.descripcion) + '</span>'
          + '<span class="cc-arrow">→</span>'
          + '</button>';
      });

      html += '</div>';
    });

    if (html === '') {
      html = '<div class="mensaje-permiso visible" style="max-width:980px;">'
        + t('No tienes permisos para acceder a la configuracion.') + '</div>';
    }

    contenedor.innerHTML = html;

    if (window.GlobalHeader && window.GlobalHeader.translatePage) {
      window.GlobalHeader.translatePage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  window.addEventListener('languageChanged', render);
  window.addEventListener('permisosActualizados', render);

})();
