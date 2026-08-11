# Plan de cambios — DockS Emesa

## Situación actual

Actualmente tenemos:

- **Backend**: Flask (Python) sirviendo HTML renderizado + API REST interna.
- **Frontend**: HTML/CSS/JS vanilla con templates Jinja2.
- **Base de datos**: Supabase PostgreSQL con el modelo completo (organizaciones, plantas, naves, muelles, proveedores, reservas, horarios, bloqueos…).
- **Auth**: Flask actúa de proxy; el login llama a Supabase Auth en el servidor y guarda la sesión en cookie.
- **RLS**: Políticas creadas para la mayoría de tablas (migraciones 001–026).
- **Roles y permisos**: Modelo en `app.py` (`PERMISOS_POR_ROL`) + frontend (`permisos.js`) que oculta menús por rol.
- **CRUD genérico**: Menú de Configuración con módulos para todas las tablas maestras.
- **Gestión de usuarios**: Módulo `/usuarios` que crea usuarios de Auth + perfil + roles desde la app (sin Dashboard de Supabase).
- **Idiomas**: ES / EN / CS con selector de banderas.
- **Estilo**: Adaptado de la plantilla corporativa EMESA (header, breadcrumb, tarjetas).

**Lo que NO está implementado todavía** (según la especificación):

- Flujo de **reserva** (asistente paso a paso para externos, calendario para internos).
- **Calendario** con franjas de 30 minutos y disponibilidad real.
- **Invitaciones** (el registro no es público, los usuarios deben ser invitados).
- **Correos electrónicos** (confirmación, aprobación, cancelación, recordatorios).
- **Actualización en tiempo real** (Supabase Realtime).
- **PWA** (instalable en móvil/escritorio).
- **Vistas de base de datos** (v_internal_calendar, v_external_bookings…).
- **Funciones seguras** (create_booking, approve_booking…).
- **Exportación** de informes (CSV/Excel).
- **Separación real** entre área interna y externa (rutas `/interno` y `/reservas`).

---

## Problema principal de arquitectura

La especificación define claramente:

> Frontend: **React + TypeScript + Vite**, alojado en **Netlify**.
> Backend: **Supabase** (PostgreSQL + Auth + Edge Functions + Realtime).

El proyecto actual usa **Flask** como backend y **HTML renderizado** en servidor.
Esto funciona para el prototipo y la administración, pero **no encaja con la arquitectura objetivo**:

| Aspecto | Actual | Objetivo |
|---|---|---|
| Hosting | Flask (localhost) | Netlify (SPA estática) |
| Frontend | HTML/CSS/JS vanilla (Jinja2) | React + TypeScript + Vite |
| Auth | Proxy Flask → Supabase | Supabase Auth directo (cliente JS) |
| Estado | Sesión Flask (cookie) | Supabase session (localStorage) |
| Tiempo real | No | Supabase Realtime |
| Notificaciones | No | Edge Functions + SMTP |
| PWA | No | Sí |

El reto es **migrar el frontend sin perder lo ya construido**:
el modelo de datos, las políticas RLS, los roles, el CRUD y la gestión de usuarios
son perfectamente reutilizables — solo hay que cambiar **quién renderiza la interfaz**
y **cómo se comunica con Supabase**.

---

## Plan de cambios (ordenado por prioridad)

### 🔴 Fase 0 — Correcciones inmediatas (sin cambiar arquitectura)

Estas son cosas que están **ya implementadas pero necesitan ajustes** para alinearse
con la especificación y no romper nada cuando migremos.

#### 0.1. Añadir columna `postal_code` a `plants`

La especificación la incluye (sección 12.2). Actualmente no existe.
Crear migración `027_plants_postal_code.sql`.

```
alter table public.plants add column if not exists postal_code text;
```

#### 0.2. Añadir columna `email` a `profiles`

La especificación dice que `profiles` incluye `email` (sección 11).
Actualmente `profiles` NO tiene columna `email` porque el email se lee de
`auth.users`. Añadirla simplifica consultas y evita el join cada vez.

```
alter table public.profiles add column if not exists email text;
-- Rellenar datos existentes desde auth.users
update public.profiles p set email = au.email
from auth.users au where au.id = p.id and p.email is null;
```

#### 0.3. Adaptar el modelo de roles a la especificación

La especificación define 9 roles (sección 9):

| Rol | Descripción |
|---|---|
| `super_admin` | Administración global |
| `company_admin` | Administración de empresa |
| `plant_admin` | Administración de planta(s) |
| `planner` | Planificación operativa |
| `department_manager` | Jefe de departamento |
| `dock_operator` | Operador de muelle |
| `internal_viewer` | Consulta interna |
| `supplier_admin` | Administrador de proveedor |
| `supplier_user` | Usuario de proveedor |

Actualmente tenemos estos mismos roles **más** los que añadí en `024_roles_sistema.sql`
(DEVELOPER, SYSTEM_ADMIN, PLANT_ADMIN, PLANT_OPERATOR, SUPPLIER_USER).

**Decisión**: los 9 roles de la especificación son los canónicos.
Los añadidos en 024 se pueden eliminar porque duplican funcionalidad.

- `super_admin` ya existe y funciona como DEVELOPER.
- Los demás ya existían en el seed original.

**Acción**: Asegurar que solo existen los 9 roles canónicos en la tabla `roles`
(borrar DEVELOPER, SYSTEM_ADMIN, PLANT_ADMIN, PLANT_OPERATOR, SUPPLIER_USER si existen).
Actualizar `PERMISOS_POR_ROL` en `app.py` para que los 9 roles canónicos tengan
exactamente los permisos que describe la especificación (sección 9).

#### 0.4. Añadir tabla `carriers` (transportistas)

Especificación, sección 13: tabla `carriers` para separar proveedores de
transportistas. Es optativa pero alineada con el modelo.

```
create table public.carriers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id),
    name text not null,
    tax_id text,
    email text,
    phone text,
    active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
```

Añadir `carrier_id` a `bookings` (referencia opcional a carriers).

#### 0.5. Añadir tabla `organization_memberships`

Especificación, sección 11: tabla para membresías a organizaciones.
Actualmente no existe; el acceso a plantas se gestiona con `user_plant_access`.

```
create table public.organization_memberships (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    active boolean default true,
    created_at timestamptz default now(),
    unique(user_id, organization_id)
);
```

#### 0.6. Añadir tabla `user_product_category_access`

Especificación, sección 11. Actualmente no existe.

```
create table public.user_product_category_access (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    product_category_id uuid not null references public.product_categories(id) on delete cascade,
    operation_type text check(operation_type in ('loading','unloading')),
    active boolean default true,
    created_at timestamptz default now(),
    unique(user_id, product_category_id, operation_type)
);
```

---

### 🟡 Fase 1 — Refactor del frontend (sin cambiar backend)

El objetivo de esta fase es **organizar el frontend actual** como SPA con rutas
cliente (en vez de páginas servidas por Flask), manteniendo Flask como API REST
durante la transición.

#### 1.1. Separar rutas internas y externas

Actualmente todas las páginas están en raíz (`/`, `/dashboard`, `/configuracion`,
`/modulo`, `/usuarios`). La especificación pide:

```
/interno          → panel principal
/interno/calendario
/interno/reservas
/interno/administracion
/interno/proveedores
/interno/usuarios

/reservas         → página principal externa
/reservas/nueva    → asistente de reserva
/reservas/mis-citas

/auth/login
/auth/aceptar-invitacion
/auth/recuperar-password
/auth/nueva-password
```

**Acción**: Reorganizar las plantillas Flask en subcarpetas `templates/interno/` y
`templates/reservas/`, con un layout diferente para cada área (header distinto,
colores adaptados al perfil, breadcrumb contextual).

La página actual `/dashboard` pasa a ser `/interno`.
La página actual `/configuracion` pasa a ser `/interno/administracion`.
La página actual `/modulo?tabla=X` pasa a ser `/interno/administracion/X`.
La página actual `/usuarios` pasa a ser `/interno/usuarios`.

El login (`/`) debe **redirigir al área correspondiente** según el tipo de usuario
(interno → `/interno`, externo → `/reservas`).

#### 1.2. Implementar el asistente de reserva externo (paso a paso)

Página `/reservas/nueva` con un formulario por pasos (wizard) según sección 24.3:

1. Selección de planta (solo las autorizadas).
2. Tipo de operación (carga/descarga) + categoría de producto.
3. Selección de muelle (compatibilidad validada).
4. Fecha y hora (píldoras de 30 min con disponibilidad).
5. Datos del transporte (conductor, matrícula, pedido...).
6. Confirmación (resumen antes de enviar).

La disponibilidad se calcula mediante una función RPC `get_available_slots`
(sección 22) que hay que crear en PostgreSQL. Mientras no exista, se puede
simular con un endpoint Flask que haga las comprobaciones básicas.

#### 1.3. Implementar la página de confirmación

Tras crear la reserva, mostrar una página de confirmación con todos los datos
y posibilidad de descargar `.ics` / añadir al calendario (sección 31).

#### 1.4. Implementar "Mis citas" para externos

Página `/reservas/mis-citas` con listado filtrable de reservas del proveedor
(próximas, pendientes, confirmadas, canceladas, completadas, históricas).
Permitir modificar y cancelar (sección 24.4).

---

### 🟢 Fase 2 — Calendario operativo interno

#### 2.1. Vista de calendario (escritorio)

Según sección 25.2: cuadrícula con filas = muelles, columnas = horas (intervalos
de 30 min), tarjetas = reservas, línea vertical = hora actual.

Se puede implementar con un componente de calendario ligero (sin librería pesada)
o con una librería como FullCalendar. Para empezar, una implementación vanilla
con CSS grid es suficiente y no añade dependencias.

#### 2.2. Vista de agenda (móvil)

Según sección 25.3: lista vertical de operaciones agrupadas por hora, con
botones rápidos de estado. Adaptar con CSS responsive (media queries).

#### 2.3. Acciones sobre reservas

Añadir botones de estado al calendario:
- Check-in / Marcar llegada
- Entrada en muelle
- Iniciar operación
- Finalizar operación
- Marcar no presentado
- Registrar incidencia
- Crear operación no planificada
- Crear bloqueo

Cada acción actualiza el `status` de la reserva y registra en `audit_log` y
`booking_status_history`.

#### 2.4. Filtros del calendario

Implementar los filtros de la sección 25.2 (planta, nave, muelle, fecha,
proveedor, departamento, producto, estado, origen).

---

### 🔵 Fase 3 — Funciones de servidor y RPC

#### 3.1. Crear función `get_available_slots`

Según sección 22: recibe usuario, planta, fecha, categoría, operación, proveedor,
duración y muelle (opcional). Devuelve los intervalos disponibles (cada 30 min).

La función debe:
1. Verificar acceso a la planta y compatibilidad.
2. Obtener horarios recurrentes (`dock_schedule_rules`).
3. Aplicar excepciones (`dock_schedule_exceptions`).
4. Aplicar bloqueos (`dock_blocks`).
5. Aplicar antelación mínima (`minimum_external_notice_minutes`).
6. Restar reservas existentes.
7. Devolver solo intervalos libres.

Se implementa como función PostgreSQL (RPC expuesta a través de PostgREST).
Requiere `security definer` para leer tablas respetando RLS.

#### 3.2. Crear función `create_booking`

Transacción atómica que:
1. Valida permisos (acceso a planta, muelle, producto, proveedor).
2. Valida antelación.
3. Valida compatibilidad.
4. Valida disponibilidad (sin solapamientos).
5. Inserta la reserva.
6. Registra auditoría.
7. Devuelve el resultado.

Previene condiciones de carrera (dos usuarios reservando el mismo hueco).

#### 3.3. Crear funciones adicionales

- `update_booking`: modificar reserva con validaciones.
- `cancel_booking`: cancelar con motivo y registro.
- `approve_booking` / `reject_booking`: para flujo con aprobación.
- `set_booking_status`: cambio de estado operativo.
- `invite_user`: gestionar invitaciones (usando Supabase Auth admin API).

Todas con `security definer` y comprobaciones de permisos.

---

### 🟣 Fase 4 — Auth, invitaciones y correos

#### 4.1. Desactivar registro público en Supabase

En el Dashboard de Supabase → Authentication → Settings:
- Desmarcar "Enable email confirmations" (o mantener para invitaciones).
- Desmarcar "Allow new users to sign up".

Esto impide que nadie se registre por su cuenta (sección 10).

#### 4.2. Implementar flujo de invitación

Según sección 10:
1. Admin interno accede a `/interno/usuarios/invitar`.
2. Introduce email, nombre, rol, plantas, muelles, etc.
3. Backend llama a `supabase.auth.admin.inviteUserByEmail()`.
4. Supabase envía el correo con enlace a `/auth/aceptar-invitacion`.
5. El usuario establece su contraseña.
6. Tras activarse, se crea su perfil y se asignan los permisos preparados.

Todo esto requiere una **Edge Function** (o endpoint Flask durante la transición)
que use la `service_role` key.

#### 4.3. Configurar plantillas de correo

En Supabase Auth → Email Templates:
- Personalizar "Invite user" con el formato de Emesa.
- Añadir URLs de redirección: `https://docksemesa.netlify.app`, `http://localhost:5173`.

Para correos transaccionales (confirmación de reserva, aprobación, cancelación…):
- Crear Edge Functions que envíen vía SMTP o API de correo.
- Remitente: `Reservas de muelles Emesa`.
- Plantilla HTML consistente con la identidad visual.

---

### ⚪ Fase 5 — Migración a React SPA

Esta es la fase más grande. Consiste en reescribir el frontend como una SPA
React + TypeScript + Vite, manteniendo el backend de Supabase intacto.

#### 5.1. Inicializar el proyecto Vite + React + TypeScript

```bash
npm create vite@latest docksemesa -- --template react-ts
cd docksemesa
npm install @supabase/supabase-js react-router-dom react-hook-form zod
```

#### 5.2. Configurar Supabase JS client

Usar `@supabase/supabase-js` directamente en el navegador (con la **anon key**
pública). Ya no pasar por Flask para las consultas.

```env
VITE_SUPABASE_URL=https://aeqvtjenbnhglhuchokw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...  # la anon key de Supabase
```

#### 5.3. Reimplementar las páginas como componentes React

Cada página actual se convierte en un componente React con su ruta:

| Actual (Flask) | Nuevo (React) |
|---|---|
| `/` (login) | `/auth/login` |
| `/dashboard` | `/interno` |
| `/configuracion` | `/interno/administracion` |
| `/modulo?tabla=X` | `/interno/administracion/:tabla` |
| `/usuarios` | `/interno/usuarios` |
| — | `/reservas` |
| — | `/reservas/nueva` |
| — | `/reservas/mis-citas` |
| — | `/auth/aceptar-invitacion` |
| — | `/auth/recuperar-password` |

El CRUD genérico y los formularios se pueden reutilizar con React Hook Form + Zod
para validación (más robusto que el actual vanilla JS).

#### 5.4. Layouts separados para área interna y externa

- **Layout interno**: header corporativo EMESA, breadcrumb, sidebar (opcional).
- **Layout externo**: diseño más simple, solo para reservar (sin menú de administración).

Ambos layouts comparten el sistema de permisos (`Permisos`) para ocultar/mostrar
elementos según el rol.

#### 5.5. PWA

Añadir `vite-plugin-pwa` para generar el manifest, service worker e iconos.
Configurar modo `standalone` y caché del frontend.

#### 5.6. Tiempo real

Sustituir las recargas manuales por suscripciones a Supabase Realtime:

```ts
supabase
  .channel('bookings')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, callback)
  .subscribe()
```

Esto actualiza automáticamente el calendario cuando otro usuario crea, modifica
o cancela una reserva.

---

### 🟤 Fase 6 — Despliegue en Netlify

#### 6.1. Configurar `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### 6.2. Variables de entorno en Netlify

Configurar en el panel de Netlify:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_URL=https://docksemesa.netlify.app`

#### 6.3. Conectar repositorio GitHub

Netlify construye automáticamente en cada push a `main`.

---

## Resumen ejecutivo: orden de trabajo recomendado

| # | Fase | Esfuerzo | Impacto | Depende de |
|---|---|---|---|---|
| 0 | Correcciones inmediatas (columnas, tablas, roles) | Bajo | Alto | — |
| 1 | Refactor rutas Flask (separar interno/externo) | Medio | Alto | 0 |
| 2 | Calendario operativo + acciones | Alto | Alto | 1 |
| 3 | Funciones RPC (disponibilidad, booking atómico) | Alto | Muy alto | 0 |
| 4 | Auth, invitaciones y correos | Medio | Alto | 0 |
| 5 | Migración a React SPA | Muy alto | Transformacional | 1–4 |
| 6 | Despliegue en Netlify + PWA | Medio | Alto | 5 |

---

## Lo que NO cambia (se reutiliza)

- ✅ El modelo de datos (todas las tablas de migraciones 001–027).
- ✅ Las políticas RLS (migraciones 019, 021, 022, 025).
- ✅ Los roles y permisos (adaptados a los 9 canónicos).
- ✅ El CRUD genérico (la lógica de módulos se porta a React).
- ✅ Las traducciones (es/en/cs, los JSON se reutilizan tal cual).
- ✅ El breadcrumb EMESA (se porta el CSS + la lógica JS).
- ✅ El sistema de permisos por rol (se porta `permisos.js` a `usePermisos` hook de React).
- ✅ Los estilos corporativos (CSS variables, paleta, tarjetas, tablas — se reutilizan).
- ✅ La base de datos de Supabase (no se toca, no se migra — ya está lista).

---

## Lo que SÍ cambia

- ❌ Flask deja de servir HTML (pasa a ser solo API REST durante la transición, luego se elimina).
- ❌ Las plantillas Jinja2 se reescriben como componentes React.
- ❌ La autenticación deja de pasar por Flask (se usa Supabase JS client directo).
- ❌ El estado de sesión pasa de cookie Flask a localStorage (Supabase session).
- ❌ Las recargas de página se sustituyen por React Router (SPA).
- ❌ El CRUD genérico se reimplementa con React Hook Form + Zod.
- ❌ La UI se adapta a responsive/PWA (actualmente es solo escritorio).
