// =====================================================================
// breadcrumb.js - Breadcrumb EMESA SPA (skill emesa-spa-breadcrumbs)
// =====================================================================
// Navegación jerárquica fija (máx. 3 niveles):
//   Inicio
//   Inicio > Configuración
//   Inicio > Configuración > Submenú
// Franja inmediatamente bajo el header, antes del layout principal.
// No es historial acumulativo: solo permite volver a Configuración o Inicio.
//
// API pública:
//   Breadcrumb.updateBreadcrumb(target)
//   Breadcrumb.navigateToBreadcrumb(target)
//   Breadcrumb.goBack(currentTarget)
//   Breadcrumb.ensureInitialState(target)
//   Breadcrumb.getLabelForTarget(target)

(function () {
  'use strict';

  const CONFIG = {
    maxDepth: 3,
    targets: {
      inicio: {
        tipo: 'inicio',
        label: 'Inicio',
        url: '/dashboard',
        padre: null
      },
      configuracion: {
        tipo: 'configuracion',
        label: 'Configuración',
        url: '/configuracion',
        padre: 'inicio'
      },
      reservas: {
        tipo: 'reservas',
        label: 'Reservar Muelle',
        url: '/reservas',
        padre: 'inicio'
      },
      mis_reservas: {
        tipo: 'mis_reservas',
        label: 'Mis Reservas',
        url: '/mis-reservas',
        padre: 'inicio'
      },
      calendario: {
        tipo: 'calendario',
        label: 'Calendario',
        url: '/calendario',
        padre: 'inicio'
      },
      excepciones: {
        tipo: 'excepciones',
        label: 'Excepciones de horario',
        url: '/excepciones',
        padre: 'configuracion'
      },
      disponibilidad: {
        tipo: 'disponibilidad',
        label: 'Disponibilidad',
        url: '/disponibilidad',
        padre: 'configuracion'
      }
    }
  };

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  // Devuelve el titulo del modulo (MODULOS es un const global en modulos.js,
  // no cuelga de window; por eso se accede via `typeof MODULOS`).
  function getModuloLabel(tabla) {
    const modulos = (typeof MODULOS !== 'undefined') ? MODULOS : window.MODULOS;
    if (modulos && modulos[tabla]) return modulos[tabla].titulo;
    return tabla || 'Módulo';
  }

  // Devuelve el target de la URL actual
  function detectTarget() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path === '/configuracion') return { tipo: 'configuracion' };
    if (path === '/usuarios') return { tipo: 'configuracion', submenu: 'usuarios' };
    if (path === '/modulo') return { tipo: 'configuracion', submenu: params.get('tabla') || 'modulo' };
    if (path === '/reservas') return { tipo: 'reservas' };
    if (path === '/mis-reservas') return { tipo: 'mis_reservas' };
    if (path === '/calendario') return { tipo: 'calendario' };
    if (path === '/excepciones') return { tipo: 'excepciones' };
    if (path === '/disponibilidad') return { tipo: 'disponibilidad' };
    if (path === '/vista-muelles') return { tipo: 'configuracion', submenu: 'v_muelles' };

    // Cualquier otra vista (incluido Inicio) muestra solo "Inicio"
    return { tipo: 'inicio' };
  }

  // ------------------------------------------------------------------
  // API: getLabelForTarget
  // ------------------------------------------------------------------
  function getLabelForTarget(target) {
    if (!target) return '';
    if (target.tipo === 'inicio') return CONFIG.targets.inicio.label;
    if (target.tipo === 'configuracion') {
      if (target.submenu) return getModuloLabel(target.submenu);
      return CONFIG.targets.configuracion.label;
    }
    const info = CONFIG.targets[target.tipo];
    return info ? info.label : '';
  }

  // ------------------------------------------------------------------
  // API: ensureInitialState - construye la cadena jerárquica (raíz → destino)
  // ------------------------------------------------------------------
  function ensureInitialState(target) {
    if (!target) target = { tipo: 'inicio' };

    // Normalizar
    if (target.tipo === 'inicio') {
      return [{ tipo: 'inicio', label: CONFIG.targets.inicio.label, url: null, actual: true }];
    }

    if (target.tipo === 'configuracion') {
      const items = [
        { tipo: 'inicio', label: CONFIG.targets.inicio.label, url: CONFIG.targets.inicio.url, actual: false },
        { tipo: 'configuracion', label: CONFIG.targets.configuracion.label, url: null, actual: true }
      ];
      if (target.submenu) {
        items[1].url = CONFIG.targets.configuracion.url;
        items[1].actual = false; // Configuración pasa a ser clicable
        items.push({
          tipo: 'configuracion',
          submenu: target.submenu,
          label: getModuloLabel(target.submenu),
          url: null,
          actual: true
        });
      }
      return items.slice(0, CONFIG.maxDepth);
    }

    // Páginas normales: Inicio > [Configuración si aplica] > Página
    const info = CONFIG.targets[target.tipo];
    if (info) {
      const items = [
        { tipo: 'inicio', label: CONFIG.targets.inicio.label, url: CONFIG.targets.inicio.url, actual: false }
      ];
      if (info.padre === 'configuracion') {
        items.push({
          tipo: 'configuracion',
          label: CONFIG.targets.configuracion.label,
          url: CONFIG.targets.configuracion.url,
          actual: false
        });
      }
      items.push({ tipo: info.tipo, label: info.label, url: null, actual: true });
      return items.slice(0, CONFIG.maxDepth);
    }

    // Desconocido: solo Inicio
    return [{ tipo: 'inicio', label: CONFIG.targets.inicio.label, url: null, actual: true }];
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function render(items) {
    const contenedor = document.getElementById('breadcrumb');
    if (!contenedor) return;

    contenedor.innerHTML = items.map((item, i) => {
      const separador = i > 0
        ? '<span class="breadcrumb-separator" aria-hidden="true">&gt;</span>'
        : '';

      let itemHtml;
      if (item.actual) {
        itemHtml = `<span class="breadcrumb-item breadcrumb-last" data-original-text="${item.label}">${item.label}</span>`;
      } else {
        itemHtml = `<a class="breadcrumb-item breadcrumb-clickable" href="${item.url}" data-target="${item.tipo}${item.submenu ? '|' + item.submenu : ''}">${item.label}</a>`;
      }

      return `${separador}${itemHtml}`;
    }).join('');

    // Traducir si el sistema global está disponible
    if (window.GlobalHeader && window.GlobalHeader.translatePage) {
      window.GlobalHeader.translatePage();
    }
  }

  // ------------------------------------------------------------------
  // API: updateBreadcrumb
  // ------------------------------------------------------------------
  function updateBreadcrumb(target) {
    const items = ensureInitialState(target);
    render(items);
    return items;
  }

  // ------------------------------------------------------------------
  // API: navigateToBreadcrumb
  // ------------------------------------------------------------------
  function navigateToBreadcrumb(target) {
    if (!target) return;
    if (target.tipo === 'inicio') {
      window.location.href = CONFIG.targets.inicio.url;
      return;
    }
    if (target.tipo === 'configuracion') {
      // Los submenús no son clicables en su último nivel → siempre a Configuración
      window.location.href = CONFIG.targets.configuracion.url;
      return;
    }
    const info = CONFIG.targets[target.tipo];
    if (info && info.url) window.location.href = info.url;
  }

  // ------------------------------------------------------------------
  // API: goBack - sube un nivel en la jerarquía visible
  // ------------------------------------------------------------------
  function goBack(currentTarget) {
    if (!currentTarget) currentTarget = detectTarget();

    if (currentTarget.tipo === 'inicio') return; // ya estamos en la raíz
    if (currentTarget.tipo === 'configuracion') {
      // Desde Configuración → Inicio; desde un submenú → Configuración
      window.location.href = currentTarget.submenu
        ? CONFIG.targets.configuracion.url
        : CONFIG.targets.inicio.url;
      return;
    }
    // Páginas normales: sube al padre (Inicio o Configuración)
    const info = CONFIG.targets[currentTarget.tipo];
    if (info && info.padre && CONFIG.targets[info.padre]) {
      window.location.href = CONFIG.targets[info.padre].url;
    }
  }

  // ------------------------------------------------------------------
  // Inicialización automática según la URL actual
  // ------------------------------------------------------------------
  function init() {
    // Asegurar contenedor bajo el header
    let wrapper = document.querySelector('nav.breadcrumb-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('nav');
      wrapper.className = 'breadcrumb-wrapper';
      wrapper.setAttribute('aria-label', 'Breadcrumb');
      const contenedor = document.createElement('div');
      contenedor.className = 'breadcrumb-container';
      contenedor.id = 'breadcrumb';
      wrapper.appendChild(contenedor);

      const header = document.querySelector('.global-header, .header');
      if (header && header.parentNode) {
        header.after(wrapper);
      } else {
        document.body.insertBefore(wrapper, document.body.firstChild);
      }
    }

    updateBreadcrumb(detectTarget());

    // Delegación de clics en los enlaces del breadcrumb
    const contenedor = document.getElementById('breadcrumb');
    if (contenedor) {
      contenedor.addEventListener('click', (e) => {
        const enlace = e.target.closest('.breadcrumb-clickable');
        if (!enlace) return;
        e.preventDefault();
        const [tipo, submenu] = (enlace.dataset.target || '').split('|');
        navigateToBreadcrumb({ tipo, submenu });
      });
    }
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------
  window.Breadcrumb = {
    updateBreadcrumb,
    navigateToBreadcrumb,
    goBack,
    ensureInitialState,
    getLabelForTarget
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
