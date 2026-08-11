// =====================================================================
// disponibilidad.js - Horarios de muelles (dias multiples)
// =====================================================================
// El usuario marca varios dias a la vez (L M X J V S D) y se crea un
// registro por dia en disponibilidad_muelles. El listado agrupa por
// muelle + horario y muestra los dias como iniciales con rangos (L-V).

(function () {
  "use strict";

  var t = (window.GlobalHeader && window.GlobalHeader.translate)
    ? function (k) { return window.GlobalHeader.translate(k); }
    : function (k) { return k; };

  // dia_semana (0=Lunes ... 6=Domingo) -> inicial, como usa el calendario
  var DIAS = [
    { v: 0, l: 'L' }, { v: 1, l: 'M' }, { v: 2, l: 'X' }, { v: 3, l: 'J' },
    { v: 4, l: 'V' }, { v: 5, l: 'S' }, { v: 6, l: 'D' }
  ];

  var muelles = [];        // lista de muelles para el select
  var registros = [];      // filas crudas de disponibilidad_muelles
  var grupos = [];         // registros agrupados para el listado
  var editando = null;     // grupo en edicion

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

  // ------------------------------------------------------------------
  // Formateo de dias con rangos: [0,1,2,3,4] -> "L-V" ; [1,3] -> "M, J"
  // ------------------------------------------------------------------
  function formatearDias(dias) {
    var ord = DIAS.map(function (d) { return d.v; });
    var ordenados = dias.slice().sort(function (a, b) { return ord.indexOf(a) - ord.indexOf(b); });
    var partes = [];
    var inicio = ordenados[0];
    var prev = ordenados[0];
    for (var i = 1; i <= ordenados.length; i++) {
      var d = ordenados[i];
      if (d === prev + 1) { prev = d; continue; }
      partes.push(inicio === prev ? DIAS[inicio].l : DIAS[inicio].l + '-' + DIAS[prev].l);
      inicio = prev = d;
    }
    return partes.join(', ');
  }

  // ------------------------------------------------------------------
  // Carga de datos
  // ------------------------------------------------------------------
  async function cargarMuelles() {
    try {
      var data = await SupabaseApp.api('/api/crud/muelles?limit=500');
      muelles = data.datos || [];
    } catch (e) {
      muelles = [];
      console.error('Error cargando muelles:', e);
    }
  }

  function nombreMuelle(id) {
    var m = muelles.find(function (x) { return x.id === id; });
    return m ? m.nombre : id;
  }

  async function cargarRegistros() {
    var tbody = document.getElementById('moduloTbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + t('Cargando...') + '</td></tr>';
    try {
      var data = await SupabaseApp.api('/api/crud/disponibilidad_muelles?limit=1000');
      registros = data.datos || [];
      agrupar();
      pintarFilas();
    } catch (err) {
      console.error('Error cargando disponibilidad:', err);
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + t('Error al cargar') + ' · ' + esc(mensajeErrorAmigable(err)) + '</td></tr>';
    }
  }

  // Agrupa las filas por muelle + horario + activo, juntando los dias
  function agrupar() {
    var mapa = {};
    registros.forEach(function (r) {
      var clave = r.muelle_id + '|' + r.hora_inicio + '|' + r.hora_fin + '|' + (r.activo ? '1' : '0');
      if (!mapa[clave]) {
        mapa[clave] = { muelle_id: r.muelle_id, hora_inicio: r.hora_inicio.slice(0, 5), hora_fin: r.hora_fin.slice(0, 5), activo: r.activo, dias: [], ids: [] };
      }
      mapa[clave].dias.push(r.dia_semana);
      mapa[clave].ids.push(r.id);
    });
    grupos = Object.keys(mapa).map(function (k) { return mapa[k]; });
  }

  function pintarFilas(datos) {
    var tbody = document.getElementById('moduloTbody');
    var thead = document.getElementById('moduloThead');
    var lista = datos || grupos;

    thead.innerHTML = '<tr>'
      + '<th>' + t('Muelle') + '</th>'
      + '<th>' + t('Dias') + '</th>'
      + '<th>' + t('Hora inicio') + '</th>'
      + '<th>' + t('Hora fin') + '</th>'
      + '<th>' + t('Activo') + '</th>'
      + '<th>' + t('Acciones') + '</th>'
      + '</tr>';

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + t('No hay registros') + '</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(function (g) {
      var diasTxt = formatearDias(g.dias);
      var activoHtml = g.activo
        ? '<span class="badge badge-completed">' + t('Si') + '</span>'
        : '<span class="badge badge-cancelled">' + t('No') + '</span>';
      return '<tr>'
        + '<td><strong>' + esc(nombreMuelle(g.muelle_id)) + '</strong></td>'
        + '<td><span class="badge-dias">' + esc(diasTxt) + '</span></td>'
        + '<td>' + esc(g.hora_inicio) + '</td>'
        + '<td>' + esc(g.hora_fin) + '</td>'
        + '<td>' + activoHtml + '</td>'
        + '<td class="acciones-cell">'
        + '<button class="action-button btn-edit" onclick="window.Disponibilidad.editar(\'' + g.ids[0] + '\')">✏️ ' + t('Editar') + '</button>'
        + '<button class="action-button btn-del" onclick="window.Disponibilidad.eliminar(\'' + g.ids[0] + '\')">🗑️ ' + t('Eliminar') + '</button>'
        + '</td></tr>';
    }).join('');

    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  // ------------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------------
  function pintarCheckboxes(diasSeleccionados) {
    var box = document.getElementById('diasBox');
    box.innerHTML = DIAS.map(function (d) {
      var sel = diasSeleccionados.indexOf(d.v) !== -1;
      return '<label class="' + (sel ? 'sel' : '') + '">'
        + '<input type="checkbox" value="' + d.v + '"' + (sel ? ' checked' : '') + '>'
        + d.l + '</label>';
    }).join('');
    // resaltar seleccionados
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (cb) {
      cb.addEventListener('change', function () {
        cb.closest('label').classList.toggle('sel', cb.checked);
      });
    });
  }

  function diasMarcados() {
    return Array.prototype.slice.call(document.querySelectorAll('#diasBox input:checked')).map(function (c) { return parseInt(c.value, 10); });
  }

  function abrirModal(grupo) {
    editando = grupo || null;
    document.getElementById('crudModalTitulo').textContent = grupo ? t('Editar horario') : t('Nuevo horario');

    // Muelle select
    var mSel = document.getElementById('f_muelle_id');
    mSel.innerHTML = '<option value="">\u2014 ' + t('Selecciona un muelle') + ' \u2014</option>'
      + muelles.map(function (m) {
        return '<option value="' + m.id + '"' + (grupo && grupo.muelle_id === m.id ? ' selected' : '') + '>' + esc(m.nombre) + '</option>';
      }).join('');

    pintarCheckboxes(grupo ? grupo.dias.slice() : []);
    document.getElementById('f_hora_inicio').value = grupo ? grupo.hora_inicio : '';
    document.getElementById('f_hora_fin').value = grupo ? grupo.hora_fin : '';
    document.getElementById('f_activo').checked = grupo ? grupo.activo : true;
    document.getElementById('f_id').value = grupo ? grupo.ids[0] : '';

    document.getElementById('crudModal').classList.add('active');
    if (window.GlobalHeader) window.GlobalHeader.translatePage();
  }

  function cerrarModal() {
    document.getElementById('crudModal').classList.remove('active');
    editando = null;
  }

  // ------------------------------------------------------------------
  // Guardar: borra el grupo y crea un registro por dia marcado
  // ------------------------------------------------------------------
  async function guardar(e) {
    e.preventDefault();
    var muelleId = document.getElementById('f_muelle_id').value;
    var dias = diasMarcados();
    if (!muelleId) { notificar(t('Selecciona un muelle.'), 'error'); return; }
    if (!dias.length) { notificar(t('Marca al menos un dia.'), 'error'); return; }
    var horaInicio = document.getElementById('f_hora_inicio').value;
    var horaFin = document.getElementById('f_hora_fin').value;
    var activo = document.getElementById('f_activo').checked;
    if (!horaInicio || !horaFin) { notificar(t('Indica hora de inicio y fin.'), 'error'); return; }
    if (horaInicio >= horaFin) { notificar(t('La hora de fin debe ser posterior al inicio.'), 'error'); return; }

    var btn = document.getElementById('crudGuardar');
    btn.disabled = true;
    try {
      // Si editando, borrar todas las filas del grupo
      if (editando) {
        for (var i = 0; i < editando.ids.length; i++) {
          await SupabaseApp.api('/api/crud/disponibilidad_muelles/' + editando.ids[i], { method: 'DELETE' });
        }
      }
      // Insertar un registro por dia marcado
      for (var j = 0; j < dias.length; j++) {
        await SupabaseApp.api('/api/crud/disponibilidad_muelles', {
          method: 'POST',
          body: { muelle_id: muelleId, dia_semana: dias[j], hora_inicio: horaInicio, hora_fin: horaFin, activo: activo }
        });
      }
      cerrarModal();
      await cargarRegistros();
      notificar(t('Operacion completada'), 'success');
    } catch (err) {
      console.error('Error guardando:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function eliminar(id) {
    // Encontrar el grupo que contiene ese id
    var grupo = grupos.find(function (g) { return g.ids.indexOf(id) !== -1; });
    if (!grupo) return;
    if (!confirm(t('Seguro que deseas eliminar este horario y todos sus dias?'))) return;
    try {
      for (var i = 0; i < grupo.ids.length; i++) {
        await SupabaseApp.api('/api/crud/disponibilidad_muelles/' + grupo.ids[i], { method: 'DELETE' });
      }
      await cargarRegistros();
      notificar(t('Registro eliminado'), 'success');
    } catch (err) {
      console.error('Error eliminando:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    }
  }

  // ------------------------------------------------------------------
  // Filtro
  // ------------------------------------------------------------------
  function filtrar(texto) {
    var q = (texto || '').toLowerCase();
    if (!q) { pintarFilas(); return; }
    var filtrados = grupos.filter(function (g) {
      return nombreMuelle(g.muelle_id).toLowerCase().indexOf(q) !== -1
        || formatearDias(g.dias).toLowerCase().indexOf(q) !== -1
        || g.hora_inicio.indexOf(q) !== -1
        || g.hora_fin.indexOf(q) !== -1;
    });
    pintarFilas(filtrados);
  }

  // ------------------------------------------------------------------
  // Inicializacion
  // ------------------------------------------------------------------
  async function init() {
    if (!window.Auth || !Auth.isAuthenticated()) { window.location.href = '/'; return; }
    if (window.Permisos) { try { await Permisos.refresh(); } catch (e) {} }
    if (window.Permisos && !Permisos.puedeVerModulo('disponibilidad_muelles')) {
      document.getElementById('moduloAviso').style.display = 'block';
      document.getElementById('moduloAviso').textContent = t('No tienes permisos.');
      document.getElementById('moduloAviso').className = 'modulo-aviso warning';
      document.getElementById('btnNuevo').style.display = 'none';
      return;
    }

    document.getElementById('btnNuevo').addEventListener('click', function () { abrirModal(null); });
    document.getElementById('crudModalClose').addEventListener('click', cerrarModal);
    document.getElementById('crudCancelar').addEventListener('click', cerrarModal);
    document.getElementById('crudForm').addEventListener('submit', guardar);
    document.getElementById('busqueda').addEventListener('input', function (ev) { filtrar(ev.target.value); });
    document.getElementById('crudModal').addEventListener('click', function (ev) {
      if (ev.target.id === 'crudModal') cerrarModal();
    });

    await cargarMuelles();
    await cargarRegistros();
  }

  window.Disponibilidad = {
    editar: function (id) {
      var grupo = grupos.find(function (g) { return g.ids.indexOf(id) !== -1; });
      if (grupo) abrirModal(grupo);
    },
    eliminar: eliminar
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
