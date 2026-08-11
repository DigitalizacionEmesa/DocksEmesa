// =====================================================================
// vista_muelles.js - Plano visual de muelles MESA DOCK
// =====================================================================
// Muestra la jerarquia Planta > Nave > Muelle como un plano: cada planta
// es una tarjeta, dentro sus naves como edificios y dentro de cada nave
// los muelles como puertas de muelle. Sustituye al listado plano de v_muelles.

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function (k) { return window.GlobalHeader.translate(k); }
    : function (k) { return k; };

  function esc(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  // Colores de planta: cabecera SÓLIDA (sin degradado) + fondo de tarjeta tintado
  var PLANTAS_COLOR = [
    { head: '#1976d2', fondo: '#e7f0fa' },   // EMESA: azul sólido
    { head: '#d71920', fondo: '#fdecea' },   // Ostrava: rojo MESA sólido
    { head: '#00695c', fondo: '#e0f2f1' }    // reserva: teal
  ];
  var COLORES_NAVE = ['#1565c0', '#00838f', '#2e7d32', '#ef6c00', '#6a1b9a'];

  function renderMuelle(m, color) {
    return '<div class="muelle-slot" style="border-top-color:' + color + ';" title="' + esc(m.nombre) + '">'
      + '<span class="muelle-icono">🚛</span>'
      + '<span class="muelle-nombre">' + esc(m.nombre) + '</span>'
      + '</div>';
  }

  function renderNave(n, indiceNave) {
    var color = COLORES_NAVE[indiceNave % COLORES_NAVE.length];
    var muelles = (n.muelles || []).map(function (m) { return renderMuelle(m, color); }).join('');
    var count = (n.muelles || []).length;
    return '<article class="nave-block">'
      + '<header class="nave-roof" style="background:' + color + ';">'
      + '<span class="nave-icono">🏗️</span>'
      + '<span class="nave-nombre">' + esc(n.nombre) + '</span>'
      + '<span class="nave-count">' + count + ' ' + t('Muelles') + '</span>'
      + '</header>'
      + '<div class="muelle-slots">'
      + (muelles || '<div class="plano-vacio">' + t('Sin muelles') + '</div>')
      + '</div>'
      + '</article>';
  }

  function renderPlanta(p, indicePlanta) {
    var c = PLANTAS_COLOR[indicePlanta % PLANTAS_COLOR.length];
    var naves = (p.naves || []).map(function (n, i) { return renderNave(n, i); }).join('');
    var total = (p.naves || []).reduce(function (acc, n) { return acc + (n.muelles || []).length; }, 0);
    return '<section class="planta-card" style="background:' + c.fondo + ';">'
      + '<header class="planta-head" style="background:' + c.head + ';">'
      + '<span class="planta-icono">🏭</span>'
      + '<h2>' + esc(p.nombre) + '</h2>'
      + '<span class="planta-badge">' + total + ' ' + t('Muelles') + '</span>'
      + '</header>'
      + '<div class="nave-grid">'
      + (naves || '<div class="plano-vacio">' + t('Sin naves') + '</div>')
      + '</div>'
      + '</section>';
  }

  async function cargarPlano() {
    var cont = document.getElementById('planoPlantas');
    if (!cont) return;
    cont.innerHTML = '<div class="plano-cargando">' + t('Cargando...') + '</div>';
    try {
      var data = await SupabaseApp.api('/api/reservas/estructura');
      var plantas = data.plantas || [];
      if (!plantas.length) {
        cont.innerHTML = '<div class="plano-vacio">' + t('No hay registros') + '</div>';
        return;
      }
      cont.innerHTML = plantas.map(function (p, i) { return renderPlanta(p, i); }).join('');
      if (window.GlobalHeader) window.GlobalHeader.translatePage();
    } catch (e) {
      console.error('Error cargando plano de muelles:', e);
      cont.innerHTML = '<div class="plano-vacio">' + t('Error al cargar') + '</div>';
    }
  }

  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = '/'; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }
    if (window.Permisos && !Permisos.puedeVerModulo('v_muelles')) {
      var cont = document.getElementById('planoPlantas');
      if (cont) cont.innerHTML = '<div class="plano-vacio">' + t('No tienes permisos para ver este módulo.') + '</div>';
      return;
    }
    await cargarPlano();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
