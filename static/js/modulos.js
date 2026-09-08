// =====================================================================
// modulos.js - Registro de modulos de configuracion EMESA DOCK
// =====================================================================
// Esquema simplificado: plantas -> naves -> muelles

const MODULOS = {
  // ================= JERARQUIA =================
  plantas: {
    titulo: 'Plantas',
    icono: '🏭',
    descripcion: 'Plantas de produccion',
    tabla: 'plantas',
    orderBy: 'nombre',
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true },
      { campo: 'activo', etiqueta: 'Activo', tipo: 'boolean' }
    ]
  },

  naves: {
    titulo: 'Naves',
    icono: '🏗️',
    descripcion: 'Naves dentro de cada planta',
    tabla: 'naves',
    orderBy: 'nombre',
    campos: [
      { campo: 'planta_id', etiqueta: 'Planta', tipo: 'fk', ref: { tabla: 'plantas', campo: 'nombre' }, requerido: true },
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true },
      { campo: 'activo', etiqueta: 'Activo', tipo: 'boolean' }
    ]
  },

  muelles: {
    titulo: 'Muelles',
    icono: '🚛',
    descripcion: 'Muelles de carga/descarga por nave',
    tabla: 'muelles',
    orderBy: 'nombre',
    campos: [
      // Planta: en el formulario es solo filtro (cascada) y NO se guarda.
      // En el listado se muestra resuelta via la nave (muelles.nave_id -> naves.planta_id).
      { campo: 'planta_id', etiqueta: 'Planta', tipo: 'fk', ref: { tabla: 'plantas', campo: 'nombre' }, via: { campo: 'nave_id', tabla: 'naves', columna: 'planta_id' }, requerido: true, soloFiltro: true, enTabla: true },
      { campo: 'nave_id', etiqueta: 'Nave', tipo: 'fk', ref: { tabla: 'naves', campo: 'nombre' }, dependeDe: 'planta_id', requerido: true },
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true },
      { campo: 'activo', etiqueta: 'Activo', tipo: 'boolean' }
    ]
  },

  // ================= DISPONIBILIDAD =================
  // Pagina dedicada: permite marcar varios dias a la vez y muestra el
  // listado agrupado por muelle+horario con los dias como L M X J V S D.
  disponibilidad_muelles: {
    titulo: 'Disponibilidad',
    icono: '🕐',
    descripcion: 'Horarios disponibles por muelle (varios dias a la vez)',
    url: '/disponibilidad',
    tabla: null,
    campos: []
  },

  // Pantalla dedicada para mantenimientos/cierres puntuales
  excepciones_muelles: {
    titulo: 'Excepciones de horario',
    icono: '🛠️',
    descripcion: 'Mantenimientos o cierres puntuales de muelles',
    url: '/excepciones',
    tabla: null,
    campos: []
  },

  // ================= PROVEEDORES =================
  proveedores: {
    titulo: 'Proveedores',
    icono: '🏢',
    descripcion: 'Empresas proveedoras',
    tabla: 'proveedores',
    orderBy: 'nombre',
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true },
      { campo: 'email_contacto', etiqueta: 'Email contacto', tipo: 'text' },
      { campo: 'activo', etiqueta: 'Activo', tipo: 'boolean' }
    ]
  },

  proveedor_muelles: {
    titulo: 'Proveedor-Muelles',
    icono: '🔗',
    descripcion: 'Muelles permitidos por proveedor',
    tabla: 'proveedor_muelles',
    orderBy: 'proveedor_id',
    campos: [
      { campo: 'proveedor_id', etiqueta: 'Proveedor', tipo: 'fk', ref: { tabla: 'proveedores', campo: 'nombre' }, requerido: true },
      // La planta se elige para localizar el muelle. El acceso del proveedor
      // se deriva después de la asignación, no de usuario_plantas.
      { campo: 'planta_id', etiqueta: 'Planta', tipo: 'fk', ref: { tabla: 'plantas', campo: 'nombre' }, soloFiltro: true, enTabla: false },
      { campo: 'nave_id', etiqueta: 'Nave', tipo: 'fk', ref: { tabla: 'naves', campo: 'nombre' }, dependeDe: 'planta_id', soloFiltro: true, enTabla: false },
      // Columnas de contexto (solo lectura): Planta y Nave del muelle elegido.
      // Se resuelven en cadena: muelle -> nave -> planta (campo 'via' como array).
      { campo: 'planta_contexto', etiqueta: 'Planta', tipo: 'fk', virtual: true, ref: { tabla: 'plantas', campo: 'nombre' }, via: [
        { campo: 'muelle_id', tabla: 'muelles', columna: 'nave_id' },
        { tabla: 'naves', columna: 'planta_id' }
      ] },
      { campo: 'nave_contexto', etiqueta: 'Nave', tipo: 'fk', virtual: true, ref: { tabla: 'naves', campo: 'nombre' }, via: [
        { campo: 'muelle_id', tabla: 'muelles', columna: 'nave_id' }
      ] },
      { campo: 'muelle_id', etiqueta: 'Muelle', tipo: 'fk', ref: { tabla: 'muelles', campo: 'nombre' }, dependeDe: 'nave_id', requerido: true }
    ]
  },

  // ================= USUARIOS Y ROLES =================
  roles: {
    titulo: 'Roles',
    icono: '🎖️',
    descripcion: 'Roles del sistema (admin, interno, proveedor)',
    tabla: 'roles',
    orderBy: 'nombre',
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true },
      { campo: 'descripcion', etiqueta: 'Descripcion', tipo: 'text' }
    ]
  },

  departamentos: {
    titulo: 'Departamentos',
    icono: '🗂️',
    descripcion: 'Departamentos de la organizacion',
    tabla: 'departamentos',
    orderBy: 'nombre',
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true }
    ]
  },

  usuarios: {
    titulo: 'Usuarios',
    icono: '👤',
    descripcion: 'Crear y gestionar usuarios de la aplicacion',
    url: '/usuarios',
    tabla: null,
    campos: []
  },

  // ================= VISTA (plano visual) =================
  v_muelles: {
    titulo: 'Vista Muelles',
    icono: '🗺️',
    descripcion: 'Plano visual: Planta > Nave > Muelle',
    url: '/vista-muelles',
    tabla: null,
    campos: []
  }
};
