# 🚛 EMESA DOCK — Gestión de Muelles y Reservas

Aplicación web para la gestión de muelles de carga/descarga y sus reservas,
desarrollada sobre **Flask + Supabase** y con el **estilo visual de la
plantilla DIGITALIZATION SCCZ** (header global con logo EMESA, selector de
idioma ES/EN/CZ, modal de login universal, tarjetas y tablas corporativas).

---

## ✨ Características

- **Login con Supabase Auth** (email/contraseña) a través del backend Flask.
- **Dashboard** con:
  - Tarjeta de bienvenida con avatar y datos del usuario (desde `profiles`).
  - Tarjetas de estadísticas en tiempo real (muelles, reservas, plantas, proveedores).
  - Estado de los muelles con sus reservas de hoy.
- **Header global reutilizable** con logo EMESA, título y widget de usuario.
- **Breadcrumb EMESA** (jerarquía `Inicio > Configuración > Submenú`, máx. 3 niveles)
  según la skill `emesa-spa-breadcrumbs`.
- **Menú de configuración** con módulos y **CRUD genérico** (crear, editar, borrar)
  sobre Supabase (solo administradores; políticas RLS en `022_crud_rls_policies.sql`).
- **Sistema de permisos por rol** (oculta menús/módulos según el rol del usuario).
- **Selector de idioma** (Español / English / Čeština) con sistema de traducción.
- **Modal de login universal** que se muestra si no hay sesión activa.

## 🔐 Permisos por rol

El acceso se controla por **roles** (tabla `roles` + `user_roles`) y **permisos**
(`modulo:accion`, con comodines como `config:*` o `*`). La fuente de verdad de qué
puede hacer cada rol está en `app.py` (`PERMISOS_POR_ROL`); el frontend solo mapea
qué permiso necesita cada elemento de la interfaz (`static/js/permisos.js`).

| Rol | Permisos |
|-----|----------|
| `DEVELOPER` | Acceso completo (`*`), todas las plantas, configuración, usuarios, roles, auditoría |
| `SYSTEM_ADMIN` | Organización, plantas, usuarios, proveedores y configuración general |
| `PLANT_ADMIN` | Reservas/muelles/horarios/proveedores de su planta (sin roles ni usuarios globales) |
| `PLANT_OPERATOR` | Consultar calendario/reservas y actualizar estados (sin configuración) |
| `SUPPLIER_USER` | Crear/ver/cancelar sus propias reservas (sin configuración) |

- Migración `024_roles_sistema.sql`: inserta los roles nuevos y los asigna desde los
  roles heredados (compatibilidad).
- La migración `021`/`022` deben haberse ejecutado para que el CRUD y `is_admin()`
  funcionen.
- Los roles heredados (`super_admin`, `company_admin`, etc.) siguen reconocidos para
  no romper accesos existentes.

## 🧱 Estructura

```
docksemesa/
├── app.py                     # Flask: rutas, login/logout, API Supabase
├── config.py                  # Credenciales Supabase (URL + KEY)
├── requirements.txt
├── templates/
│   ├── login.html             # Página de login (estilo plantilla)
│   └── dashboard.html         # Panel principal
├── static/
│   ├── css/
│   │   ├── style.css          # Estilos globales (adaptados de la plantilla)
│   │   ├── loginModal.css     # Estilos del modal de login
│   │   └── breadcrumb.css     # Breadcrumb EMESA (skill emesa-spa-breadcrumbs)
│   ├── js/
│   │   ├── supabase.js        # Configuración y helpers de Supabase/API
│   │   ├── auth.js            # Autenticación (login/logout/sesión)
│   │   ├── globalHeader.js    # Header global + sistema de traducciones
│   │   ├── loginModal.js      # Modal de login universal
│   │   ├── breadcrumb.js      # Breadcrumb jerárquico (Inicio > Configuración > Submenú)
│   │   ├── modulos.js         # Registro de módulos de configuración y sus campos
│   │   ├── configuracion.js   # Render del menú de configuración
│   │   ├── modulo.js          # CRUD genérico de módulos
│   │   ├── app.js             # Lógica del dashboard
│   │   └── navegacion.js      # Utilidades de navegación
│   ├── images/
│   │   └── Logo_EMESA.png     # Logo EMESA (copiado de la plantilla)
│   └── translations/
│       ├── es.json            # Traducciones español
│       ├── en.json            # Traducciones inglés
│       └── cs.json            # Traducciones checo
├── database/                  # Migraciones y funciones SQL (Supabase)
└── tools/python/              # Utilidades (test_supabase.py, main.py)
```

## 🚀 Puesta en marcha

```bash
# 1. Crear y activar entorno virtual
python -m venv venv
venv\Scripts\activate          # Windows

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Configurar credenciales en config.py (o variables de entorno)
#    SUPABASE_URL = "https://TU-PROYECTO.supabase.co"
#    SUPABASE_KEY = "tu-servicio-o-anon-key"

# 4. Ejecutar
python app.py
# → http://127.0.0.1:5000
```

## 🔐 Integración con Supabase

La autenticación y las consultas se realizan a través del backend Flask
(que usa el cliente Python de Supabase con la clave de servicio), de modo
que **la clave secreta nunca llega al navegador**:

| Endpoint         | Método | Descripción                                        |
|------------------|--------|----------------------------------------------------|
| `/`              | GET    | Página de login                                    |
| `/dashboard`     | GET    | Panel principal (requiere sesión)                  |
| `/login`         | POST   | `{email, password}` → usa `sign_in_with_password`  |
| `/logout`        | POST   | Cierra sesión                                      |
| `/api/me`        | GET    | Devuelve el usuario de la sesión                   |
| `/api/stats`     | GET    | Estadísticas (muelles, reservas, plantas, proveedores) |
| `/api/docks`     | GET    | Muelles con sus reservas de hoy                    |
| `/configuracion` | GET    | Menú de configuración con módulos                  |
| `/modulo`        | GET    | CRUD genérico de un módulo (`?tabla=<tabla>`)      |
| `/api/crud/<t>`  | GET/POST | Lista/crea registros de un módulo                |
| `/api/crud/<t>/<id>` | PUT/DELETE | Actualiza/borra un registro               |

> **Nota:** Si más adelante quieres consultas directas desde el navegador
> (SDK `@supabase/supabase-js`), pega la **ANON KEY** en
> `static/js/supabase.js` (`SUPABASE_CONFIG.anonKey`) y el cliente se
> cargará automáticamente.

## 🎨 Sobre el estilo (adaptado de Plantilla_inicio_SCCZ)

- Paleta: azul corporativo `#1976d2` / `#0d47a1`, rojo EMESA `#d71920`,
  azul claro `#cce7f6` y acento naranja `#ff9800`.
- Header global con gradiente azul, logo EMESA y banderas de idioma.
- Tarjetas de bienvenida y acción con animación y elevación al pasar el ratón.
- Tablas con cabecera azul, filas alternas y badges de estado de reservas.
- Sistema de traducción por atributos `data-original-text`,
  `data-original-placeholder` y `data-original-title`.

## 📌 Próximos pasos sugeridos

- Módulo **Nueva Reserva** (crear `bookings` respetando `starts_at`/`ends_at`).
- Módulo **Ver Muelles** (estado y disponibilidad).
- Control de **roles** (tabla `roles` + `user_roles`) para habilitar/deshabilitar
  tarjetas de administración.
