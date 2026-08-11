// =====================================================================
// reservas.js - Reserva de muelles (vista diaria)
// =====================================================================
// El usuario ve su planta directamente y elige un dia. El calendario
// muestra TODOS los muelles de la planta (o de la nave seleccionada)
// para ese dia: filas = medias horas, columnas = muelles. Cada celda
// ocupada muestra el tipo (carga/descarga) y quien reservo; las celdas
// libres se clican para reservar.

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function (k) { return window.GlobalHeader.translate(k); }
    : function (k) { return k; };

  var estructura = { plantas: [] };
  var plantaSel = null;
  var naveSel = null;               // null = todas las naves
  var muelles = [];                 // respuesta de /api/reservas/dia-plantas
  var fechaSel = null;              // Date (dia seleccionado)
  var horaInicioGrid = '08:00';
  var horaFinGrid = '18:00';

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

  function notificar(mensaje, tipo) {
    var div = document.createElement('div');
    div.className = 'mensaje-temporal ' + tipo;
    div.textContent = mensaje;
    document.body.appendChild(div);
    requestAnimationFrame(function () { div.classList.add('mostrar'); });
    setTimeout(function () { div.classList.remove('mostrar'); setTimeout(function () { div.remove(); }, 350); }, 2600);
  }

  function mensajeErrorAmigable(err) {
    var msg = (err && err.message) || '';
    var extraido = msg.match(/'message':\s*'([^']+)'/);
    if (extraido) return extraido[1];
    return msg || t('Error');
  }

  // ------------------------------------------------------------------
  // Estructura (plantas -> naves) segun el usuario
  // ------------------------------------------------------------------
  async function cargarEstructura() {
    try {
      var data = await SupabaseApp.api('/api/reservas/estructura');
      estructura.plantas = data.plantas || [];
    } catch (e) { estructura.plantas = []; console.error('Error estructura:', e); }
  }

  function actualizarFiltros() {
    var pSel = document.getElementById('filtroPlanta');
    var nSel = document.getElementById('filtroNave');
    var aviso = document.getElementById('filtroAviso');

    var plantas = estructura.plantas;
    var avisoTxt = '';
    if (!plantas.length) avisoTxt = t('No tienes plantas asignadas. Contacta con un administrador.');
    else if (plantas.length === 1) avisoTxt = t('Solo puedes ver tu planta asignada.');
    aviso.style.display = avisoTxt ? 'block' : 'none';
    aviso.textContent = avisoTxt;

    if (!plantaSel && plantas.length) plantaSel = plantas[0].id;

    pSel.innerHTML = '<option value="">\u2014</option>' + plantas.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === plantaSel ? ' selected' : '') + '>' + esc(p.nombre) + '</option>';
    }).join('');
    pSel.disabled = plantas.length <= 1;

    var planta = plantas.find(function (p) { return p.id === plantaSel; });
    var naves = (planta && planta.naves) || [];
    nSel.innerHTML = '<option value="">' + t('Todas las naves') + '</option>'
      + naves.map(function (n) {
        return '<option value="' + n.id + '"' + (n.id === naveSel ? ' selected' : '') + '>' + esc(n.nombre) + '</option>';
      }).join('');
    nSel.disabled = !plantaSel || naves.length <= 1;

    cargarDia();
  }

  // ------------------------------------------------------------------
  // Carga del dia (todos los muelles de la planta/nave)
  // ------------------------------------------------------------------
  async function cargarDia() {
    if (!plantaSel || !fechaSel) return;
    aplicarEstadoDia();
    var iso = fmtFecha(fechaSel);
    var calBody = document.getElementById('calBody');
    var calHead = document.getElementById('calHead');
    calBody.innerHTML = '<tr><td colspan="8" class="empty-state">' + t('Cargando...') + '</td></tr>';
    calHead.innerHTML = '';
    document.getElementById('fechaTitulo').textContent = fmtLarga(iso);

    try {
      var url = '/api/reservas/dia-plantas?planta_id=' + encodeURIComponent(plantaSel) + '&fecha=' + iso;
      if (naveSel) url += '&nave_id=' + encodeURIComponent(naveSel);
      var data = await SupabaseApp.api(url);
      muelles = data.muelles || [];
      if (!muelles.length) { mostrarVacio(t('No hay muelles configurados para esta planta.')); return; }
      calcularRangoHoras();
      pintarCabecera();
      pintarCalendario();
    } catch (err) {
      console.error('Error cargando dia:', err);
      calBody.innerHTML = '<tr><td colspan="8" class="empty-state">' + t('Error al cargar') + ' · ' + esc(mensajeErrorAmigable(err)) + '</td></tr>';
    }
  }

  function calcularRangoHoras() {
    var minH = null, maxH = null;
    muelles.forEach(function (m) {
      (m.dia.disponibilidad || []).forEach(function (f) {
        if (!minH || f.hora_inicio < minH) minH = f.hora_inicio;
        if (!maxH || f.hora_fin > maxH) maxH = f.hora_fin;
      });
    });
    horaInicioGrid = minH || '08:00';
    horaFinGrid = maxH || '18:00';
  }

  function horasDelGrid() {
    var horas = [];
    var actual = horaInicioGrid;
    while (actual < horaFinGrid) { horas.push(actual); actual = sumarHora(actual); }
    return horas;
  }

  function sumarHora(h) {
    var p = h.split(':');
    var mins = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + 30;
    return pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60);
  }

  function pintarCabecera() {
    var calHead = document.getElementById('calHead');
    var fila = '<tr><th class="hora-col">' + t('Hora') + '</th>';
    muelles.forEach(function (m) {
      fila += '<th class="muelle-col">' + esc(m.nombre) + '<span class="sub">' + esc(m.nave) + '</span></th>';
    });
    fila += '</tr>';
    calHead.innerHTML = fila;
  }

  function reservaEn(muelle, hora) {
    var fin = sumarHora(hora);
    return (muelle.dia.reservas || []).find(function (r) { return r.hora_inicio < fin && r.hora_fin > hora; }) || null;
  }

  function diaTieneFranja(muelle, hora) {
    var fin = sumarHora(hora);
    return (muelle.dia.disponibilidad || []).some(function (f) { return hora >= f.hora_inicio && fin <= f.hora_fin; });
  }

  function pintarCalendario() {
    var calBody = document.getElementById('calBody');
    var horas = horasDelGrid();
    var html = '';
    var pasado = esDiaPasado();

    horas.forEach(function (hora) {
      html += '<tr><td class="hora">' + hora + '</td>';
      muelles.forEach(function (m) {
        var r = reservaEn(m, hora);
        if (r) {
          var tipoTxt = r.tipo === 'carga' ? t('Carga') : t('Descarga');
          var obs = r.observaciones ? (' · ' + r.observaciones) : '';
          html += '<td class="celda ocupado" title="' + esc(m.nombre + ' · ' + tipoTxt + obs) + '">'
            + '<span class="celda-reserva">' + esc(t('Reservado')) + ' <span class="tipo">(' + tipoTxt + ')</span></span>'
            + '</td>';
        } else if (diaTieneFranja(m, hora)) {
          if (pasado) {
            html += '<td class="celda libre" data-muelle="' + m.id + '" data-fecha="' + m.dia.fecha + '" data-hora="' + hora + '" title="' + t('Día pasado · Solo lectura') + '"></td>';
          } else {
            html += '<td class="celda libre" data-muelle="' + m.id + '" data-fecha="' + m.dia.fecha + '" data-hora="' + hora + '" title="' + t('Reservar') + ' ' + m.nombre + ' ' + hora + '">+</td>';
          }
        } else {
          html += '<td class="celda cerrado">\u2014</td>';
        }
      });
      html += '</tr>';
    });

    calBody.innerHTML = html || '<tr><td colspan="8" class="empty-state">' + t('No hay horario configurado.') + '</td></tr>';
  }

  function mostrarVacio(msg) {
    document.getElementById('calHead').innerHTML = '';
    document.getElementById('calBody').innerHTML = '<tr><td colspan="8" class="empty-state">' + esc(msg) + '</td></tr>';
  }

  // ------------------------------------------------------------------
  // Modal de reserva
  // ------------------------------------------------------------------
  function nombreMuelle(id) {
    var m = muelles.find(function (x) { return x.id === id; });
    return m ? m.nombre : id;
  }

  function abrirModal(muelleId, fecha, hora) {
    document.getElementById('r_muelle').value = nombreMuelle(muelleId);
    document.getElementById('r_fecha_iso').value = fecha;
    document.getElementById('r_fecha').value = fmtFechaDia(new Date(fecha + 'T00:00:00'));
    document.getElementById('r_hora_inicio').value = hora;
    document.getElementById('r_hora_fin').value = sumarHora(hora);
    document.getElementById('r_tipo').value = 'descarga';
    document.getElementById('r_observaciones').value = '';
    document.getElementById('r_muelle_id').value = muelleId;
    document.getElementById('reservaModal').classList.add('active');
  }

  function cerrarModal() {
    document.getElementById('reservaModal').classList.remove('active');
  }

  async function guardarReserva(e) {
    e.preventDefault();
    var btn = document.getElementById('reservaGuardar');
    btn.disabled = true;
    var cuerpo = {
      muelle_id: document.getElementById('r_muelle_id').value,
      fecha: document.getElementById('r_fecha_iso').value,
      hora_inicio: document.getElementById('r_hora_inicio').value,
      hora_fin: document.getElementById('r_hora_fin').value,
      tipo: document.getElementById('r_tipo').value,
      observaciones: document.getElementById('r_observaciones').value.trim() || null
    };
    try {
      await SupabaseApp.api('/api/reservas', { method: 'POST', body: cuerpo });
      cerrarModal();
      await cargarDia();
      notificar(t('Reserva creada correctamente.'), 'success');
    } catch (err) {
      console.error('Error creando reserva:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function conectarEventos() {
    var pSel = document.getElementById('filtroPlanta');
    var nSel = document.getElementById('filtroNave');

    pSel.addEventListener('change', function () {
      plantaSel = pSel.value || null;
      naveSel = null;
      actualizarFiltros();
    });
    nSel.addEventListener('change', function () {
      naveSel = nSel.value || null;
      cargarDia();
    });
    document.getElementById('fechaSel').addEventListener('change', function (e) {
      if (e.target.value) { fechaSel = new Date(e.target.value + 'T00:00:00'); sincronizarFechaUI(); cargarDia(); }
    });
    document.getElementById('btnPrevDia').addEventListener('click', function () { cambiarDia(-1); });
    document.getElementById('btnNextDia').addEventListener('click', function () { cambiarDia(1); });
    document.getElementById('btnHoy').addEventListener('click', function () {
      fechaSel = new Date();
      sincronizarFechaUI();
      cargarDia();
    });

    document.getElementById('calBody').addEventListener('click', function (ev) {
      if (esDiaPasado()) return;
      var celda = ev.target.closest('td.celda.libre');
      if (celda) abrirModal(celda.dataset.muelle, celda.dataset.fecha, celda.dataset.hora);
    });

    document.getElementById('reservaModalClose').addEventListener('click', cerrarModal);
    document.getElementById('reservaCancelar').addEventListener('click', cerrarModal);
    document.getElementById('reservaForm').addEventListener('submit', guardarReserva);
    document.getElementById('reservaModal').addEventListener('click', function (ev) {
      if (ev.target.id === 'reservaModal') cerrarModal();
    });
  }

  // ------------------------------------------------------------------
  // Inicializacion
  // ------------------------------------------------------------------
  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = '/'; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }
    if (window.Permisos && !Permisos.puedeVerMenu('reservas')) {
      document.getElementById('calBody').innerHTML =
        '<tr><td colspan="8" class="empty-state">' + t('No tienes permisos para ver este modulo.') + '</td></tr>';
      return;
    }

    conectarEventos();
    fechaSel = new Date();
    sincronizarFechaUI();
    await cargarEstructura();
    actualizarFiltros();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
