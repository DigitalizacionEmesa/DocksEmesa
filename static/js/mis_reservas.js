// =====================================================================
// mis_reservas.js - "Mis Reservas" (vista diaria de las propias)
// =====================================================================
// El usuario ve sus reservas (y las de otros atenuadas) con dos vistas:
//  - Visual: grid filas = medias horas, columnas = muelles. Las MIAS se
//    marcan a color (clic -> tarjeta); las de otros en gris.
//  - Listado: tabla del dia con mas info; las mias con botones
//    Modificar / Cancelar.
// Cancelar libera la plaza; modificar pide un hueco libre (muelle, fecha,
// hora, tipo, observaciones).

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
  var vista = 'visual';             // 'visual' | 'lista'
  var reservasPorId = {};           // id reserva -> {muelle, nave, r}
  var reservaActiva = null;         // reserva seleccionada (detalle/edicion)
  var dragEnCurso = false;          // true mientras se arrastra una reserva
  var arrastrandoId = null;         // id de la reserva que se arrastra

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
    var titulo = document.getElementById('fechaTitulo');
    if (titulo) titulo.textContent = fmtLarga(fmtFecha(fechaSel));
  }

  function cambiarDia(offset) {
    fechaSel = new Date(fechaSel.getFullYear(), fechaSel.getMonth(), fechaSel.getDate() + offset);
    sincronizarFechaUI();
    refrescarVista();
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
    var semana = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    return semana[d.getDay()] + ', ' + p[2] + '/' + p[1] + '/' + p[0];
  }
  function miUsuarioId() {
    var u = window.Auth && Auth.getCurrentUser();
    return u ? u.id : null;
  }
  function esMia(r) { return r && r.usuario_id === miUsuarioId(); }

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

    refrescarVista();
  }

  // ------------------------------------------------------------------
  // Carga del dia
  // ------------------------------------------------------------------
  function indexarReservas() {
    reservasPorId = {};
    muelles.forEach(function (m) {
      (m.dia.reservas || []).forEach(function (r) {
        if (esMia(r)) {
          reservasPorId[r.id] = { muelle: m.nombre, nave: m.nave, muelle_id: m.id, fecha: m.dia.fecha, r: r };
        }
      });
    });
  }

  async function cargarDia() {
    if (!plantaSel || !fechaSel) return;
    aplicarEstadoDia();
    var iso = fmtFecha(fechaSel);
    var calBody = document.getElementById('calGridBody');
    var calHead = document.getElementById('calGridHead');
    calBody.innerHTML = '<tr><td colspan="8" class="empty-state">' + t('Cargando...') + '</td></tr>';
    calHead.innerHTML = '';
    document.getElementById('fechaTitulo').textContent = fmtLarga(iso);

    try {
      var url = '/api/reservas/dia-plantas?planta_id=' + encodeURIComponent(plantaSel) + '&fecha=' + iso;
      if (naveSel) url += '&nave_id=' + encodeURIComponent(naveSel);
      var data = await SupabaseApp.api(url);
      muelles = data.muelles || [];
      indexarReservas();
      if (!muelles.length) { mostrarVacio(t('No hay muelles configurados para esta planta.')); return; }
      if (vista === 'visual') pintarVisual();
      // En vista 'lista' el listado muestra TODAS las reservas (cargarListado)
    } catch (err) {
      console.error('Error cargando dia:', err);
      calBody.innerHTML = '<tr><td colspan="8" class="empty-state">' + t('Error al cargar') + ' · ' + esc(mensajeErrorAmigable(err)) + '</td></tr>';
    }
  }

  function mostrarVacio(msg) {
    document.getElementById('calGridHead').innerHTML = '';
    document.getElementById('calGridBody').innerHTML = '<tr><td colspan="8" class="empty-state">' + esc(msg) + '</td></tr>';
  }

  // Refresca la vista actual (listado de todas las reservas o el calendario del dia)
  function refrescarVista() {
    return vista === 'lista' ? cargarListado() : cargarDia();
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
    return { min: minH || '08:00', max: maxH || '18:00' };
  }

  function horasDelGrid() {
    var rango = rangoHoras();
    var horas = [];
    var actual = rango.min;
    while (actual < rango.max) { horas.push(actual); actual = sumarHora(actual); }
    return horas;
  }

  function sumarHora(h) {
    var p = h.split(':');
    var mins = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + 30;
    return pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60);
  }

  function sumarMin(h, mins) {
    var p = h.split(':');
    var t = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + mins;
    return pad(Math.floor(t / 60) % 24) + ':' + pad(t % 60);
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
    var ley = document.querySelector('.leyenda');
    if (ley) ley.classList.remove('oculto');
    document.getElementById('vistaVisual').classList.remove('oculto');
    document.getElementById('vistaLista').classList.add('oculto');
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
          var mia = esMia(r);
          if (mia) {
            var tipoCls = r.tipo === 'carga' ? 'chip-carga' : 'chip-descarga';
            var tipoTxt = r.tipo === 'carga' ? t('Carga') : t('Descarga');
            var lugar = [m.planta, m.nave, m.nombre].filter(Boolean).join(' ');
            html += '<td class="celda mi-reserva" data-reserva-id="' + r.id + '" draggable="true" title="' + esc(lugar + ' · ' + r.hora_inicio + '-' + r.hora_fin + ' · ' + tipoTxt + ' (clic: detalle · arrastra para mover)') + '">'
              + '<span class="chip-reserva ' + tipoCls + '">' + esc(lugar) + ' · ' + tipoTxt
              + '<span class="hora-txt">' + esc(r.hora_inicio + '-' + r.hora_fin) + '</span></span>'
              + '</td>';
          } else {
            html += '<td class="celda" title="' + t('Reserva de otro usuario') + '">'
              + '<span class="chip-reserva chip-otro">' + esc(r.usuario_nombre || t('Otro usuario')) + '</span>'
              + '</td>';
          }
        } else if (diaTieneFranja(m, hora)) {
          html += '<td class="celda libre" data-muelle="' + m.id + '" data-fecha="' + m.dia.fecha + '" data-hora="' + hora + '"></td>';
        } else {
          html += '<td class="celda cerrado">\u2014</td>';
        }
      });
      html += '</tr>';
    });
    body.innerHTML = html || '<tr><td colspan="8" class="empty-state">' + t('No hay horario configurado.') + '</td></tr>';

    // Aviso cuando el día seleccionado no tiene reservas pendientes
    var aviso = document.getElementById('avisoSinReservas');
    if (aviso) {
      var pendientes = 0;
      muelles.forEach(function (m) {
        (m.dia.reservas || []).forEach(function (r) { if (r.estado !== 'completado') pendientes++; });
      });
      aviso.classList.toggle('oculto', pendientes > 0);
    }
  }

  // ------------------------------------------------------------------
  // Vista listado
  // ------------------------------------------------------------------
  function estadoTxt(e) {
    var map = { pendiente: 'Pendiente', completado: 'Completada', confirmada: 'Confirmada', cancelada: 'Cancelada' };
    return t(map[e] || 'Pendiente');
  }

  function estadoBadge(e) {
    var map = { pendiente: 'badge-pending', completado: 'badge-completed', confirmada: 'badge-completed', cancelada: 'badge-cancelled' };
    return '<span class="badge ' + (map[e] || 'badge-pending') + '">' + esc(estadoTxt(e)) + '</span>';
  }

  // ------------------------------------------------------------------
  // Vista listado: TODAS las reservas del usuario en tarjetas (por tiempo)
  // ------------------------------------------------------------------
  async function cargarListado() {
    document.getElementById('vistaVisual').classList.add('oculto');
    document.getElementById('vistaLista').classList.remove('oculto');
    // La leyenda de colores solo aplica al calendario visual
    var ley = document.querySelector('.leyenda');
    if (ley) ley.classList.add('oculto');
    // El aviso de 'sin reservas' solo aplica a la vista visual
    var aviso = document.getElementById('avisoSinReservas');
    if (aviso) aviso.classList.add('oculto');
    var cont = document.getElementById('listaCards');
    cont.className = 'empty-state';
    cont.innerHTML = t('Cargando...');
    try {
      // Listado: TODAS las reservas del usuario (sin filtrar por el dia marcado),
      // ya agrupadas por fecha en pintarListadoCards
      var url = '/api/reservas/mias';
      var data = await SupabaseApp.api(url);
      var reservas = data.reservas || [];
      // Indexar para detalle/editar/cancelar
      reservasPorId = {};
      reservas.forEach(function (r) {
        reservasPorId[r.id] = { muelle: r.muelle, nave: r.nave, muelle_id: r.muelle_id, fecha: r.fecha, r: r };
      });
      pintarListadoCards(reservas);
    } catch (err) {
      console.error('Error cargando listado:', err);
      cont.innerHTML = t('Error al cargar') + ' · ' + esc(mensajeErrorAmigable(err));
    }
  }

  function tarjetaReserva(r) {
    var tipoTxt = r.tipo === 'carga' ? t('Carga') : t('Descarga');
    var acciones = '';
    if (r.estado === 'completado') {
      acciones = '<span class="rc-aviso">' + t('Ya finalizada') + '</span>';
    } else if (r.estado === 'cancelada') {
      acciones = '<span class="rc-aviso">' + t('Cancelada') + '</span>';
    } else {
      acciones = '<button class="action-button btn-edit" onclick="window.MisReservas.modificar(\'' + r.id + '\')">✏️ ' + t('Modificar') + '</button>'
        + '<button class="action-button btn-del" onclick="window.MisReservas.cancelar(\'' + r.id + '\')">🗑️ ' + t('Cancelar') + '</button>';
    }
    var ruta = [r.planta, r.nave, r.muelle].filter(Boolean).join(' ');
    var titulo = 'Reserva (' + ruta + ') - ' + tipoTxt;
    return '<div class="reserva-card' + (r.estado === 'cancelada' ? ' cancelada' : '') + '">'
      + '<div class="rc-titulo"><strong>' + esc(titulo) + '</strong></div>'
      + '<div class="rc-grid">'
      + '<div class="rc-campo"><span class="rc-label">' + t('Hora') + '</span><span class="rc-valor">' + esc(r.hora_inicio) + '\u2013' + esc(r.hora_fin) + '</span></div>'
      + '<div class="rc-campo"><span class="rc-label">' + t('Tipo') + '</span><span class="rc-valor">' + esc(tipoTxt) + '</span></div>'
      + '<div class="rc-campo"><span class="rc-label">' + t('Estado') + '</span><span class="rc-valor">' + estadoBadge(r.estado) + '</span></div>'
      + '<div class="rc-campo full"><span class="rc-label">' + t('Observaciones') + '</span><span class="rc-valor">' + esc(r.observaciones || '\u2014') + '</span></div>'
      + '</div>'
      + '<div class="rc-acciones">' + acciones + '</div>'
      + '</div>';
  }

  function pintarListadoCards(reservas) {
    var cont = document.getElementById('listaCards');
    if (!reservas.length) {
      cont.className = 'empty-state';
      cont.innerHTML = t('No tienes reservas.');
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
      html += tarjetaReserva(r);
    });
    cont.innerHTML = html;
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  // ------------------------------------------------------------------
  // Detalle (doble clic) y edicion
  // ------------------------------------------------------------------
  function filaInfo(k, v) {
    return '<div class="informe-fila"><span class="k">' + esc(k) + '</span><span class="v">' + (v == null || v === '' ? '\u2014' : esc(v)) + '</span></div>';
  }

  function abrirDetalle(reservaId) {
    var datos = reservasPorId[reservaId];
    if (!datos) return;
    var r = datos.r;
    reservaActiva = { id: r.id, muelle_id: datos.muelle_id, muelle: datos.muelle, nave: datos.nave, fecha: datos.fecha, r: r };
    var tipoTxt = r.tipo === 'carga' ? t('Carga') : t('Descarga');
    document.getElementById('detalleInfo').innerHTML =
      '<div class="informe-seccion"><h4>\ud83d\udccb ' + t('Mi reserva') + '</h4>'
      + filaInfo(t('Muelle'), datos.muelle)
      + filaInfo(t('Nave'), datos.nave)
      + filaInfo(t('Fecha'), datos.fecha)
      + filaInfo(t('Hora'), r.hora_inicio + ' \u2013 ' + r.hora_fin)
      + filaInfo(t('Tipo'), tipoTxt)
      + filaInfo(t('Estado'), estadoTxt(r.estado))
      + filaInfo(t('Observaciones'), r.observaciones || '\u2014')
      + '</div>';

    var terminada = r.estado === 'completado';
    document.getElementById('detalleCancelarReserva').disabled = terminada;
    document.getElementById('detalleModificar').disabled = terminada;
    document.getElementById('detalleModal').classList.add('active');
  }

  function cerrarDetalle() {
    document.getElementById('detalleModal').classList.remove('active');
    reservaActiva = null;
  }

  // Muelles permitidos (estructura) para el selector del formulario de edicion
  function muellesPermitidos() {
    var lista = [];
    estructura.plantas.forEach(function (p) {
      (p.naves || []).forEach(function (n) {
        (n.muelles || []).forEach(function (m) {
          lista.push({ id: m.id, etiqueta: p.nombre + ' > ' + n.nombre + ' > ' + m.nombre });
        });
      });
    });
    return lista;
  }

  function abrirEdicion() {
    if (!reservaActiva) return;
    var a = reservaActiva;
    cerrarDetalle();
    document.getElementById('editarModal').classList.add('active');

    var mSel = document.getElementById('e_muelle_id');
    mSel.innerHTML = muellesPermitidos().map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === a.muelle_id ? ' selected' : '') + '>' + esc(m.etiqueta) + '</option>';
    }).join('');

    document.getElementById('e_fecha').value = a.fecha;
    document.getElementById('e_tipo').value = a.r.tipo || 'descarga';
    document.getElementById('e_hora_inicio').value = a.r.hora_inicio;
    document.getElementById('e_hora_fin').value = a.r.hora_fin;
    document.getElementById('e_observaciones').value = a.r.observaciones || '';
    document.getElementById('editarModal').dataset.reservaId = a.id;
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  function cerrarEdicion() {
    document.getElementById('editarModal').classList.remove('active');
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    var rid = document.getElementById('editarModal').dataset.reservaId;
    if (!rid) return;
    var muelleId = document.getElementById('e_muelle_id').value;
    var fecha = document.getElementById('e_fecha').value;
    var horaInicio = document.getElementById('e_hora_inicio').value;
    var horaFin = document.getElementById('e_hora_fin').value;
    var tipo = document.getElementById('e_tipo').value;
    var obs = document.getElementById('e_observaciones').value.trim() || null;
    if (!muelleId || !fecha || !horaInicio || !horaFin) { notificar(t('Completa los datos.'), 'error'); return; }
    if (horaInicio >= horaFin) { notificar(t('La hora de fin debe ser posterior al inicio.'), 'error'); return; }

    var btn = document.getElementById('editarGuardar');
    btn.disabled = true;
    try {
      await SupabaseApp.api('/api/reservas/' + rid, {
        method: 'PUT',
        body: { muelle_id: muelleId, fecha: fecha, hora_inicio: horaInicio, hora_fin: horaFin, tipo: tipo, observaciones: obs }
      });
      cerrarEdicion();
      await refrescarVista();
      notificar(t('Reserva actualizada.'), 'success');
    } catch (err) {
      console.error('Error modificando reserva:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function cancelarReserva(id) {
    if (!window.confirm(t('¿Seguro que quieres cancelar esta reserva?'))) return;
    try {
      await SupabaseApp.api('/api/reservas/' + id + '/cancelar', { method: 'POST' });
      cerrarDetalle();
      await refrescarVista();
      notificar(t('Reserva cancelada. La plaza vuelve a estar libre.'), 'success');
    } catch (err) {
      console.error('Error cancelando reserva:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    }
  }

  // Mueve una reserva (drag & drop) a otro muelle/hora libres del calendario.
  async function moverReserva(rid, muelleId, fecha, hora) {
    var datos = reservasPorId[rid];
    if (!datos) return;
    var r = datos.r;
    var dur = (parseInt(r.hora_fin.split(':')[0], 10) * 60 + parseInt(r.hora_fin.split(':')[1], 10))
            - (parseInt(r.hora_inicio.split(':')[0], 10) * 60 + parseInt(r.hora_inicio.split(':')[1], 10));
    if (dur <= 0) dur = 30;
    var fin = sumarMin(hora, dur);
    // Si se suelta en el mismo hueco, no hacer nada
    if (datos.muelle_id === muelleId && datos.fecha === fecha && r.hora_inicio === hora && r.hora_fin === fin) return;
    try {
      await SupabaseApp.api('/api/reservas/' + rid, {
        method: 'PUT',
        body: {
          muelle_id: muelleId,
          fecha: fecha,
          hora_inicio: hora,
          hora_fin: fin,
          tipo: r.tipo || 'descarga',
          observaciones: r.observaciones || null
        }
      });
      notificar(t('Reserva actualizada.'), 'success');
    } catch (err) {
      console.error('Error moviendo reserva:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    }
    await refrescarVista();
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
      refrescarVista();
    });
    document.getElementById('fechaSel').addEventListener('change', function (e) {
      if (e.target.value) { fechaSel = new Date(e.target.value + 'T00:00:00'); sincronizarFechaUI(); refrescarVista(); }
    });
    document.getElementById('btnPrevDia').addEventListener('click', function () { cambiarDia(-1); });
    document.getElementById('btnNextDia').addEventListener('click', function () { cambiarDia(1); });
    document.getElementById('btnHoy').addEventListener('click', function () {
      fechaSel = new Date();
      sincronizarFechaUI();
      refrescarVista();
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

    // Clic en una reserva MIA -> detalle (si no viene de un arrastre)
    document.getElementById('calGridBody').addEventListener('click', function (ev) {
      if (dragEnCurso) return;
      var celda = ev.target.closest('td[data-reserva-id]');
      if (celda) abrirDetalle(celda.dataset.reservaId);
    });

    // Drag & drop: mover una reserva MIA a otro hueco libre
    document.getElementById('calGridBody').addEventListener('dragstart', function (ev) {
      if (esDiaPasado()) return;
      var celda = ev.target.closest('td[data-reserva-id]');
      if (!celda) return;
      arrastrandoId = celda.dataset.reservaId;
      dragEnCurso = true;
      celda.classList.add('arrastrando');
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', arrastrandoId); } catch (e) {}
    });
    document.getElementById('calGridBody').addEventListener('dragover', function (ev) {
      var celda = ev.target.closest('td.celda.libre');
      if (!celda) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      celda.classList.add('drop-ok');
    });
    document.getElementById('calGridBody').addEventListener('dragleave', function (ev) {
      var celda = ev.target.closest('td.celda.libre');
      if (celda) celda.classList.remove('drop-ok');
    });
    document.getElementById('calGridBody').addEventListener('drop', function (ev) {
      var celda = ev.target.closest('td.celda.libre');
      if (!celda || !arrastrandoId) return;
      ev.preventDefault();
      celda.classList.remove('drop-ok');
      var rid = arrastrandoId;
      arrastrandoId = null;
      dragEnCurso = false;
      moverReserva(rid, celda.dataset.muelle, celda.dataset.fecha, celda.dataset.hora);
    });
    document.getElementById('calGridBody').addEventListener('dragend', function (ev) {
      var celda = ev.target.closest('td[data-reserva-id]');
      if (celda) celda.classList.remove('arrastrando');
      document.querySelectorAll('#calGridBody td.drop-ok').forEach(function (c) { c.classList.remove('drop-ok'); });
      arrastrandoId = null;
      dragEnCurso = false;
    });

    // Cierre de modales
    document.getElementById('detalleClose').addEventListener('click', cerrarDetalle);
    document.getElementById('detalleModificar').addEventListener('click', abrirEdicion);
    document.getElementById('detalleCancelarReserva').addEventListener('click', function () {
      if (reservaActiva) cancelarReserva(reservaActiva.id);
    });
    document.getElementById('detalleModal').addEventListener('click', function (ev) {
      if (ev.target.id === 'detalleModal') cerrarDetalle();
    });

    document.getElementById('editarClose').addEventListener('click', cerrarEdicion);
    document.getElementById('editarCancelar').addEventListener('click', cerrarEdicion);
    document.getElementById('editarForm').addEventListener('submit', guardarEdicion);
    document.getElementById('editarModal').addEventListener('click', function (ev) {
      if (ev.target.id === 'editarModal') cerrarEdicion();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (document.getElementById('editarModal').classList.contains('active')) cerrarEdicion();
        else if (document.getElementById('detalleModal').classList.contains('active')) cerrarDetalle();
      }
    });
  }

  // ------------------------------------------------------------------
  // Inicializacion
  // ------------------------------------------------------------------
  // Primer día (desde hoy, inclusive) con reservas pendientes del usuario.
  // Se usa para marcar por defecto el día más cercano con reservas futuras.
  async function primerDiaConReservas() {
    try {
      var data = await SupabaseApp.api('/api/reservas/mias');
      var hoy = fmtFecha(new Date());
      var fechas = (data.reservas || [])
        .filter(function (r) { return r.estado !== 'completado' && r.fecha >= hoy; })
        .map(function (r) { return r.fecha; })
        .sort();
      if (fechas.length) {
        var p = fechas[0].split('-');
        return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
      }
    } catch (e) { /* silencioso */ }
    return null;
  }

  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = '/'; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }

    conectarEventos();
    fechaSel = new Date();
    sincronizarFechaUI();
    await cargarEstructura();
    // El día marcado por defecto = primer día futuro con reservas pendientes
    var primerDia = await primerDiaConReservas();
    if (primerDia) { fechaSel = primerDia; sincronizarFechaUI(); }
    actualizarFiltros();
  }

  window.MisReservas = {
    modificar: function (id) {
      var datos = reservasPorId[id];
      if (datos) { reservaActiva = { id: id, muelle_id: datos.muelle_id, muelle: datos.muelle, nave: datos.nave, fecha: datos.fecha, r: datos.r }; abrirEdicion(); }
    },
    cancelar: cancelarReserva
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
