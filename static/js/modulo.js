// =====================================================================
// modulo.js - CRUD genérico de módulos de configuración EMESA DOCK
// =====================================================================
// Lee el módulo desde la URL (?tabla=...), carga los datos desde
// /api/crud/<tabla> y permite crear, editar y eliminar registros.

(function () {
  'use strict';

  const t = (key) => (window.GlobalHeader && window.GlobalHeader.translate)
                     ? window.GlobalHeader.translate(key) : key;

  const params = new URLSearchParams(window.location.search);
  const nombreTabla = params.get('tabla');
  const modulo = MODULOS[nombreTabla];

  let registros = [];          // datos actuales (para filtro)
  let referencias = {};        // id -> { display } por tabla de referencia
  let filasReferencia = {};    // tabla -> filas crudas (para filtrar FK dependientes)
  let editandoId = null;       // id del registro en edición (null = nuevo)
  let opcionesPorProveedor = {}; // proveedor_id -> Set(ids) para campos 'porProveedor'
  let filtroTexto = '';        // texto del buscador
  let estadoOrden = null;      // { campo, dir } para ordenar (null = orden del servidor)
  let estadoAgrupar = '';      // campo por el que agrupar ('' = sin agrupar)

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function esc(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  function fmtFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  }

  function aDatetimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Normaliza texto para búsquedas/ordenaciones: minúsculas y sin acentos
  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  // Resuelve en cadena el valor de un campo virtual 'via'.
  // Soporta un solo paso (via: {campo, tabla, columna}) y varios pasos
  // (via: [{campo, tabla, columna}, {tabla, columna}, ...]) para resolver
  // p. ej. la Planta de un muelle: muelle -> nave -> planta.
  function idVia(campo, fila) {
    if (!campo.via || !fila) return null;
    const pasos = Array.isArray(campo.via) ? campo.via : [campo.via];
    let idActual = fila[pasos[0].campo];
    for (const paso of pasos) {
      const filaPaso = (filasReferencia[paso.tabla] || []).find(f => f.id === idActual);
      if (!filaPaso) return null;
      idActual = filaPaso[paso.columna];
    }
    return idActual;
  }

  // Columnas visibles en la tabla (excluye filtros del formulario)
  function columnasTabla() {
    return (modulo.campos || []).filter(c => c.enTabla !== false);
  }

  // Valor plano (sin HTML) de una celda para ordenar/agrupar
  function valorOrden(campo, fila) {
    if (campo.via && fila) {
      const mapa = referencias[campo.ref.tabla];
      const idFinal = idVia(campo, fila);
      return (idFinal != null && mapa && mapa[idFinal]) ? String(mapa[idFinal]) : '';
    }
    const valor = fila ? fila[campo.campo] : null;
    if (campo.tipo === 'fk') {
      const mapa = referencias[campo.ref.tabla];
      return (mapa && mapa[valor]) ? String(mapa[valor]) : (valor ? String(valor) : '');
    }
    if (campo.tipo === 'boolean') return valor ? '1' : '0';
    return (valor == null) ? '' : String(valor);
  }

  // Comparador de filas según la columna ordenada (estadoOrden)
  function ordenFilas(filaA, filaB) {
    if (!estadoOrden) return 0;
    const col = (modulo.campos || []).find(c => c.campo === estadoOrden.campo);
    if (!col) return 0;
    const dir = estadoOrden.dir;
    const a = valorOrden(col, filaA);
    const b = valorOrden(col, filaB);
    if (a === b) return 0;
    const na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && !isNaN(na) && !isNaN(nb)) return na < nb ? -dir : dir;
    const cmp = String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
    return cmp === 0 ? 0 : (cmp < 0 ? -dir : dir);
  }

  // Resuelve el valor de una celda para mostrarlo en la tabla.
  // 'fila' es el registro completo; soporta campos virtuales 'via' que
  // resuelven su FK a traves de otra relacion (p. ej. Planta via Nave).
  function valorEtiqueta(campo, fila) {
    const valor = fila ? fila[campo.campo] : null;

    // Campo virtual: p. ej. la Planta de un muelle (muelle -> nave -> planta)
    if (campo.via && fila) {
      const mapa = referencias[campo.ref.tabla];
      const idFinal = idVia(campo, fila);
      return (idFinal != null && mapa && mapa[idFinal]) ? esc(mapa[idFinal]) : '—';
    }

    if (campo.tipo === 'fk') {
      const mapa = referencias[campo.ref.tabla];
      return (mapa && mapa[valor]) ? esc(mapa[valor]) : (valor ? esc(valor.slice(0, 8)) : '—');
    }
    if (campo.tipo === 'boolean') {
      return valor ? '<span class="badge badge-completed">' + t('Sí') + '</span>'
                   : '<span class="badge badge-cancelled">' + t('No') + '</span>';
    }
    if (valor == null || valor === '') return '—';
    return esc(valor);
  }

  // ------------------------------------------------------------------
  // Carga de referencias (tablas FK)
  // ------------------------------------------------------------------
  async function cargarReferencias() {
    const tablas = new Set();
    (modulo.campos || []).forEach(c => {
      if (c.tipo === 'fk') tablas.add(c.ref.tabla);
    });

    await Promise.all([...tablas].map(async (tabla) => {
      try {
        const data = await SupabaseApp.api(`/api/crud/${tabla}?limit=1000`);
        const campoRef = modulo.campos.find(c => c.tipo === 'fk' && c.ref.tabla === tabla);
        const mapa = {};
        (data.datos || []).forEach(r => {
          let texto = campoRef ? r[campoRef.ref.campo] : r.id;
          // Mostrar también un campo extra si está definido (p. ej. apellidos)
          if (campoRef && campoRef.ref.extra) {
            texto = `${texto || ''} ${r[campoRef.ref.extra] || ''}`.trim();
          }
          mapa[r.id] = texto || r.id;
        });
        referencias[tabla] = mapa;
        filasReferencia[tabla] = data.datos || [];
      } catch (e) {
        console.warn(`[Modulo] No se pudieron cargar referencias de ${tabla}:`, e);
        referencias[tabla] = {};
      }
    }));

    // Usuarios de Supabase Auth (campo auth-user del módulo perfiles)
    if ((modulo.campos || []).some(c => c.tipo === 'auth-user')) {
      try {
        const data = await SupabaseApp.api('/api/auth-users');
        const mapa = {};
        (data.usuarios || []).forEach(u => {
          const yaTiene = (data.con_perfil || []).includes(u.id);
          mapa[u.id] = u.email + (yaTiene ? ' (' + t('ya tiene perfil') + ')' : '');
        });
        referencias.__auth_users__ = mapa;
      } catch (e) {
        console.warn('[Modulo] No se pudieron cargar usuarios de Auth:', e);
        referencias.__auth_users__ = {};
      }
    }
  }

  // ------------------------------------------------------------------
  // Campos FK dependientes (cascada: organización -> planta -> ...)
  // ------------------------------------------------------------------
  // Un campo con 'dependeDe: <campoPadre>' filtra sus opciones por el valor
  // del campo padre: solo muestra las filas de la tabla referenciada cuya
  // columna con el nombre del padre coincide con el valor seleccionado.
  function opcionesFK(campo, valor, valorPadre) {
    const mapa = referencias[campo.ref.tabla] || {};
    let entradas = Object.entries(mapa);

    if (campo.dependeDe && valorPadre) {
      const filas = filasReferencia[campo.ref.tabla] || [];
      const validos = new Set(
        filas
          .filter(f => f[campo.dependeDe] != null && String(f[campo.dependeDe]) === String(valorPadre))
          .map(f => f.id)
      );
      entradas = entradas.filter(([k]) => validos.has(k));
    }

    const opciones = entradas
      .map(([k, v]) => `<option value="${k}" ${String(valor) === String(k) ? 'selected' : ''}>${esc(v)}</option>`)
      .join('');
    return `<option value="">—</option>${opciones}`;
  }

  // ¿el campo depende (directa o transitivamente) del campo llamado nombrePadre?
  function dependeTransitivoDe(campo, nombrePadre) {
    if (!campo || !campo.dependeDe) return false;
    if (campo.dependeDe === nombrePadre) return true;
    const abuelo = (modulo.campos || []).find(c => c.campo === campo.dependeDe);
    return abuelo ? dependeTransitivoDe(abuelo, nombrePadre) : false;
  }

  // Reconstruye las opciones de un select dependiente según el valor actual de su padre
  function actualizarCampoDependiente(campo) {
    const padre = document.getElementById(`f_${campo.dependeDe}`);
    const hijo = document.getElementById(`f_${campo.campo}`);
    if (!hijo) return;
    const valorActual = hijo.value;
    const valorPadre = padre ? padre.value : '';
    hijo.innerHTML = opcionesFK(campo, valorActual, valorPadre);
    // Si el valor actual ya no está entre las opciones, limpiarlo
    if (valorActual && !Array.from(hijo.options).some(o => o.value === valorActual)) {
      hijo.value = '';
    }
  }

  // Al cambiar un campo, actualiza todos los que dependen de él (recursivo)
  function actualizarDependientesDe(nombrePadre) {
    (modulo.campos || []).forEach(c => {
      if (c.tipo === 'fk' && c.dependeDe && dependeTransitivoDe(c, nombrePadre)) {
        actualizarCampoDependiente(c);
      }
    });
  }

  // Inicializa los selects dependientes según el valor actual de sus padres
  function aplicarDependencias() {
    (modulo.campos || []).forEach(c => {
      if (c.tipo === 'fk' && c.dependeDe) actualizarCampoDependiente(c);
    });
  }

  // ------------------------------------------------------------------
  // Campo 'porProveedor': limita sus opciones a las de la API de un padre
  // (p. ej. en proveedor_muelles, la Planta se limita a las plantas de los
  // usuarios del proveedor seleccionado, para evitar inconsistencias).
  // ------------------------------------------------------------------
  async function cargarOpcionesPorProveedor(campo) {
    const parentSel = document.getElementById(`f_${campo.porProveedor}`);
    const provId = parentSel ? parentSel.value : '';
    const hijo = document.getElementById(`f_${campo.campo}`);
    if (!hijo) return;
    if (!provId) {
      hijo.innerHTML = '<option value="">—</option>';
      actualizarDependientesDe(campo.campo);
      return;
    }
    try {
      const url = (campo.opcionesPorProveedorUrl || '') + encodeURIComponent(provId);
      const data = await SupabaseApp.api(url);
      const ids = (data.plantas || data.opciones || []).map(p => p.id);
      opcionesPorProveedor[provId] = new Set(ids);
      const mapa = referencias[campo.ref.tabla] || {};
      const opciones = ids.map(id => {
        const nombre = mapa[id] || id;
        return `<option value="${id}">${esc(nombre)}</option>`;
      }).join('');
      hijo.innerHTML = '<option value="">—</option>' + opciones;
      actualizarDependientesDe(campo.campo);
    } catch (e) {
      console.warn('[Modulo] Error cargando opciones por proveedor:', e);
      hijo.innerHTML = '<option value="">—</option>';
    }
  }

  // ------------------------------------------------------------------
  // Carga de datos
  // ------------------------------------------------------------------
  async function cargarDatos() {
    const tbody = document.getElementById('moduloTbody');
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">${t('Cargando...')}</td></tr>`;

    try {
      const data = await SupabaseApp.api(`/api/crud/${nombreTabla}?order=${encodeURIComponent(modulo.orderBy || 'id')}`);
      registros = data.datos || [];

      renderLista();
      if (window.GlobalHeader) window.GlobalHeader.translatePage();

      // Botón nuevo
      const btnNuevo = document.getElementById('btnNuevo');
      btnNuevo.style.display = (modulo.crear === false || modulo.soloLectura) ? 'none' : 'inline-block';
    } catch (err) {
      console.error('❌ Error cargando módulo:', err);
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">${t('Error al cargar')} · ${esc(err.message)}</td></tr>`;
    }
  }

  function filaHTML(r, columnas) {
    // Identidad del registro: id normal o claves compuestas (tablas sin id)
    const idParam = modulo.clave
      ? 'k:' + encodeURIComponent(JSON.stringify(modulo.clave.reduce((acc, c) => { acc[c] = r[c]; return acc; }, {})))
      : r.id;
    const acciones = modulo.soloLectura ? '' : `
      ${modulo.clave ? '' : `<button class="action-button btn-edit" onclick="window.Modulo.editar('${r.id}')">✏️ ${t('Editar')}</button>`}
      <button class="action-button btn-del" onclick="window.Modulo.eliminar('${idParam}')">🗑️ ${t('Eliminar')}</button>
    `;
    return `
      <tr>
        ${columnas.map(c => `<td>${valorEtiqueta(c, r)}</td>`).join('')}
        <td class="acciones-cell">${acciones}</td>
      </tr>
    `;
  }

  // Filtra por el buscador y aplica el orden activo
  function registrosVisibles() {
    let lista = registros;
    const q = normalizar(filtroTexto);
    if (q) {
      const columnas = columnasTabla();
      lista = lista.filter(r => columnas.some(c => normalizar(valorEtiqueta(c, r)).includes(q)));
    }
    if (estadoOrden) lista = lista.slice().sort(ordenFilas);
    return lista;
  }

  // Renderiza cabecera (ordenable) + cuerpo con agrupación opcional
  function renderLista() {
    const tbody = document.getElementById('moduloTbody');
    const thead = document.getElementById('moduloThead');
    const columnas = columnasTabla();
    const visibles = registrosVisibles();
    const agruparCampo = estadoAgrupar ? (modulo.campos || []).find(c => c.campo === estadoAgrupar) : null;

    // Cabecera con ordenación por columna (clic alterna ▲/▼)
    thead.innerHTML = `<tr>
      ${columnas.map(c => {
        const activo = estadoOrden && estadoOrden.campo === c.campo;
        const flecha = activo ? `<span class="orden-flecha">${estadoOrden.dir === 1 ? '▲' : '▼'}</span>` : '';
        return `<th class="th-orden${activo ? ' th-orden-activo' : ''}" data-campo="${esc(c.campo)}" data-original-text="${c.etiqueta}">${t(c.etiqueta)}${flecha}</th>`;
      }).join('')}
      <th>${t('Acciones')}</th>
    </tr>`;

    if (!visibles.length) {
      tbody.innerHTML = `<tr><td colspan="${columnas.length + 1}" class="empty-state">${t('No hay registros')}</td></tr>`;
      return;
    }

    if (!agruparCampo) {
      tbody.innerHTML = visibles.map(r => filaHTML(r, columnas)).join('');
      return;
    }

    // Agrupación por el valor de una columna (con total por grupo)
    let html = '';
    let grupoActual = null;
    let filasGrupo = [];
    const cerrarGrupo = () => {
      if (!filasGrupo.length) return;
      const label = valorEtiqueta(agruparCampo, filasGrupo[0]).replace(/<[^>]*>/g, '') || '—';
      html += `<tr class="grupo-fila"><td colspan="${columnas.length + 1}">${esc(label)} <span class="grupo-count">(${filasGrupo.length})</span></td></tr>`;
      filasGrupo.forEach(f => html += filaHTML(f, columnas));
    };
    for (const r of visibles) {
      const v = valorOrden(agruparCampo, r);
      if (grupoActual !== v) { cerrarGrupo(); grupoActual = v; filasGrupo = []; }
      filasGrupo.push(r);
    }
    cerrarGrupo();
    tbody.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Modal de formulario
  // ------------------------------------------------------------------
  function abrirModal(registro) {
    editandoId = registro ? registro.id : null;
    document.getElementById('crudModalTitulo').textContent =
      registro ? `${t('Editar')}: ${modulo.titulo}` : `${t('Nuevo registro')}: ${modulo.titulo}`;

    const form = document.getElementById('crudForm');
    form.innerHTML = (modulo.campos || []).map(c => campoHTML(c, registro ? registro[c.campo] : undefined, !registro)).join('');

    // Inicializar la cascada de selects dependientes (org -> planta -> ...)
    aplicarDependencias();

    // Inicializar campos 'porProveedor' (opciones restringidas por el padre)
    (modulo.campos || []).forEach(c => {
      if (c.porProveedor) cargarOpcionesPorProveedor(c);
    });

    document.getElementById('crudModal').classList.add('active');
  }

  function campoHTML(campo, valor, esCrear) {
    // Campos 'soloCrear' (p. ej. el id de perfil) solo se muestran al crear
    if (campo.soloCrear && !esCrear) return '';
    // Campos virtuales (solo lectura, derivados de otras relaciones) no tienen input
    if (campo.virtual) return '';

    const req = campo.requerido ? 'required' : '';
    const ancho = (campo.tipo === 'textarea' || campo.tipo === 'text') ? 'full' : '';

    let input = '';
    const id = `f_${campo.campo}`;

    switch (campo.tipo) {
      case 'textarea':
        input = `<textarea id="${id}" name="${campo.campo}" rows="3" ${req}>${esc(valor ?? '')}</textarea>`;
        break;
      case 'number':
        input = `<input type="number" id="${id}" name="${campo.campo}" value="${esc(valor ?? '')}" step="any" ${req}>`;
        break;
      case 'boolean':
        input = `<input type="checkbox" id="${id}" name="${campo.campo}" ${valor ? 'checked' : ''}>`;
        break;
      case 'date':
        input = `<input type="date" id="${id}" name="${campo.campo}" value="${esc(valor ? String(valor).slice(0, 10) : '')}" ${req}>`;
        break;
      case 'datetime-local':
        input = `<input type="datetime-local" id="${id}" name="${campo.campo}" value="${aDatetimeLocal(valor)}" ${req}>`;
        break;
      case 'time':
        input = `<input type="time" id="${id}" name="${campo.campo}" value="${esc(valor ? String(valor).slice(0, 5) : '')}" ${req}>`;
        break;
      case 'select': {
        const opciones = (campo.opciones || []).map(op => {
          if (typeof op === 'object') {
            return `<option value="${op.v}" ${String(valor) === String(op.v) ? 'selected' : ''}>${esc(op.l)}</option>`;
          }
          return `<option value="${esc(op)}" ${String(valor) === String(op) ? 'selected' : ''}>${esc(op)}</option>`;
        }).join('');
        input = `<select id="${id}" name="${campo.campo}" ${req}>${opciones}</select>`;
        break;
      }
      case 'fk': {
        input = `<select id="${id}" name="${campo.campo}" ${req}>${opcionesFK(campo, valor, null)}</select>`;
        if (Object.keys(referencias[campo.ref.tabla] || {}).length === 0 && campo.requerido) {
          input += `<small style="color:#856404;display:block;margin:-8px 0 10px 0;">${t('Sin datos disponibles. Créalo antes en su módulo.')}</small>`;
        }
        break;
      }
      case 'auth-user': {
        const mapa = referencias.__auth_users__ || {};
        const opciones = Object.entries(mapa)
          .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
          .join('');
        input = `<select id="${id}" name="${campo.campo}" ${req}>
          <option value="">— ${t('Selecciona un usuario')} —</option>${opciones}</select>`;
        break;
      }
      default: // text
        input = `<input type="text" id="${id}" name="${campo.campo}" value="${esc(valor ?? '')}" ${req}>`;
    }

    return `
      <div class="crud-field ${ancho}">
        <label for="${id}" data-original-text="${campo.etiqueta}">${t(campo.etiqueta)}</label>
        ${input}
      </div>
    `;
  }

  function cerrarModal() {
    document.getElementById('crudModal').classList.remove('active');
    editandoId = null;
  }

  // ------------------------------------------------------------------
  // Guardar / Eliminar
  // ------------------------------------------------------------------
  async function guardar(e) {
    e.preventDefault();
    const form = document.getElementById('crudForm');
    const formData = new FormData(form);
    const cuerpo = {};

    (modulo.campos || []).forEach(c => {
      // Campos 'soloFiltro' sirven solo para filtrar/cascada en el formulario
      // (p. ej. elegir Planta para filtrar las Naves) y NO se guardan en la BD.
      if (c.soloFiltro) return;
      const input = document.getElementById(`f_${c.campo}`);
      if (!input) return;

      if (c.tipo === 'boolean') {
        cuerpo[c.campo] = input.checked;
      } else if (c.tipo === 'number') {
        const v = input.value.trim();
        cuerpo[c.campo] = v === '' ? null : Number(v);
      } else if (c.tipo === 'fk' || c.tipo === 'select') {
        cuerpo[c.campo] = input.value === '' ? null : input.value;
      } else {
        cuerpo[c.campo] = input.value.trim() === '' ? null : input.value;
      }
    });

    try {
      if (editandoId) {
        await SupabaseApp.api(`/api/crud/${nombreTabla}/${editandoId}`, { method: 'PUT', body: cuerpo });
      } else {
        await SupabaseApp.api(`/api/crud/${nombreTabla}`, { method: 'POST', body: cuerpo });
      }
      cerrarModal();
      await cargarDatos();
      notificar(t('Operación completada con éxito'), 'success');
    } catch (err) {
      console.error('❌ Error guardando:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    }
  }

  async function eliminar(idParam) {
    if (!confirm(t('¿Seguro que deseas eliminar este registro?'))) return;
    try {
      let url = `/api/crud/${nombreTabla}`;
      const opts = { method: 'DELETE' };

      if (idParam && String(idParam).startsWith('k:')) {
        // Clave compuesta: pasar los valores en la query string
        const claves = JSON.parse(decodeURIComponent(String(idParam).slice(2)));
        const qs = Object.entries(claves).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        url += `?${qs}`;
      } else {
        url += `/${idParam}`;
      }

      await SupabaseApp.api(url, opts);
      await cargarDatos();
      notificar(t('Registro eliminado'), 'success');
    } catch (err) {
      console.error('❌ Error eliminando:', err);
      notificar(t('Error') + ': ' + mensajeErrorAmigable(err), 'error');
    }
  }

  // ------------------------------------------------------------------
  // Mensajes de error amigables (mapa de códigos PostgREST)
  // ------------------------------------------------------------------
  function mensajeErrorAmigable(err) {
    const msg = (err && err.message) || '';
    if (msg.includes('23505') || msg.includes('duplicate key')) {
      return t('Ya existe un registro con los mismos datos (clave duplicada).');
    }
    if (msg.includes('23503') || msg.includes('foreign key')) {
      return t('No se puede: el registro está siendo usado por otros datos.');
    }
    if (msg.includes('23502') || msg.includes('not-null')) {
      return t('Faltan campos obligatorios (o una lista de la que depende está vacía).');
    }
    if (msg.includes('42501') || msg.includes('row-level security')) {
      return t('No tienes permisos para esta operación (RLS).');
    }
    const extraido = msg.match(/'message':\s*'([^']+)'/);
    if (extraido) return extraido[1];
    return msg || t('Error');
  }

  // ------------------------------------------------------------------
  // Notificaciones y filtro
  // ------------------------------------------------------------------
  function notificar(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `mensaje-temporal ${tipo}`;
    div.textContent = mensaje;
    document.body.appendChild(div);
    requestAnimationFrame(() => div.classList.add('mostrar'));
    setTimeout(() => {
      div.classList.remove('mostrar');
      setTimeout(() => div.remove(), 350);
    }, 2600);
  }

  function mostrarAviso(texto, tipo) {
    const aviso = document.getElementById('moduloAviso');
    if (!aviso) return;
    if (!texto) { aviso.style.display = 'none'; return; }
    aviso.textContent = texto;
    aviso.className = 'modulo-aviso ' + (tipo || 'info');
    aviso.style.display = 'block';
  }

  function filtrar(texto) {
    filtroTexto = texto || '';
    renderLista();
  }

  // ------------------------------------------------------------------
  // Inicialización
  // ------------------------------------------------------------------
  async function init() {
    if (!modulo) {
      document.getElementById('moduloCargando').innerHTML =
        `<td colspan="10" class="empty-state">${t('Módulo no encontrado')}</td>`;
      return;
    }

    // Refrescar permisos del usuario (importante para sesiones antiguas)
    if (window.Permisos) {
      try { await Permisos.refresh(); } catch (e) { /* sin sesión */ }
    }

    // Guard de permisos: ocultar módulos no autorizados (sin borrar funcionalidad)
    if (window.Permisos && !Permisos.puedeVerModulo(nombreTabla)) {
      document.getElementById('moduloTitulo').innerHTML = `🔒 ${t('Sin permisos')}`;
      document.getElementById('moduloCargando').innerHTML =
        `<td colspan="10" class="empty-state">${t('No tienes permisos para ver este módulo.')}</td>`;
      const toolbar = document.querySelector('.modulo-toolbar');
      if (toolbar) toolbar.style.display = 'none';
      return;
    }

    document.title = `${modulo.titulo} - EMESA DOCK`;
    document.getElementById('moduloTitulo').innerHTML = `${modulo.icono} ${t(modulo.titulo)}`;

    // Actualizar el título del header global con el nombre del módulo
    if (window.GlobalHeader && window.GlobalHeader.updateTitle) {
      window.GlobalHeader.updateTitle(modulo.titulo);
    }

    // Aviso para módulos de solo lectura
    if (modulo.soloLectura) {
      mostrarAviso(t('Módulo de solo lectura: no se pueden crear, editar ni eliminar registros.'), 'info');
    }

    // Asegurar sesión (si no hay, el loginModal en dashboard lo haría; aquí redirigimos)
    if (!window.Auth || !Auth.isAuthenticated()) {
      window.location.href = '/';
      return;
    }

    // Eventos
    document.getElementById('btnNuevo').addEventListener('click', () => abrirModal(null));
    document.getElementById('crudModalClose').addEventListener('click', cerrarModal);
    document.getElementById('crudCancelar').addEventListener('click', cerrarModal);
    document.getElementById('crudForm').addEventListener('submit', guardar);

    // Buscador optimizado (debounce: evita re-render en cada pulsación)
    let timerBusqueda = null;
    document.getElementById('busqueda').addEventListener('input', (e) => {
      clearTimeout(timerBusqueda);
      timerBusqueda = setTimeout(() => filtrar(e.target.value), 150);
    });

    // Ordenar alfabéticamente al hacer clic en una columna (alterna ▲/▼)
    document.getElementById('moduloThead').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-campo]');
      if (!th) return;
      const campo = th.dataset.campo;
      if (estadoOrden && estadoOrden.campo === campo) {
        estadoOrden.dir = estadoOrden.dir === 1 ? -1 : 1;
      } else {
        estadoOrden = { campo, dir: 1 };
      }
      renderLista();
    });

    // Agrupar por columna (select de la barra de herramientas)
    const selAgrupar = document.getElementById('agruparPor');
    if (selAgrupar) {
      const columnas = columnasTabla();
      selAgrupar.innerHTML = '<option value="">' + t('Sin agrupar') + '</option>'
        + columnas.map(c => `<option value="${esc(c.campo)}">${t(c.etiqueta)}</option>`).join('');
      selAgrupar.addEventListener('change', (e) => {
        estadoAgrupar = e.target.value || '';
        renderLista();
      });
    }

    // Cascada de selects dependientes: al cambiar cualquier select, actualizar sus descendientes
    document.getElementById('crudForm').addEventListener('change', (e) => {
      const sel = e.target;
      if (!sel || sel.tagName !== 'SELECT') return;
      const campo = (modulo.campos || []).find(c => `f_${c.campo}` === sel.id);
      if (campo) actualizarDependientesDe(campo.campo);
      // Si el campo cambiado es el padre de un campo 'porProveedor', recargar sus opciones
      (modulo.campos || []).forEach(c => {
        if (c.porProveedor && c.porProveedor === campo.campo) cargarOpcionesPorProveedor(c);
      });
    });

    // Clic en el fondo para cerrar
    document.getElementById('crudModal').addEventListener('click', (e) => {
      if (e.target.id === 'crudModal') cerrarModal();
    });

    await cargarReferencias();
    await cargarDatos();
  }

  window.Modulo = {
    editar: (id) => abrirModal(registros.find(r => r.id === id)),
    eliminar
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
