// =====================================================================
// excepciones.js - Excepciones de horario (mantenimiento / cierre)
// =====================================================================
// Permite marcar dias y horas concretos en los que un muelle NO esta
// operativo. En todos los calendarios esas horas aparecen como "cerrado"
// y no se puede reservar. Pantalla dedicada en Configuracion.

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function (k) { return window.GlobalHeader.translate(k); }
    : function (k) { return k; };

  var estructura = { plantas: [] };  // plantas -> naves -> muelles
  var registros = [];                // excepciones cargadas
  var editando = null;               // excepcion en edicion

  function esc(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
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

  function fmtLarga(iso) {
    if (!iso) return '\u2014';
    var p = iso.split('-');
    var d = new Date(iso);
    var semana = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    return semana[d.getDay()] + ', ' + p[2] + '/' + p[1] + '/' + p[0];
  }

  // ------------------------------------------------------------------
  // Carga de estructura (plantas -> naves -> muelles)
  // ------------------------------------------------------------------
  async function cargarEstructura() {
    try {
      var data = await SupabaseApp.api('/api/reservas/estructura');
      estructura.plantas = data.plantas || [];
    } catch (e) {
      estructura.plantas = [];
      console.error('Error estructura:', e);
    }
  }

  // ------------------------------------------------------------------
  // Carga de excepciones
  // ------------------------------------------------------------------
  async function cargarRegistros() {
    var tbody = document.getElementById('moduloTbody');
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">' + t('Cargando...') + '</td></tr>';
    try {
      var data = await SupabaseApp.api('/api/excepciones');
      registros = data.excepciones || [];
      pintarFilas();
    } catch (err) {
      console.error('Error cargando excepciones:', err);
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">' + t('Error al cargar') + ' · ' + esc(mensajeErrorAmigable(err)) + '</td></tr>';
    }
  }

  function nombreMuelle(id) {
    var e = registros.find(function (x) { return x.muelle_id === id; });
    if (e) return (e.planta ? e.planta + ' > ' : '') + (e.nave ? e.nave + ' > ' : '') + e.muelle_nombre;
    return id;
  }

  // Muelles que pertenecen a una nave (para el filtro por nave)
  function muellesDeNave(naveId) {
    var ids = [];
    estructura.plantas.forEach(function (p) {
      (p.naves || []).forEach(function (n) {
        if (n.id === naveId) (n.muelles || []).forEach(function (m) { ids.push(m.id); });
      });
    });
    return ids;
  }

  // Rellena el select del filtro por nave (todas las naves de todas las plantas)
  function poblarFiltroNave() {
    var sel = document.getElementById('filtroNave');
    if (!sel) return;
    var opciones = ['<option value="">' + t('Todas las naves') + '</option>'];
    estructura.plantas.forEach(function (p) {
      (p.naves || []).forEach(function (n) {
        opciones.push('<option value="' + n.id + '">' + esc(p.nombre + ' > ' + n.nombre) + '</option>');
      });
    });
    sel.innerHTML = opciones.join('');
  }

  function pintarFilas(datos) {
    var tbody = document.getElementById('moduloTbody');
    var thead = document.getElementById('moduloThead');
    var lista = datos || registros;
    var busqueda = (document.getElementById('busqueda').value || '').toLowerCase().trim();
    var desde = document.getElementById('filtroDesde').value;
    var hasta = document.getElementById('filtroHasta').value;
    var naveId = document.getElementById('filtroNave').value;

    if (busqueda) {
      lista = lista.filter(function (e) {
        return (e.muelle_nombre || '').toLowerCase().indexOf(busqueda) !== -1
          || (e.planta || '').toLowerCase().indexOf(busqueda) !== -1
          || (e.nave || '').toLowerCase().indexOf(busqueda) !== -1
          || (e.fecha || '').indexOf(busqueda) !== -1
          || (e.motivo || '').toLowerCase().indexOf(busqueda) !== -1;
      });
    }

    // Filtro por rango de fechas (inclusivo)
    if (desde) lista = lista.filter(function (e) { return (e.fecha || '') >= desde; });
    if (hasta) lista = lista.filter(function (e) { return (e.fecha || '') <= hasta; });

    // Filtro por nave (los muelles de la nave seleccionada)
    if (naveId) {
      var muellesNave = muellesDeNave(naveId);
      lista = lista.filter(function (e) { return muellesNave.indexOf(e.muelle_id) !== -1; });
    }

    thead.innerHTML = '<tr>'
      + '<th>' + t('Muelle') + '</th>'
      + '<th>' + t('Nave') + '</th>'
      + '<th>' + t('Fecha') + '</th>'
      + '<th>' + t('Hora') + '</th>'
      + '<th>' + t('Motivo') + '</th>'
      + '<th>' + t('Activo') + '</th>'
      + '<th>' + t('Acciones') + '</th>'
      + '</tr>';

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">' + t('No hay registros') + '</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(function (e) {
      var ruta = '<strong>' + esc(e.muelle_nombre) + '</strong>'
        + (e.planta ? '<div style="font-size:0.8rem;color:#5b7893;">' + esc(e.planta) + '</div>' : '');
      var motivoCls = (e.motivo === 'mantenimiento' || e.motivo === 'cierre') ? e.motivo : 'otro';
      var motivoTxt = { mantenimiento: t('Mantenimiento'), cierre: t('Cierre'), otro: t('Otro') }[e.motivo] || esc(e.motivo);
      var activoHtml = e.activo
        ? '<span class="badge badge-completed">' + t('Si') + '</span>'
        : '<span class="badge badge-cancelled">' + t('No') + '</span>';
      return '<tr>'
        + '<td>' + ruta + '</td>'
        + '<td>' + (e.nave ? esc(e.nave) : '\u2014') + '</td>'
        + '<td>' + esc(fmtLarga(e.fecha)) + '</td>'
        + '<td>' + esc((e.hora_inicio || '').slice(0, 5)) + ' \u2013 ' + esc((e.hora_fin || '').slice(0, 5)) + '</td>'
        + '<td><span class="badge-motivo ' + motivoCls + '">' + motivoTxt + '</span></td>'
        + '<td>' + activoHtml + '</td>'
        + '<td class="acciones-cell">'
        + '<button class="action-button btn-edit" onclick="window.Excepciones.editar(\'' + e.id + '\')">✏️ ' + t('Editar') + '</button>'
        + '<button class="action-button btn-del" onclick="window.Excepciones.eliminar(\'' + e.id + '\')">🗑️ ' + t('Eliminar') + '</button>'
        + '</td></tr>';
    }).join('');

    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  // ------------------------------------------------------------------
  // Cascada planta -> nave -> muelle en el formulario
  // ------------------------------------------------------------------
  function poblarCascada(plantaId, naveId, muelleId) {
    var pSel = document.getElementById('f_planta_id');
    var nSel = document.getElementById('f_nave_id');
    var mSel = document.getElementById('f_muelle_id');

    pSel.innerHTML = '<option value="">\u2014</option>' + estructura.plantas.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === plantaId ? ' selected' : '') + '>' + esc(p.nombre) + '</option>';
    }).join('');

    var planta = estructura.plantas.find(function (p) { return p.id === plantaId; });
    var naves = (planta && planta.naves) || [];
    nSel.innerHTML = '<option value="">\u2014</option>' + naves.map(function (n) {
      return '<option value="' + n.id + '"' + (n.id === naveId ? ' selected' : '') + '>' + esc(n.nombre) + '</option>';
    }).join('');
    nSel.disabled = !plantaId || !naves.length;

    var ms = [];
    naves.forEach(function (n) {
      if (!naveId || n.id === naveId) ms = ms.concat(n.muelles || []);
    });
    mSel.innerHTML = '<option value="">\u2014</option>' + ms.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === muelleId ? ' selected' : '') + '>' + esc(m.nombre) + '</option>';
    }).join('');
    mSel.disabled = !naveId || !ms.length;
  }

  // ------------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------------
  function abrirModal(excepcion) {
    editando = excepcion || null;
    document.getElementById('crudModalTitulo').textContent = excepcion ? t('Editar excepcion') : t('Nueva excepcion');

    var muelleId = excepcion ? excepcion.muelle_id : '';
    // Para editar: recuperar planta/nave del muelle desde la estructura
    var plantaId = '', naveId = '';
    if (excepcion) {
      estructura.plantas.forEach(function (p) {
        (p.naves || []).forEach(function (n) {
          (n.muelles || []).forEach(function (m) {
            if (m.id === excepcion.muelle_id) { plantaId = p.id; naveId = n.id; }
          });
        });
      });
    }
    poblarCascada(plantaId, naveId, muelleId);

    document.getElementById('f_fecha').value = excepcion ? excepcion.fecha : '';
    document.getElementById('f_motivo').value = (excepcion && excepcion.motivo) || 'mantenimiento';
    document.getElementById('f_hora_inicio').value = excepcion ? (excepcion.hora_inicio || '').slice(0, 5) : '';
    document.getElementById('f_hora_fin').value = excepcion ? (excepcion.hora_fin || '').slice(0, 5) : '';
    document.getElementById('f_activo').checked = excepcion ? excepcion.activo : true;
    document.getElementById('f_id').value = excepcion ? excepcion.id : '';

    document.getElementById('crudModal').classList.add('active');
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  function cerrarModal() {
    document.getElementById('crudModal').classList.remove('active');
    editando = null;
  }

  // ------------------------------------------------------------------
  // Guardar
  // ------------------------------------------------------------------
  async function guardar(e) {
    e.preventDefault();
    var muelleId = document.getElementById('f_muelle_id').value;
    var fecha = document.getElementById('f_fecha').value;
    var horaInicio = document.getElementById('f_hora_inicio').value;
    var horaFin = document.getElementById('f_hora_fin').value;
    var motivo = document.getElementById('f_motivo').value;
    var activo = document.getElementById('f_activo').checked;

    if (!muelleId) { notificar(t('Selecciona un muelle.'), 'error'); return; }
    if (!fecha) { notificar(t('Indica la fecha.'), 'error'); return; }
    if (!horaInicio || !horaFin) { notificar(t('Indica hora de inicio y fin.'), 'error'); return; }
    if (horaInicio >= horaFin) { notificar(t('La hora de fin debe ser posterior al inicio.'), 'error'); return; }

    var btn = document.getElementById('crudGuardar');
    btn.disabled = true;
    var cuerpo = {
      muelle_id: muelleId,
      fecha: fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      motivo: motivo,
      activo: activo
    };
    try {
      if (editando) {
        await SupabaseApp.api('/api/excepciones/' + editando.id, { method: 'PUT', body: cuerpo });
      } else {
        await SupabaseApp.api('/api/excepciones', { method: 'POST', body: cuerpo });
      }
      cerrarModal();
      await cargarRegistros();
      notificar(editando ? t('Excepcion actualizada.') : t('Excepcion creada.'), 'success');
      editando = null;
    } catch (err) {
      console.error('Error guardando excepcion:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function eliminar(id) {
    if (!window.confirm(t('¿Eliminar esta excepcion?'))) return;
    try {
      await SupabaseApp.api('/api/excepciones/' + id, { method: 'DELETE' });
      await cargarRegistros();
      notificar(t('Excepcion eliminada.'), 'success');
    } catch (err) {
      console.error('Error eliminando excepcion:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    }
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function conectarEventos() {
    document.getElementById('btnNuevo').addEventListener('click', function () { abrirModal(null); });
    document.getElementById('busqueda').addEventListener('input', function () { pintarFilas(); });

    // Filtros: rango de fechas y por nave
    // (envolver en función para no pasar el objeto Event como 'datos' a pintarFilas)
    document.getElementById('filtroDesde').addEventListener('change', function () { pintarFilas(); });
    document.getElementById('filtroHasta').addEventListener('change', function () { pintarFilas(); });
    document.getElementById('filtroNave').addEventListener('change', function () { pintarFilas(); });

    document.getElementById('f_planta_id').addEventListener('change', function (ev) {
      poblarCascada(ev.target.value, '', '');
    });
    document.getElementById('f_nave_id').addEventListener('change', function (ev) {
      var plantaId = document.getElementById('f_planta_id').value;
      poblarCascada(plantaId, ev.target.value, '');
    });

    document.getElementById('crudModalClose').addEventListener('click', cerrarModal);
    document.getElementById('crudCancelar').addEventListener('click', cerrarModal);
    document.getElementById('crudForm').addEventListener('submit', guardar);
    document.getElementById('crudModal').addEventListener('click', function (ev) {
      if (ev.target.id === 'crudModal') cerrarModal();
    });
  }

  // ------------------------------------------------------------------
  // Inicializacion
  // ------------------------------------------------------------------
  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = '/'; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }
    if (window.Permisos && !Permisos.tieneRol('admin') && !Permisos.tieneRol('interno')) {
      document.getElementById('moduloTbody').innerHTML =
        '<tr><td colspan="7" class="empty-state">' + t('No tienes permisos para ver este modulo.') + '</td></tr>';
      return;
    }
    conectarEventos();
    await cargarEstructura();
    poblarFiltroNave();
    await cargarRegistros();
  }

  window.Excepciones = { editar: function (id) { var e = registros.find(function (x) { return x.id === id; }); if (e) abrirModal(e); }, eliminar: eliminar };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
