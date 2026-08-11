// =====================================================================
// calendario.js - Vista diaria de reservas (solo lectura, solo admin)
// =====================================================================
// Dos vistas con toggle:
//  - Visual: grid con filas = horas, columnas = muelles, celdas
//    coloreadas por tipo (carga naranja / descarga azul).
//  - Listado: tabla con las reservas del dia.
// Selector de fecha para elegir el dia y selector de planta.

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function (k) { return window.GlobalHeader.translate(k); }
    : function (k) { return k; };

  var estructura = { plantas: [] };
  var plantaSel = null;
  var naveSel = null;          // null = todas las naves
  var muelleSel = null;        // null = todos los muelles
  var muelles = [];            // datos de /api/reservas/dia-plantas
  var fechaSel = null;         // Date (dia seleccionado)
  var vista = 'visual';        // 'visual' | 'lista'
  var reservasPorId = {};      // id reserva -> {muelle, nave, ...reserva}

  var DIAS_NOMBRES = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

  function esc(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtFecha(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtFechaDia(d) { return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear(); }

  function sincronizarFechaUI() {
    document.getElementById('fechaSel').value = fmtFecha(fechaSel);
    document.getElementById('fechaSelTxt').value = fmtFechaDia(fechaSel);
  }

  function cambiarDia(offset) {
    fechaSel = new Date(fechaSel.getFullYear(), fechaSel.getMonth(), fechaSel.getDate() + offset);
    sincronizarFechaUI();
    cargarDia();
  }

  function esDiaPasado() {
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var sel = new Date(fechaSel.getFullYear(), fechaSel.getMonth(), fechaSel.getDate());
    return sel < hoy;
  }

  function aplicarEstadoDia() {
    var pasado = esDiaPasado();
    var wrap = document.querySelector('.calendario-wrap');
    if (wrap) wrap.classList.toggle('dia-pasado', pasado);
    var aviso = document.getElementById('avisoDiaPasado');
    if (aviso) aviso.classList.toggle('oculto', !pasado);
  }

  function fmtLarga(iso) {
    var p = iso.split('-');
    var d = new Date(iso);
    var semana = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
    return semana[d.getDay()] + ', ' + p[2] + '/' + p[1] + '/' + p[0];
  }

  function mensajeErrorAmigable(err) {
    var msg = (err && err.message) || '';
    var extraido = msg.match(/'message':\s*'([^']+)'/);
    if (extraido) return extraido[1];
    return msg || t('Error');
  }

  async function cargarEstructura() {
    try {
      var data = await SupabaseApp.api('/api/reservas/estructura');
      estructura.plantas = data.plantas || [];
    } catch (e) { estructura.plantas = []; console.error('Error estructura:', e); }
  }

  // Filtros en cascada: Planta -> Nave -> Muelle. Al cambiar cada uno se
  // repuebla el siguiente nivel y se recarga el calendario.
  function poblarFiltros() {
    var pSel = document.getElementById('filtroPlanta');
    var nSel = document.getElementById('filtroNave');
    var mSel = document.getElementById('filtroMuelle');

    if (!plantaSel && estructura.plantas.length) plantaSel = estructura.plantas[0].id;

    pSel.innerHTML = estructura.plantas.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === plantaSel ? ' selected' : '') + '>' + esc(p.nombre) + '</option>';
    }).join('');

    var planta = estructura.plantas.find(function (p) { return p.id === plantaSel; });
    var naves = (planta && planta.naves) || [];
    nSel.innerHTML = '<option value="">' + t('Todas las naves') + '</option>'
      + naves.map(function (n) {
        return '<option value="' + n.id + '"' + (n.id === naveSel ? ' selected' : '') + '>' + esc(n.nombre) + '</option>';
      }).join('');
    nSel.disabled = !plantaSel || naves.length <= 1;

    // Muelles: los de la nave seleccionada o todos los de la planta
    var ms = [];
    naves.forEach(function (n) {
      if (!naveSel || n.id === naveSel) {
        ms = ms.concat(n.muelles || []);
      }
    });
    mSel.innerHTML = '<option value="">' + t('Todos los muelles') + '</option>'
      + ms.map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === muelleSel ? ' selected' : '') + '>' + esc(m.nombre) + '</option>';
      }).join('');
    mSel.disabled = !plantaSel || ms.length <= 1;

    cargarDia();
  }

  // ------------------------------------------------------------------
  // Carga de datos del dia
  // ------------------------------------------------------------------
  async function cargarDia() {
    if (!plantaSel || !fechaSel) return;
    aplicarEstadoDia();
    var iso = fmtFecha(fechaSel);
    document.getElementById('fechaTitulo').textContent = fmtLarga(iso);
    var url = '/api/reservas/dia-plantas?planta_id=' + encodeURIComponent(plantaSel) + '&fecha=' + iso;
    if (naveSel) url += '&nave_id=' + encodeURIComponent(naveSel);
    if (muelleSel) url += '&muelle_id=' + encodeURIComponent(muelleSel);
    try {
      var data = await SupabaseApp.api(url);
      muelles = data.muelles || [];
      if (vista === 'visual') pintarVisual();
    } catch (err) {
      console.error('Error cargando dia:', err);
      document.getElementById('calGridBody').innerHTML =
        '<tr><td colspan="8" class="empty-state">' + t('Error al cargar') + ' · ' + esc(mensajeErrorAmigable(err)) + '</td></tr>';
    }
  }

  // ------------------------------------------------------------------
  // Vista visual
  // ------------------------------------------------------------------
  function rangoHoras() {
    var minH = null, maxH = null;
    muelles.forEach(function (m) {
      (m.dia.disponibilidad || []).forEach(function (f) {
        if (!minH || f.hora_inicio < minH) minH = f.hora_inicio;
        if (!maxH || f.hora_fin > maxH) maxH = f.hora_fin;
      });
    });
    return { inicio: minH || '08:00', fin: maxH || '18:00' };
  }

  function horasDelGrid() {
    var r = rangoHoras();
    var horas = [];
    var actual = r.inicio;
    while (actual < r.fin) { horas.push(actual); actual = sumarHora(actual); }
    return horas;
  }

  function sumarHora(h) {
    var p = h.split(':');
    var mins = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + 30;
    return pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60);
  }

  function reservaEn(muelle, hora) {
    var fin = sumarHora(hora);
    return (muelle.dia.reservas || []).find(function (r) { return r.hora_inicio < fin && r.hora_fin > hora; }) || null;
  }

  function diaTieneFranja(muelle, hora) {
    var fin = sumarHora(hora);
    return (muelle.dia.disponibilidad || []).some(function (f) { return hora >= f.hora_inicio && fin <= f.hora_fin; });
  }

  function pintarVisual() {
    var head = document.getElementById('calGridHead');
    var body = document.getElementById('calGridBody');
    reservasPorId = {};
    document.getElementById('vistaVisual').classList.remove('oculto');
    document.getElementById('vistaLista').classList.add('oculto');
    var ley = document.querySelector('.leyenda');
    if (ley) ley.classList.remove('oculto');
    if (!muelles.length) {
      head.innerHTML = '';
      body.innerHTML = '<tr><td colspan="8" class="empty-state">' + t('No hay muelles configurados.') + '</td></tr>';
      return;
    }

    var fila = '<tr><th class="hora-col">' + t('Hora') + '</th>';
    muelles.forEach(function (m) {
      fila += '<th class="muelle-col">' + esc(m.nombre) + '<span class="sub">' + esc(m.nave) + '</span></th>';
    });
    fila += '</tr>';
    head.innerHTML = fila;

    var horas = horasDelGrid();
    var html = '';
    horas.forEach(function (hora) {
      html += '<tr><td class="hora">' + hora + '</td>';
      muelles.forEach(function (m) {
        var r = reservaEn(m, hora);
        if (r) {
          reservasPorId[r.id] = { muelle: m.nombre, nave: m.nave, muelle_id: m.id, fecha: m.dia.fecha, r: r };
          var tipoCls = r.tipo === 'carga' ? 'chip-carga' : 'chip-descarga';
          var tipoTxt = r.tipo === 'carga' ? t('Carga') : t('Descarga');
          var lugar = [m.planta, m.nave, m.nombre].filter(Boolean).join(' ');
          html += '<td class="celda" data-reserva-id="' + r.id + '" title="' + esc(lugar + ' · ' + r.hora_inicio + '-' + r.hora_fin + ' · ' + tipoTxt + ' (doble clic: informe)') + '">'
            + '<span class="chip-reserva ' + tipoCls + '">' + esc(lugar) + ' · ' + tipoTxt
            + '<span class="hora-txt">' + esc(r.hora_inicio + '-' + r.hora_fin) + '</span></span>'
            + '</td>';
        } else if (diaTieneFranja(m, hora)) {
          html += '<td class="celda libre"></td>';
        } else {
          html += '<td class="celda cerrado">\u2014</td>';
        }
      });
      html += '</tr>';
    });
    body.innerHTML = html || '<tr><td colspan="8" class="empty-state">' + t('No hay horario configurado.') + '</td></tr>';
  }

  // ------------------------------------------------------------------
  // Vista listado
  // ------------------------------------------------------------------
  function estadoTxt(e) {
    var map = { pendiente: 'Pendiente', completado: 'Completada', confirmada: 'Confirmada', cancelada: 'Cancelada' };
    return t(map[e] || 'Pendiente');
  }

  function tarjetaListado(f) {
    var r = f.r;
    var tipoTxt = r.tipo === 'carga' ? t('Carga') : t('Descarga');
    var ruta = [f.planta, f.nave, f.muelle].filter(Boolean).join(' ');
    var titulo = 'Reserva (' + ruta + ') - ' + tipoTxt;
    var estadoBadge = function (e) {
      var map = { pendiente: 'badge-pending', completado: 'badge-completed', confirmada: 'badge-completed', cancelada: 'badge-cancelled' };
      return '<span class="badge ' + (map[e] || 'badge-pending') + '">' + esc(estadoTxt(e)) + '</span>';
    };
    return '<div class="reserva-card">'
      + '<div class="rc-titulo"><strong>' + esc(titulo) + '</strong></div>'
      + '<div class="rc-grid">'
      + '<div class="rc-campo"><span class="rc-label">' + t('Hora') + '</span><span class="rc-valor">' + esc(r.hora_inicio) + '\u2013' + esc(r.hora_fin) + '</span></div>'
      + '<div class="rc-campo"><span class="rc-label">' + t('Tipo') + '</span><span class="rc-valor">' + esc(tipoTxt) + '</span></div>'
      + '<div class="rc-campo"><span class="rc-label">' + t('Estado') + '</span><span class="rc-valor">' + estadoBadge(r.estado) + '</span></div>'
      + '<div class="rc-campo"><span class="rc-label">' + t('Usuario') + '</span><span class="rc-valor">' + esc(r.usuario_nombre) + '</span></div>'
      + (r.usuario_proveedor ? '<div class="rc-campo"><span class="rc-label">' + t('Proveedor') + '</span><span class="rc-valor">' + esc(r.usuario_proveedor) + '</span></div>' : '')
      + '<div class="rc-campo full"><span class="rc-label">' + t('Observaciones') + '</span><span class="rc-valor">' + esc(r.observaciones || '\u2014') + '</span></div>'
      + '</div>'
      + '</div>';
  }

  // ------------------------------------------------------------------
  // Vista listado: TODAS las reservas agrupadas por día (en orden)
  // ------------------------------------------------------------------
  async function cargarListado() {
    document.getElementById('vistaVisual').classList.add('oculto');
    document.getElementById('vistaLista').classList.remove('oculto');
    var ley = document.querySelector('.leyenda');
    if (ley) ley.classList.add('oculto');
    var cont = document.getElementById('listaCards');
    cont.className = 'empty-state';
    cont.innerHTML = t('Cargando...');
    try {
      var data = await SupabaseApp.api('/api/reservas/todas');
      pintarListadoCards(data.reservas || []);
    } catch (err) {
      console.error('Error cargando listado:', err);
      cont.innerHTML = t('Error al cargar') + ' · ' + esc(mensajeErrorAmigable(err));
    }
  }

  function pintarListadoCards(reservas) {
    var cont = document.getElementById('listaCards');
    if (!reservas.length) {
      cont.className = 'empty-state';
      cont.innerHTML = t('No hay reservas.');
      return;
    }
    cont.className = '';
    var html = '';
    var fechaActual = null;
    reservas.forEach(function (r) {
      if (r.fecha !== fechaActual) {
        fechaActual = r.fecha;
        html += '<div class="dia-titulo">' + esc(fmtLarga(r.fecha)) + '</div>';
      }
      html += tarjetaListado({ muelle: r.muelle, nave: r.nave, planta: r.planta, muelle_id: r.muelle_id, r: r });
    });
    cont.innerHTML = html;
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  // ------------------------------------------------------------------
  // Informe (doble clic en una reserva)
  // ------------------------------------------------------------------
  function filaInforme(k, v) {
    return '<div class="informe-fila"><span class="k">' + esc(k) + '</span><span class="v">' + (v == null || v === '' ? '\u2014' : esc(v)) + '</span></div>';
  }

  function abrirInforme(reservaId) {
    var datos = reservasPorId[reservaId];
    if (!datos) return;
    var r = datos.r;

    var tipoTxt = r.tipo === 'carga' ? t('Carga') : t('Descarga');
    var estadoValor = estadoTxt(r.estado || 'pendiente');
    var htmlReserva = '<div class="informe-seccion"><h4>\ud83d\udccb ' + t('Datos de la reserva') + '</h4>'
      + filaInforme(t('Muelle'), datos.muelle)
      + filaInforme(t('Nave'), datos.nave)
      + filaInforme(t('Fecha'), datos.fecha)
      + filaInforme(t('Hora'), r.hora_inicio + ' \u2013 ' + r.hora_fin)
      + filaInforme(t('Tipo'), tipoTxt)
      + filaInforme(t('Estado'), estadoValor)
      + filaInforme(t('Observaciones'), r.observaciones || '\u2014')
      + '</div>';

    document.getElementById('informeReserva').innerHTML = htmlReserva;
    document.getElementById('informeUsuario').innerHTML =
      '<div class="informe-seccion"><h4>\ud83d\udc64 ' + t('Datos del usuario') + '</h4>'
      + '<div class="informe-vacio">' + t('Cargando usuario...') + '</div></div>';
    document.getElementById('informeModal').classList.add('active');

    // Cargar info del usuario
    SupabaseApp.api('/api/reservas/usuario-info/' + encodeURIComponent(r.usuario_id)).then(function (u) {
      var html = '<div class="informe-seccion"><h4>\ud83d\udc64 ' + t('Datos del usuario') + '</h4>'
        + filaInforme(t('Nombre'), ((u.nombre || '') + ' ' + (u.apellidos || '')).trim())
        + filaInforme('Email', u.email)
        + filaInforme(t('Proveedor'), u.proveedor)
        + filaInforme(t('Departamento'), u.departamento)
        + filaInforme(t('Plantas'), (u.plantas || []).join(', '))
        + '</div>';
      document.getElementById('informeUsuario').innerHTML = html;
      if (window.GlobalHeader) window.GlobalHeader.translatePage();
    }).catch(function () {
      document.getElementById('informeUsuario').innerHTML =
        '<div class="informe-seccion"><h4>\ud83d\udc64 ' + t('Datos del usuario') + '</h4>'
        + '<div class="informe-vacio">' + t('No se pudo cargar el usuario.') + '</div></div>';
    });
  }

  function cerrarInforme() {
    document.getElementById('informeModal').classList.remove('active');
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function conectarEventos() {
    var pSel = document.getElementById('filtroPlanta');
    var nSel = document.getElementById('filtroNave');
    var mSel = document.getElementById('filtroMuelle');

    pSel.addEventListener('change', function () {
      plantaSel = pSel.value || null;
      naveSel = null;
      muelleSel = null;
      poblarFiltros();
    });
    nSel.addEventListener('change', function () {
      naveSel = nSel.value || null;
      muelleSel = null;
      poblarFiltros();
    });
    mSel.addEventListener('change', function () {
      muelleSel = mSel.value || null;
      cargarDia();
    });
    document.getElementById('fechaSel').addEventListener('change', function (e) {
      if (e.target.value) {
        fechaSel = new Date(e.target.value + 'T00:00:00');
        sincronizarFechaUI();
        cargarDia();
      }
    });
    document.getElementById('btnPrevDia').addEventListener('click', function () { cambiarDia(-1); });
    document.getElementById('btnNextDia').addEventListener('click', function () { cambiarDia(1); });
    document.getElementById('btnHoy').addEventListener('click', function () {
      fechaSel = new Date();
      sincronizarFechaUI();
      cargarDia();
    });
    // Bloquea/desbloquea el selector de fecha (listado vs visual)
    function bloquearFecha(bloqueada) {
      var nav = document.querySelector('.fecha-nav');
      if (nav) nav.classList.toggle('bloqueada', bloqueada);
      var controles = [
        document.getElementById('btnPrevDia'),
        document.getElementById('btnNextDia'),
        document.getElementById('btnHoy'),
        document.getElementById('fechaSel')
      ];
      controles.forEach(function (el) { if (el) el.disabled = bloqueada; });
    }

    document.getElementById('btnVistaVisual').addEventListener('click', function () {
      vista = 'visual';
      document.getElementById('btnVistaVisual').classList.add('activo');
      document.getElementById('btnVistaLista').classList.remove('activo');
      bloquearFecha(false);
      pintarVisual();
    });
    document.getElementById('btnVistaLista').addEventListener('click', function () {
      vista = 'lista';
      document.getElementById('btnVistaLista').classList.add('activo');
      document.getElementById('btnVistaVisual').classList.remove('activo');
      bloquearFecha(true);
      cargarListado();
    });

    // Doble clic en una reserva -> informe
    document.getElementById('calGridBody').addEventListener('dblclick', function (ev) {
      var celda = ev.target.closest('td[data-reserva-id]');
      if (celda) abrirInforme(celda.dataset.reservaId);
    });

    // Cierre del modal informe
    var informeModal = document.getElementById('informeModal');
    document.getElementById('informeClose').addEventListener('click', cerrarInforme);
    document.getElementById('informeCancelar').addEventListener('click', cerrarInforme);
    informeModal.addEventListener('click', function (ev) {
      if (ev.target === informeModal) cerrarInforme();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && informeModal.classList.contains('active')) cerrarInforme();
    });
  }

  // ------------------------------------------------------------------
  // Inicializacion
  // ------------------------------------------------------------------
  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = '/'; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }

    // Solo admin
    if (window.Permisos && !Permisos.tieneRol('admin')) {
      document.getElementById('vistaVisual').innerHTML =
        '<div class="empty-state">' + t('No tienes permisos para ver este modulo.') + '</div>';
      return;
    }

    conectarEventos();
    fechaSel = new Date();
    sincronizarFechaUI();
    await cargarEstructura();
    poblarFiltros();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
