te comento, todo esto viene porque necesito hacer una aplicacion, te paso el funcional, explicame lo que entiendes y vamos a ir paso a paso con ello:
# Especificación funcional y técnica

# Aplicación DockS Emesa para planificación y reserva de muelles

## 1. Objetivo de la aplicación

DockS Emesa será una aplicación web destinada a la planificación de cargas y descargas en los muelles de las plantas de la empresa.

La aplicación tendrá dos tipos principales de uso:

* **Uso interno:** planificación, administración, supervisión y gestión operativa de los muelles.
* **Uso externo:** reserva de citas por parte de proveedores, transportistas u otros colaboradores autorizados.

La aplicación se publicará inicialmente en Netlify con la siguiente dirección:

`https://docksemesa.netlify.app`

El nombre del sitio en Netlify deberá ser:

`docksemesa`

La aplicación utilizará:

* Supabase Auth para autenticación.
* PostgreSQL de Supabase como base de datos.
* Row Level Security, RLS, para control de acceso.
* Supabase Edge Functions para operaciones administrativas y comunicaciones.
* Netlify como hosting del frontend.
* Diseño responsive y PWA para funcionamiento en ordenador, tableta y móvil.

---

## 2. Cuenta administrativa y seguridad

La cuenta administrativa principal para Supabase y Netlify será:

`digitalization.sccz@saveragroup.com`

No se utilizará la misma contraseña que la cuenta de correo.

Se utilizará:

* Una contraseña exclusiva para Supabase.
* Una contraseña exclusiva para Netlify.
* Autenticación en dos factores en ambas plataformas.
* Un gestor corporativo de contraseñas.
* Una segunda cuenta administradora de emergencia.
* Códigos de recuperación almacenados de forma segura.

Ninguna contraseña, clave secreta o credencial SMTP se almacenará en:

* El código fuente.
* GitHub.
* Variables públicas del frontend.
* La base de datos accesible desde el navegador.
* Documentación compartida sin protección.

---

## 3. Nombre de los proyectos

### Supabase

El proyecto de Supabase se llamará:

`SCCZ`

Este nombre técnico coincide con el nombre de la planta de Ostrava, pero ambos conceptos serán independientes:

* **Proyecto Supabase:** SCCZ.
* **Planta logística:** SCCZ – Ostrava.

### Netlify

El sitio se llamará:

`docksemesa`

La URL inicial será:

`https://docksemesa.netlify.app`

No se utilizará inicialmente un dominio corporativo propio.

---

## 4. Estructura organizativa

La aplicación tendrá cuatro niveles internos:

```text
Empresa
└── Planta
    └── Nave
        └── Muelle
```

Aunque visualmente la gestión operativa se centrará en planta, nave y muelle, se mantendrá el nivel empresa para permitir el crecimiento futuro.

### Estructura inicial

```text
Emesa
├── Planta Épila
│   ├── Nave 1
│   │   ├── Muelle 1
│   │   └── Muelle 2
│   ├── Nave 2
│   │   └── Muelle 1
│   └── Nave 3
│       └── Muelle 1
│
└── Planta SCCZ – Ostrava
    ├── Nave 1
    │   ├── Muelle 1
    │   └── Muelle 2
    └── Otras naves y muelles configurables
```

La estructura será completamente configurable. Los nombres anteriores son ejemplos iniciales y podrán modificarse desde la administración.

---

## 5. Zona horaria

La zona horaria se configurará individualmente para cada planta.

Configuración inicial:

| Planta                          | Zona horaria    |
| ------------------------------- | --------------- |
| Épila, España                   | `Europe/Madrid` |
| SCCZ – Ostrava, República Checa | `Europe/Prague` |

Todas las fechas se almacenarán internamente en UTC.

La aplicación mostrará las horas en la zona horaria de la planta correspondiente.

Esto permitirá:

* Gestionar correctamente el horario de verano.
* Mostrar al proveedor la hora local de la planta.
* Evitar errores cuando un usuario interno consulta otra planta.
* Añadir futuras plantas en otros países.

En cualquier pantalla de reserva deberá aparecer claramente la zona horaria o la hora local de la planta.

Ejemplo:

```text
10:30, hora local de Épila
```

---

## 6. Arquitectura de la aplicación

Se creará una única aplicación web con distintas áreas y rutas.

### Área interna

```text
/interno
/interno/calendario
/interno/reservas
/interno/administracion
/interno/proveedores
/interno/usuarios
```

### Área externa

```text
/reservas
/reservas/nueva
/reservas/mis-citas
```

### Autenticación

```text
/auth/login
/auth/aceptar-invitacion
/auth/recuperar-password
/auth/nueva-password
```

No se crearán dos aplicaciones completamente independientes. Ambas áreas compartirán:

* Base de datos.
* Autenticación.
* Reglas de negocio.
* Componentes.
* Funciones de servidor.
* Sistema de permisos.

Cada área tendrá una interfaz adaptada a sus usuarios.

---

## 7. Tecnología recomendada

| Elemento                    | Tecnología                                                          |
| --------------------------- | ------------------------------------------------------------------- |
| Frontend                    | React                                                               |
| Lenguaje                    | TypeScript                                                          |
| Compilación                 | Vite                                                                |
| Hosting                     | Netlify                                                             |
| Base de datos               | PostgreSQL de Supabase                                              |
| Autenticación               | Supabase Auth                                                       |
| Seguridad                   | Supabase RLS                                                        |
| Operaciones de servidor     | Supabase Edge Functions                                             |
| Actualización de calendario | Supabase Realtime                                                   |
| Aplicación instalable       | PWA                                                                 |
| Repositorio                 | GitHub privado                                                      |
| Gestión de formularios      | React Hook Form                                                     |
| Validación                  | Zod                                                                 |
| Calendario                  | Componente de calendario compatible con recursos y líneas de tiempo |

---

## 8. Entornos y despliegues

La aplicación tendrá un único entorno funcional de producción.

El entorno principal será:

```text
https://docksemesa.netlify.app
```

No se mantendrá inicialmente una infraestructura completamente separada de producción y test.

Cuando sea necesario probar invitaciones, recuperación de contraseña o confirmaciones, el cambio principal será la URL de redirección configurada para los correos.

Las URLs de redirección deberán poder incluir:

* URL de producción.
* URL temporal de una vista previa de Netlify.
* URL local de desarrollo.

Ejemplos:

```text
https://docksemesa.netlify.app/auth/aceptar-invitacion
https://docksemesa.netlify.app/auth/nueva-password
http://localhost:5173/auth/aceptar-invitacion
http://localhost:5173/auth/nueva-password
```

Las confirmaciones de reservas podrán utilizar también URLs diferentes según el origen:

```text
https://docksemesa.netlify.app/reservas/mis-citas
```

Aunque habitualmente se denomine OAuth2 al proceso, las invitaciones y recuperaciones de Supabase utilizan principalmente enlaces de autenticación con URLs de redirección autorizadas.

La configuración deberá permitir añadir o retirar URLs autorizadas sin modificar el código de la aplicación.

---

## 9. Tipos de usuario

### `super_admin`

Podrá:

* Gestionar toda la aplicación.
* Gestionar todas las empresas.
* Gestionar todas las plantas.
* Crear otros administradores.
* Modificar configuraciones globales.
* Consultar auditorías.
* Gestionar permisos y roles.

### `company_admin`

Podrá:

* Gestionar la empresa Emesa.
* Gestionar plantas, naves y muelles.
* Gestionar proveedores.
* Gestionar departamentos.
* Invitar usuarios.
* Asignar plantas y muelles.
* Configurar disponibilidades.
* Consultar y modificar reservas.

### `plant_admin`

Podrá:

* Administrar una o varias plantas asignadas.
* Gestionar naves y muelles de sus plantas.
* Configurar horarios y bloqueos.
* Gestionar reservas.
* Asignar accesos dentro de sus plantas.

### `planner`

Podrá:

* Consultar el calendario.
* Crear reservas internas.
* Modificar reservas.
* Reasignar muelles.
* Crear reservas inmediatas.
* Aprobar o rechazar solicitudes externas.
* Registrar operaciones no planificadas.
* Crear bloqueos operativos.

### `department_manager`

Podrá:

* Consultar reservas de su departamento.
* Crear reservas internas.
* Modificar reservas de su departamento.
* Consultar plantas y muelles autorizados.

### `dock_operator`

Podrá:

* Consultar la planificación de los muelles asignados.
* Marcar llegada.
* Marcar entrada en muelle.
* Iniciar una operación.
* Finalizar una operación.
* Registrar una incidencia.
* Marcar un vehículo como no presentado.

### `internal_viewer`

Podrá:

* Consultar calendarios.
* Consultar reservas.
* Aplicar filtros.
* No podrá modificar información.

### `supplier_admin`

Podrá:

* Crear reservas para su proveedor.
* Consultar todas las reservas del proveedor.
* Modificar reservas permitidas.
* Cancelar reservas.
* Gestionar usuarios del proveedor si se habilita esta opción.

### `supplier_user`

Podrá:

* Crear reservas para su proveedor.
* Consultar sus propias reservas.
* Modificar sus propias reservas.
* Cancelar sus propias reservas.

---

## 10. Registro, autenticación e invitaciones

### Registro cerrado

No habrá registro público.

Un proveedor no podrá crear una cuenta por sí mismo.

Todos los usuarios deberán ser invitados por un administrador interno.

### Proceso de invitación

1. El administrador accede a “Usuarios e invitaciones”.
2. Introduce:

   * Nombre.
   * Apellidos.
   * Correo electrónico.
   * Teléfono, opcional.
   * Tipo de usuario.
   * Empresa o proveedor.
   * Departamento, cuando corresponda.
   * Rol.
   * Plantas permitidas.
   * Muelles permitidos.
   * Categorías de producto permitidas.
3. La aplicación registra una invitación pendiente.
4. Una Supabase Edge Function comprueba que el usuario que invita tiene permisos.
5. La función crea la invitación mediante Supabase Auth.
6. Supabase envía el correo de invitación.
7. El usuario abre el enlace.
8. El usuario accede a:

   * `/auth/aceptar-invitacion`
9. El usuario establece su contraseña.
10. Su cuenta queda activada.
11. Los permisos preparados previamente se aplican automáticamente.

### Recuperación de contraseña

1. El usuario pulsa “He olvidado mi contraseña”.
2. Introduce su correo.
3. Supabase envía un enlace de recuperación.
4. El usuario accede a:

   * `/auth/nueva-password`
5. Establece una nueva contraseña.
6. La aplicación confirma el cambio.
7. Se redirige al inicio de sesión.

### Desactivación de usuarios

Un administrador podrá:

* Desactivar temporalmente una cuenta.
* Revocar el acceso a una planta.
* Revocar el acceso a uno o varios muelles.
* Cambiar el proveedor asignado.
* Cambiar el rol.
* Cerrar sesiones activas.
* Bloquear el acceso sin eliminar el histórico.

No se eliminarán físicamente usuarios que tengan reservas o registros de auditoría asociados.

---

## 11. Datos de usuarios y permisos

Se utilizará una tabla adicional `profiles` vinculada con Supabase Auth.

### `profiles`

* `id`
* `email`
* `first_name`
* `last_name`
* `phone`
* `user_type`
* `active`
* `preferred_language`
* `created_at`
* `updated_at`

Relación:

```text
profiles.id = auth.users.id
```

Los roles y accesos no se almacenarán únicamente dentro de `profiles`.

Se utilizarán tablas relacionales para permitir que una misma persona tenga permisos diferentes en diferentes plantas.

### Tablas de permisos

* `organization_memberships`
* `user_roles`
* `user_plant_access`
* `user_warehouse_access`
* `user_dock_access`
* `user_department_access`
* `user_supplier_access`
* `user_product_category_access`

---

## 12. Modelo de datos

### 12.1. Empresas

#### `organizations`

* `id`
* `name`
* `code`
* `active`
* `created_at`
* `updated_at`

Registro inicial:

```text
Emesa
```

### 12.2. Plantas

#### `plants`

* `id`
* `organization_id`
* `name`
* `code`
* `country_code`
* `address`
* `city`
* `postal_code`
* `timezone`
* `active`
* `minimum_external_notice_minutes`
* `minimum_internal_notice_minutes`
* `created_at`
* `updated_at`

Registros iniciales:

```text
Épila
SCCZ – Ostrava
```

Valores iniciales de antelación:

```text
minimum_external_notice_minutes = 120
minimum_internal_notice_minutes = 0
```

### 12.3. Naves

#### `warehouses`

* `id`
* `plant_id`
* `name`
* `code`
* `description`
* `active`
* `sort_order`
* `created_at`
* `updated_at`

### 12.4. Muelles

#### `docks`

* `id`
* `warehouse_id`
* `name`
* `code`
* `description`
* `active`
* `capacity`
* `default_slot_minutes`
* `default_operation_minutes`
* `access_instructions`
* `sort_order`
* `created_at`
* `updated_at`

Configuración inicial recomendada:

```text
default_slot_minutes = 30
capacity = 1
```

---

## 13. Proveedores y transportistas

### `suppliers`

* `id`
* `organization_id`
* `legal_name`
* `commercial_name`
* `tax_id`
* `supplier_code`
* `email`
* `phone`
* `address`
* `country_code`
* `active`
* `requires_approval`
* `created_at`
* `updated_at`

### `carriers`

Opcionalmente, se separarán proveedores y transportistas.

* `id`
* `organization_id`
* `name`
* `tax_id`
* `email`
* `phone`
* `active`

Un proveedor podrá realizar la reserva directamente o indicar una empresa transportista diferente.

---

## 14. Departamentos internos

### `departments`

* `id`
* `organization_id`
* `name`
* `code`
* `active`
* `created_at`
* `updated_at`

Ejemplos:

* Compras.
* Logística.
* Producción.
* Expediciones.
* Almacén.
* Calidad.
* Mantenimiento.

Los usuarios internos podrán estar asociados a uno o varios departamentos.

Las reservas podrán relacionarse con un departamento responsable.

---

## 15. Productos y categorías

### `product_categories`

* `id`
* `organization_id`
* `name`
* `code`
* `description`
* `default_operation_type`
* `default_duration_minutes`
* `active`
* `created_at`
* `updated_at`

Ejemplos:

* Materias primas.
* Producto terminado.
* Embalajes.
* Químicos.
* Residuos.
* Maquinaria.
* Componentes.
* Repuestos.

### `products`

En caso de necesitar más detalle:

* `id`
* `product_category_id`
* `name`
* `code`
* `description`
* `active`

Inicialmente se podrá trabajar únicamente con categorías, añadiendo productos individuales cuando sea necesario.

---

## 16. Compatibilidad entre productos, proveedores y muelles

No todos los productos podrán descargarse o cargarse en cualquier muelle.

### `dock_product_categories`

* `dock_id`
* `product_category_id`
* `operation_type`
* `duration_minutes`
* `active`

### `supplier_product_categories`

* `supplier_id`
* `product_category_id`
* `active`

### `supplier_plant_permissions`

* `supplier_id`
* `plant_id`
* `active`
* `valid_from`
* `valid_until`

### `supplier_dock_permissions`

* `supplier_id`
* `dock_id`
* `product_category_id`, opcional
* `operation_type`, opcional
* `active`
* `valid_from`
* `valid_until`

La aplicación deberá validar simultáneamente:

* Que el proveedor tenga acceso a la planta.
* Que el proveedor tenga acceso al muelle.
* Que el producto sea compatible con el muelle.
* Que el tipo de operación esté permitido.
* Que el usuario tenga permisos sobre el proveedor.
* Que el muelle se encuentre disponible.

Ejemplo:

```text
El proveedor A puede descargar materias primas en el Muelle 1 de la Nave 1 de Épila.

No puede reservar el Muelle 2.

No puede reservar la planta SCCZ – Ostrava.

No puede seleccionar categorías de producto distintas de las autorizadas.
```

---

## 17. Disponibilidad de muelles

La disponibilidad se calculará mediante reglas, excepciones, bloqueos y reservas existentes.

No se crearán previamente miles de registros individuales para cada intervalo.

### 17.1. Horarios recurrentes

#### `dock_schedule_rules`

* `id`
* `dock_id`
* `day_of_week`
* `start_time`
* `end_time`
* `slot_minutes`
* `valid_from`
* `valid_until`
* `operation_type`
* `active`

Ejemplo:

```text
Lunes a viernes
07:00–15:00
Intervalos de 30 minutos
```

Se permitirán varios tramos en el mismo día:

```text
07:00–11:30
12:00–15:00
```

### 17.2. Excepciones

#### `dock_schedule_exceptions`

* `id`
* `dock_id`
* `date`
* `start_time`
* `end_time`
* `exception_type`
* `reason`
* `created_by`
* `created_at`

Tipos:

* `closed`
* `open`
* `modified`

Ejemplos:

* Festivo.
* Cierre extraordinario.
* Apertura en sábado.
* Horario reducido.
* Cambio de turno.

### 17.3. Bloqueos

#### `dock_blocks`

* `id`
* `dock_id`
* `starts_at`
* `ends_at`
* `reason`
* `block_type`
* `created_by`
* `created_at`

Ejemplos:

* Mantenimiento.
* Avería.
* Limpieza.
* Inventario.
* Reunión.
* Reserva interna de capacidad.
* Indisponibilidad temporal.

---

## 18. Antelación de las reservas

### Usuario externo

La antelación mínima inicial será de:

```text
2 horas
```

Un proveedor no podrá reservar una cita cuyo inicio sea anterior a dos horas desde el momento actual.

La regla se aplicará según la hora local de la planta.

Ejemplo:

```text
Hora actual de la planta: 10:00
Primera reserva externa permitida: 12:00
```

La regla se podrá configurar por planta mediante:

```text
minimum_external_notice_minutes
```

Valor inicial:

```text
120
```

### Usuario interno

La antelación mínima será:

```text
0 minutos
```

Un usuario interno autorizado podrá:

* Crear una reserva inmediata.
* Añadir una operación no planificada.
* Registrar un vehículo que ya está esperando.
* Crear una reserva con inicio en la hora actual.
* Crear una reserva con inicio anterior cuando se trate de regularizar una operación ya iniciada, si tiene permisos suficientes.

La regla se configurará mediante:

```text
minimum_internal_notice_minutes
```

Valor inicial:

```text
0
```

La aplicación deberá diferenciar el origen de la reserva:

* `external`
* `internal`
* `system`

---

## 19. Cancelación de reservas

El proveedor podrá cancelar siempre sus reservas mientras no se encuentren finalizadas.

No existirá un plazo mínimo obligatorio para la cancelación.

Un proveedor podrá cancelar incluso poco antes de la hora prevista.

No podrá cancelar reservas cuyo estado sea:

* `completed`
* `cancelled`

Para reservas con estados operativos avanzados, podrá configurarse que la cancelación requiera intervención interna.

Ejemplos:

* Si el vehículo todavía no ha llegado: cancelación directa.
* Si el vehículo ha hecho check-in: cancelación con aviso interno.
* Si la operación está en curso: solo podrá cancelarla o cerrarla un usuario interno.

La cancelación deberá solicitar:

* Motivo de cancelación.
* Observación opcional.

La cancelación no eliminará la reserva.

La reserva cambiará al estado:

```text
cancelled
```

Se guardará:

* Quién canceló.
* Fecha y hora.
* Motivo.
* Estado anterior.
* Origen de la cancelación.

---

## 20. Reservas

### Tabla `bookings`

* `id`
* `organization_id`
* `plant_id`
* `warehouse_id`
* `dock_id`
* `supplier_id`
* `carrier_id`
* `department_id`
* `product_category_id`
* `product_id`
* `operation_type`
* `origin`
* `starts_at`
* `ends_at`
* `status`
* `created_by`
* `requested_by`
* `approved_by`
* `contact_name`
* `contact_email`
* `contact_phone`
* `driver_name`
* `driver_phone`
* `vehicle_plate`
* `trailer_plate`
* `purchase_order`
* `delivery_note`
* `reference`
* `quantity`
* `unit`
* `external_notes`
* `internal_notes`
* `cancellation_reason`
* `cancelled_by`
* `cancelled_at`
* `created_at`
* `updated_at`

### Tipos de operación

* `loading`
* `unloading`

### Origen

* `external`
* `internal`
* `system`

### Estados

* `pending`
* `confirmed`
* `rejected`
* `cancelled`
* `checked_in`
* `waiting`
* `at_dock`
* `in_progress`
* `completed`
* `no_show`

### Flujo habitual externo

```text
pending
→ confirmed
→ checked_in
→ at_dock
→ in_progress
→ completed
```

### Flujo con rechazo

```text
pending
→ rejected
```

### Flujo con cancelación

```text
pending o confirmed
→ cancelled
```

### Flujo interno inmediato

```text
confirmed
→ checked_in
→ at_dock
→ in_progress
→ completed
```

---

## 21. Aprobación de reservas externas

La aprobación será configurable por proveedor, planta o tipo de operación.

### Confirmación automática

La reserva se crea directamente como:

```text
confirmed
```

### Confirmación manual

La reserva se crea como:

```text
pending
```

Un planificador deberá:

* Aprobarla.
* Rechazarla.
* Cambiar el horario.
* Cambiar el muelle.
* Solicitar información adicional.

En caso de modificación interna, el proveedor recibirá una notificación.

---

## 22. Cálculo de disponibilidad

Se creará una función de base de datos o RPC denominada:

```text
get_available_slots
```

La función recibirá:

* Usuario.
* Planta.
* Fecha.
* Categoría de producto.
* Tipo de operación.
* Proveedor.
* Duración.
* Muelle, cuando se haya seleccionado.

La función realizará:

1. Identificar el usuario autenticado.
2. Identificar el proveedor del usuario.
3. Verificar el acceso a la planta.
4. Obtener los muelles permitidos.
5. Comprobar la compatibilidad de producto.
6. Comprobar el tipo de operación.
7. Obtener el horario recurrente.
8. Aplicar excepciones.
9. Aplicar bloqueos.
10. Aplicar la antelación mínima.
11. Restar reservas existentes.
12. Comprobar la duración completa de la operación.
13. Aplicar la capacidad del muelle.
14. Devolver únicamente los intervalos disponibles.

Resultado esperado:

```text
08:00 disponible
08:30 disponible
09:00 ocupado
09:30 ocupado
10:00 disponible
```

Los intervalos se mostrarán inicialmente cada 30 minutos.

Una operación podrá ocupar varios intervalos.

Ejemplo:

```text
Inicio: 10:00
Duración: 90 minutos

Intervalos ocupados:
10:00
10:30
11:00
```

---

## 23. Prevención de dobles reservas

La disponibilidad no se validará únicamente en el navegador.

La base de datos deberá impedir que dos operaciones activas se solapen en el mismo muelle.

Se utilizará una restricción PostgreSQL sobre rangos de fecha y hora.

Ejemplo técnico:

```sql
create extension if not exists btree_gist;

alter table public.bookings
add constraint bookings_no_dock_overlap
exclude using gist (
  dock_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
)
where (
  status in (
    'pending',
    'confirmed',
    'checked_in',
    'waiting',
    'at_dock',
    'in_progress'
  )
);
```

Además, la creación de reservas se realizará mediante una función transaccional:

```text
create_booking
```

Esta función deberá:

* Validar permisos.
* Validar antelación.
* Validar compatibilidad.
* Validar disponibilidad.
* Crear la reserva.
* Registrar la auditoría.
* Lanzar la notificación.
* Devolver el resultado.

Si dos usuarios intentan reservar el mismo hueco, solo una operación podrá completarse.

La otra recibirá un mensaje similar a:

```text
El horario seleccionado acaba de ser reservado. Selecciona otro intervalo.
```

---

## 24. Área externa

El área externa estará optimizada para proveedores y transportistas.

### 24.1. Inicio de sesión

La pantalla mostrará:

* Correo electrónico.
* Contraseña.
* Recordarme.
* Acceder.
* He olvidado mi contraseña.

No habrá botón de registro público.

Se podrá mostrar:

```text
El acceso requiere una invitación de Emesa.
```

### 24.2. Página principal

Mostrará:

* Próxima cita.
* Crear nueva reserva.
* Mis próximas citas.
* Reservas pendientes.
* Historial.
* Datos de contacto.

### 24.3. Asistente de reserva

#### Paso 1. Planta

El usuario verá únicamente las plantas autorizadas.

Ejemplos:

* Épila.
* SCCZ – Ostrava.

Si solo tiene una planta autorizada, se seleccionará automáticamente.

#### Paso 2. Operación y producto

El usuario seleccionará:

* Carga o descarga.
* Categoría de producto.
* Producto, si procede.
* Referencia del pedido.
* Cantidad aproximada.

#### Paso 3. Muelle

La aplicación podrá:

* Asignar automáticamente un muelle compatible.
* Permitir elegir entre varios muelles compatibles.
* Ocultar muelles no autorizados.

La configuración determinará si el nombre exacto del muelle se muestra al proveedor antes de confirmar.

#### Paso 4. Fecha

Se mostrará un calendario.

Estados posibles:

* Disponible.
* Parcialmente disponible.
* Completo.
* Cerrado.
* No permitido por antelación.

#### Paso 5. Hora

Tras seleccionar el día, aparecerán píldoras de 30 minutos.

Ejemplo:

```text
[ 08:00 ] [ 08:30 ] [ 09:00 ]
[ 09:30 ] [ 10:00 ] [ 10:30 ]
```

Estados visuales:

* Disponible.
* Ocupado.
* No disponible.
* Seleccionado.
* Fuera de antelación.
* Duración insuficiente.

#### Paso 6. Datos del transporte

* Transportista.
* Nombre del conductor.
* Teléfono.
* Matrícula del vehículo.
* Matrícula del remolque.
* Número de pedido.
* Número de albarán.
* Cantidad.
* Unidad.
* Observaciones.

#### Paso 7. Confirmación

Se mostrará:

* Empresa.
* Planta.
* Dirección.
* Nave.
* Muelle, cuando corresponda.
* Fecha.
* Hora local.
* Zona horaria.
* Duración.
* Tipo de operación.
* Producto.
* Referencia.
* Datos del vehículo.
* Estado inicial de la reserva.

El usuario deberá confirmar antes de enviar.

### 24.4. Mis citas

El usuario podrá consultar:

* Próximas.
* Pendientes.
* Confirmadas.
* Canceladas.
* Completadas.
* Históricas.

Podrá:

* Abrir una reserva.
* Modificar datos permitidos.
* Cambiar la cita si existe disponibilidad.
* Cancelar.
* Descargar confirmación.
* Añadirla a su calendario.

---

## 25. Área interna

### 25.1. Panel principal

Mostrará:

* Reservas del día.
* Cargas.
* Descargas.
* Vehículos pendientes.
* Vehículos esperando.
* Operaciones en curso.
* Muelles libres.
* Muelles bloqueados.
* Reservas pendientes de aprobación.
* Retrasos.
* No presentados.
* Operaciones no planificadas.

### 25.2. Calendario operativo

En escritorio se mostrará una cuadrícula.

* Filas: muelles.
* Columnas: horas.
* Intervalos: 30 minutos.
* Tarjetas: reservas.
* Línea vertical: hora actual.
* Encabezado: planta y fecha.

Cada tarjeta podrá mostrar:

* Proveedor.
* Tipo de operación.
* Producto.
* Matrícula.
* Estado.
* Hora.
* Duración.

### Filtros

* Empresa.
* Planta.
* Nave.
* Muelle.
* Fecha.
* Proveedor.
* Departamento.
* Producto.
* Carga o descarga.
* Estado.
* Reservas internas o externas.

### Acciones

* Crear reserva.
* Crear reserva inmediata.
* Registrar operación no planificada.
* Modificar hora.
* Cambiar muelle.
* Cambiar duración.
* Aprobar.
* Rechazar.
* Cancelar.
* Registrar llegada.
* Marcar espera.
* Asignar muelle.
* Iniciar operación.
* Finalizar operación.
* Marcar no presentado.
* Crear bloqueo.
* Añadir notas internas.

### 25.3. Vista móvil interna

En móvil no se comprimirá el calendario completo.

Se utilizará una vista de agenda:

```text
08:00 · Muelle 1 · Proveedor A · Descarga
08:30 · Muelle 2 · Proveedor B · Carga
09:00 · Muelle 1 · Disponible
```

También podrá mostrarse:

* Un muelle por pantalla.
* Navegación horizontal entre muelles.
* Botones rápidos de estado.
* Próxima operación.
* Vehículos esperando.

---

## 26. Reserva interna inmediata

Los usuarios internos autorizados podrán crear una reserva sin respetar la antelación externa de dos horas.

El formulario tendrá una opción:

```text
Operación no planificada
```

Al activarla:

* Se permitirá utilizar la hora actual.
* Se podrá indicar que el vehículo ya ha llegado.
* Se podrá crear directamente en estado `checked_in`.
* Se registrará el usuario que ha creado la operación.
* Se guardará un motivo.
* La acción aparecerá en auditoría.

Motivos sugeridos:

* Llegada sin cita.
* Urgencia de producción.
* Cambio de planificación.
* Regularización de operación.
* Incidencia logística.
* Instrucción interna.

El sistema continuará evitando solapamientos, salvo que el muelle tenga capacidad superior a uno.

---

## 27. Administración

La administración incluirá:

### Estructura

* Empresas.
* Plantas.
* Naves.
* Muelles.

### Operación

* Horarios.
* Excepciones.
* Festivos.
* Bloqueos.
* Duraciones.
* Tipos de operación.

### Usuarios

* Usuarios internos.
* Usuarios externos.
* Invitaciones.
* Roles.
* Plantas autorizadas.
* Muelles autorizados.
* Departamentos.
* Desactivación de cuentas.

### Proveedores

* Proveedores.
* Transportistas.
* Productos autorizados.
* Plantas autorizadas.
* Muelles autorizados.
* Necesidad de aprobación.

### Configuración

* Zona horaria por planta.
* Antelación externa.
* Antelación interna.
* Duración de intervalos.
* Campos obligatorios.
* Plantillas de correo.
* Idiomas.
* Recordatorios.
* Motivos de cancelación.
* Estados operativos.

### Auditoría

* Accesos.
* Invitaciones.
* Cambios de permisos.
* Creación de reservas.
* Modificaciones.
* Cancelaciones.
* Cambios de estado.
* Bloqueos.
* Errores de autorización.

---

## 28. Row Level Security

Todas las tablas expuestas tendrán RLS habilitado.

No se permitirá acceso a datos logísticos mediante el rol anónimo.

Una persona no autenticada únicamente podrá acceder a:

* Inicio de sesión.
* Recuperación de contraseña.
* Aceptación de invitación.
* Cambio de contraseña.

### 28.1. Superadministrador

Podrá consultar y modificar toda la información.

### 28.2. Administrador de empresa

Solo podrá acceder a organizaciones asignadas.

### 28.3. Administrador de planta

Solo podrá acceder a plantas asignadas.

### 28.4. Planificador

Solo podrá gestionar reservas dentro de sus plantas o muelles autorizados.

### 28.5. Departamento

Solo podrá consultar o modificar reservas relacionadas con sus departamentos autorizados.

### 28.6. Operador de muelle

Solo podrá consultar muelles asignados.

Solo podrá modificar campos operativos autorizados.

### 28.7. Proveedor

Solo podrá:

* Ver su proveedor.
* Ver sus plantas autorizadas.
* Ver sus muelles permitidos.
* Consultar disponibilidad permitida.
* Crear reservas para su proveedor.
* Ver sus propias reservas o las de su proveedor, según su rol.
* Modificar reservas autorizadas.
* Cancelar reservas autorizadas.

No podrá:

* Ver otros proveedores.
* Leer notas internas.
* Cambiar su proveedor.
* Seleccionar plantas no autorizadas.
* Seleccionar muelles no autorizados.
* Utilizar productos incompatibles.
* Modificar estados internos.
* Saltarse la disponibilidad.
* Reservar con menos de dos horas de antelación.
* Leer tablas administrativas.

### 28.8. Funciones con privilegios

Las operaciones sensibles se realizarán mediante funciones controladas:

* `create_booking`
* `update_booking`
* `cancel_booking`
* `invite_user`
* `approve_booking`
* `reject_booking`
* `assign_dock`
* `set_booking_status`

Cada función comprobará el usuario autenticado y sus permisos.

Las claves administrativas de Supabase no se expondrán al frontend.

---

## 29. Vistas de base de datos

Se crearán vistas específicas para simplificar la aplicación.

### Vistas previstas

* `v_internal_calendar`
* `v_external_bookings`
* `v_user_allowed_plants`
* `v_user_allowed_docks`
* `v_supplier_permissions`
* `v_daily_dock_occupancy`
* `v_upcoming_bookings`
* `v_booking_details`
* `v_pending_approvals`
* `v_operational_status`
* `v_booking_statistics`

Las vistas accesibles desde el frontend deberán respetar RLS.

Las vistas externas no incluirán:

* Notas internas.
* Información de otros proveedores.
* Datos administrativos.
* Auditoría.
* Información confidencial.

---

## 30. Correos electrónicos

Supabase Auth enviará:

* Invitación de usuario.
* Recuperación de contraseña.
* Confirmación de cambio de contraseña.
* Avisos de seguridad.

Las Edge Functions enviarán:

* Confirmación de reserva.
* Reserva pendiente de aprobación.
* Reserva aprobada.
* Reserva rechazada.
* Reserva modificada.
* Reserva cancelada.
* Cambio de muelle.
* Recordatorio.
* Aviso interno de nueva solicitud.
* Aviso interno de cancelación tardía.
* Aviso de operación no planificada.

### Remitente

Se utilizará una cuenta o servicio SMTP autorizado.

No se utilizará directamente la contraseña normal del correo corporativo.

Se utilizará:

* Relay SMTP corporativo.
* Contraseña específica de aplicación.
* Servicio transaccional autorizado.
* Cuenta técnica dedicada.

Remitente recomendado:

```text
Reservas de muelles Emesa
```

### Enlaces de correo

Los enlaces utilizarán:

```text
https://docksemesa.netlify.app
```

Las rutas dependerán del tipo de mensaje:

```text
/auth/aceptar-invitacion
/auth/nueva-password
/reservas/mis-citas
/interno/reservas
```

En pruebas se podrá sustituir únicamente la URL de redirección por una URL local o una vista previa de Netlify.

---

## 31. Confirmación de reserva

Tras crear una reserva, se mostrará una página de confirmación.

También se enviará un correo.

La confirmación incluirá:

* Código de reserva.
* Empresa.
* Planta.
* Dirección.
* Fecha.
* Hora local.
* Zona horaria.
* Nave.
* Muelle, cuando corresponda.
* Tipo de operación.
* Producto.
* Duración.
* Matrícula.
* Referencia.
* Estado.
* Instrucciones de acceso.
* Enlace para consultar o cancelar.

La reserva tendrá un código legible.

Ejemplo:

```text
EPI-20260716-0042
```

Para Ostrava:

```text
OST-20260716-0018
```

Se podrá generar un archivo `.ics` para añadir la cita a Outlook, Google Calendar o Apple Calendar.

---

## 32. Experiencia móvil y escritorio

La aplicación se desarrollará como una PWA responsive.

Esto permitirá:

* Utilizar la misma aplicación en móvil y ordenador.
* Instalarla en la pantalla de inicio.
* Abrirla como una aplicación independiente.
* Mantener una única base de código.
* Adaptar cada pantalla al tamaño del dispositivo.

### Móvil externo

* Navegación simple.
* Formularios por pasos.
* Botones grandes.
* Píldoras táctiles.
* Acción principal fija abajo.
* Una sola columna.
* Campos optimizados para teclado móvil.
* Uso cómodo con una mano.

### Escritorio externo

* Mayor información simultánea.
* Calendario mensual.
* Resumen lateral.
* Formularios amplios.
* Historial en tabla.

### Móvil interno

* Agenda diaria.
* Operaciones próximas.
* Botones rápidos de estado.
* Vista por muelle.
* Acceso rápido a incidencias.

### Escritorio interno

* Calendario completo.
* Vista de varios muelles.
* Arrastrar y soltar, cuando sea seguro.
* Filtros simultáneos.
* Panel lateral de detalle.
* Tablas y exportaciones.

### PWA

Se incorporarán:

* Manifest.
* Iconos.
* Pantalla de inicio.
* Modo `standalone`.
* Instalación en móvil y escritorio.
* Caché del frontend.
* Pantalla de error sin conexión.

No se permitirá confirmar una reserva sin conexión, porque debe comprobarse la disponibilidad real.

---

## 33. Actualización en tiempo real

El calendario interno se actualizará cuando:

* Se cree una reserva.
* Se modifique una reserva.
* Se cancele una reserva.
* Cambie un estado.
* Se cree un bloqueo.
* Se elimine o modifique un bloqueo.

Cuando un proveedor reserve un intervalo, el hueco deberá desaparecer de la disponibilidad del resto de usuarios.

El sistema deberá volver a comprobar la disponibilidad en el momento exacto de la confirmación.

---

## 34. Auditoría

Se creará una tabla:

### `audit_log`

* `id`
* `organization_id`
* `plant_id`
* `user_id`
* `action`
* `entity_type`
* `entity_id`
* `old_values`
* `new_values`
* `source`
* `created_at`

Se registrarán:

* Invitaciones.
* Activación de usuarios.
* Cambios de roles.
* Cambios de plantas.
* Cambios de muelles.
* Creación de reservas.
* Modificación de reservas.
* Cancelaciones.
* Aprobaciones.
* Rechazos.
* Cambios de estado.
* Operaciones no planificadas.
* Bloqueos.
* Cambios de configuración.

### `booking_status_history`

* `id`
* `booking_id`
* `previous_status`
* `new_status`
* `changed_by`
* `reason`
* `created_at`

Las reservas no se eliminarán físicamente desde la interfaz.

---

## 35. Informes

La aplicación incluirá informes sobre:

* Reservas por planta.
* Reservas por nave.
* Reservas por muelle.
* Ocupación por muelle.
* Cargas frente a descargas.
* Reservas por proveedor.
* Reservas por producto.
* Reservas por departamento.
* Duración media.
* Retrasos.
* Cancelaciones.
* Cancelaciones tardías.
* No presentados.
* Operaciones no planificadas.
* Utilización por franja horaria.
* Nivel de ocupación.
* Tiempo de espera.
* Tiempo real de operación.

Se permitirá exportar a:

* CSV.
* Excel.

Los informes respetarán los permisos del usuario.

---

## 36. Idiomas

La aplicación se preparará para varios idiomas.

Idiomas iniciales recomendados:

* Español.
* Inglés.
* Checo.

El idioma podrá configurarse:

* Por usuario.
* Por planta.
* Mediante selección manual.

Los correos podrán utilizar el idioma preferido del usuario.

---

## 37. Variables de configuración

### Frontend público

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_APP_URL=https://docksemesa.netlify.app
VITE_APP_NAME=DockS Emesa
```

Estas variables podrán aparecer en el navegador.

### Variables secretas

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SECRET_KEY
SMTP_PASSWORD
EMAIL_API_KEY
```

Estas variables solo podrán existir en:

* Supabase Edge Functions.
* Entornos de servidor protegidos.
* Configuración secreta autorizada.

Nunca se utilizarán en código ejecutado por el navegador.

---

## 38. Configuración de Netlify

Archivo recomendado:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Esto permitirá recargar rutas como:

```text
/interno/calendario
/reservas/nueva
/auth/aceptar-invitacion
```

sin obtener errores de página no encontrada.

---

## 39. Configuración general por planta

Se podrá configurar:

* Nombre.
* Código.
* Dirección.
* País.
* Zona horaria.
* Idiomas.
* Intervalo de reserva.
* Antelación externa.
* Antelación interna.
* Máximo de días futuros reservables.
* Necesidad de aprobación.
* Duración por defecto.
* Campos obligatorios.
* Festivos.
* Horarios.
* Política de cancelación.
* Notificaciones.
* Instrucciones de acceso.
* Persona de contacto.

### Valores iniciales recomendados

| Configuración                | Valor                  |
| ---------------------------- | ---------------------- |
| Intervalo visual             | 30 minutos             |
| Antelación externa           | 120 minutos            |
| Antelación interna           | 0 minutos              |
| Cancelación externa          | Permitida siempre      |
| Capacidad inicial por muelle | 1                      |
| Registro público             | Desactivado            |
| Confirmación                 | Configurable           |
| Zona horaria Épila           | Europe/Madrid          |
| Zona horaria Ostrava         | Europe/Prague          |
| URL                          | docksemesa.netlify.app |

---

## 40. Fases de implementación

### Fase 1. Base técnica

* Crear proyecto Supabase SCCZ.
* Crear sitio Netlify `docksemesa`.
* Crear repositorio privado.
* Crear frontend React y TypeScript.
* Configurar Netlify.
* Configurar variables.
* Configurar rutas.
* Configurar Supabase Auth.

### Fase 2. Autenticación

* Login.
* Logout.
* Invitaciones.
* Aceptación de invitación.
* Recuperación de contraseña.
* Cambio de contraseña.
* Perfil de usuario.
* Registro público desactivado.

### Fase 3. Modelo de datos

* Empresas.
* Plantas.
* Naves.
* Muelles.
* Proveedores.
* Departamentos.
* Productos.
* Categorías.
* Compatibilidades.
* Usuarios.
* Roles.
* Permisos.

### Fase 4. Seguridad

* Activar RLS.
* Crear políticas.
* Crear funciones seguras.
* Proteger vistas.
* Proteger Edge Functions.
* Crear auditoría.
* Probar accesos denegados.

### Fase 5. Disponibilidad

* Horarios.
* Excepciones.
* Festivos.
* Bloqueos.
* Cálculo de intervalos.
* Antelación externa.
* Antelación interna.
* Prevención de solapamientos.

### Fase 6. Reservas externas

* Asistente de reserva.
* Píldoras de 30 minutos.
* Confirmación.
* Mis citas.
* Modificación.
* Cancelación permanente permitida.
* Correos.
* Archivo `.ics`.

### Fase 7. Gestión interna

* Calendario.
* Filtros.
* Aprobaciones.
* Reserva inmediata.
* Operaciones no planificadas.
* Cambios de estado.
* Gestión de bloqueos.
* Realtime.

### Fase 8. Experiencia de usuario

* Diseño móvil.
* Diseño escritorio.
* PWA.
* Español.
* Inglés.
* Checo.
* Accesibilidad.
* Mensajes de error.

### Fase 9. Informes y validación

* Informes.
* Exportaciones.
* Pruebas de seguridad.
* Pruebas de concurrencia.
* Pruebas móviles.
* Pruebas de zonas horarias.
* Pruebas de correos.
* Pruebas de cancelación.
* Formación interna.

---

## 41. Criterios de aceptación

La aplicación se considerará funcional cuando se cumplan los siguientes puntos:

1. El sitio está disponible en `docksemesa.netlify.app`.
2. El registro público está desactivado.
3. Todos los usuarios acceden mediante invitación.
4. La recuperación de contraseña funciona.
5. Un proveedor no puede consultar datos de otro proveedor.
6. Un proveedor solo puede consultar plantas autorizadas.
7. Un proveedor solo puede reservar muelles autorizados.
8. La compatibilidad de producto y muelle se valida.
9. El usuario externo necesita dos horas de antelación.
10. El usuario interno puede crear una reserva inmediata.
11. El proveedor puede cancelar siempre una reserva no finalizada.
12. Las reservas canceladas mantienen su histórico.
13. No pueden existir reservas solapadas en el mismo muelle.
14. El sistema vuelve a validar la disponibilidad al confirmar.
15. Cada planta utiliza su propia zona horaria.
16. Épila utiliza `Europe/Madrid`.
17. Ostrava utiliza `Europe/Prague`.
18. El calendario interno funciona en escritorio.
19. La agenda interna funciona correctamente en móvil.
20. La reserva externa se puede completar cómodamente desde un teléfono.
21. Las píldoras de disponibilidad se muestran cada 30 minutos.
22. Los correos utilizan la URL correcta.
23. Las URLs locales o de vista previa pueden añadirse para pruebas.
24. Todas las tablas públicas tienen RLS.
25. Las vistas respetan las políticas de seguridad.
26. Ninguna clave secreta aparece en el navegador.
27. Los cambios importantes quedan registrados en auditoría.
28. Se pueden crear operaciones no planificadas.
29. Los cambios aparecen en tiempo real en el calendario.
30. Los usuarios desactivados no pueden acceder.

---

## 42. Resumen definitivo de decisiones

| Elemento                    | Decisión                                            |
| --------------------------- | --------------------------------------------------- |
| Empresa                     | Emesa                                               |
| Planta España               | Épila                                               |
| Planta República Checa      | SCCZ – Ostrava                                      |
| Proyecto Supabase           | SCCZ                                                |
| Sitio Netlify               | docksemesa                                          |
| URL inicial                 | https://docksemesa.netlify.app                      |
| Dominio propio              | No inicialmente                                     |
| Registro público            | No                                                  |
| Acceso                      | Solo mediante invitación                            |
| Intervalos                  | 30 minutos                                          |
| Antelación externa          | 2 horas                                             |
| Antelación interna          | Inmediata                                           |
| Operaciones no planificadas | Permitidas a internos autorizados                   |
| Cancelación del proveedor   | Siempre permitida mientras no esté finalizada       |
| Zona horaria                | Configurable por planta                             |
| Épila                       | Europe/Madrid                                       |
| Ostrava                     | Europe/Prague                                       |
| Entorno                     | Producción                                          |
| Pruebas                     | Mediante URL de redirección local o de vista previa |
| Hosting                     | Netlify                                             |
| Base de datos               | Supabase PostgreSQL                                 |
| Autenticación               | Supabase Auth                                       |
| Seguridad                   | RLS y funciones controladas                         |
| Diseño                      | Responsive y PWA                                    |
| Uso                         | Interno y externo                                   |
