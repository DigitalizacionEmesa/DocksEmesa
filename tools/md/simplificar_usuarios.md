# Simplificación del modelo de usuarios, empleados y permisos

## Situación actual (12 tablas)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PERSONAS (3 tablas)                          │
├──────────────┬──────────────────────┬───────────────────────────────┤
│  profiles    │  employees           │  supplier_users               │
│  (login)     │  (RRHH, sin login)   │  (proveedor ↔ usuario)        │
│  vinculado a │  NO vinculado a      │                               │
│  auth.users  │  profiles            │                               │
└──────────────┴──────────────────────┴───────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        ROLES (2 tablas)                             │
├──────────────────────┬──────────────────────────────────────────────┤
│  roles               │  user_roles                                  │
│  (catálogo)          │  (persona ↔ rol)                             │
└──────────────────────┴──────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   PERMISOS FINOS (2 tablas)                         │
├──────────────────────┬──────────────────────────────────────────────┤
│  permissions         │  role_permissions                            │
│  (catálogo:          │  (rol ↔ permiso)                             │
│   dashboard.view…)   │                                              │
└──────────────────────┴──────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      ACCESOS (5 tablas)                             │
├──────────────────┬──────────────────┬───────────────────────────────┤
│ user_plant_access│ user_warehouse_  │ user_dock_access              │
│                  │ access           │                               │
├──────────────────┼──────────────────┼───────────────────────────────┤
│ user_department_ │ user_supplier_   │                               │
│ access           │ access           │                               │
└──────────────────┴──────────────────┴───────────────────────────────┘
```

**Problemas de esta estructura:**

1. **`employees` y `profiles` son dos caras de la misma moneda.** Empleado = persona que trabaja en Emesa. Perfil = persona que inicia sesión. En la práctica, son la misma persona, pero viven en tablas separadas sin conexión.

2. **`permissions` + `role_permissions` duplican lo que ya hace `PERMISOS_POR_ROL`.** El diccionario en `app.py` mapea roles → permisos; es más mantenible y ya está integrado con el frontend. Las tablas son redundantes.

3. **Hay 5 tablas de accesos cuando la especificación solo pide 2.** `user_plant_access` y `user_dock_access` cubren la necesidad. Las otras tres (`warehouse`, `department`, `supplier`) son derivables o redundantes.

---

## Modelo simplificado propuesto (6 tablas)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PERSONA ÚNICA (2 tablas)                         │
├────────────────────────────────┬────────────────────────────────────┤
│  profiles                     │  supplier_users                    │
│  (UNIÓN de profiles +         │  (proveedor ↔ usuario)             │
│   employees)                  │                                    │
│                               │                                    │
│  Columnas nuevas:             │                                    │
│  · organization_id            │                                    │
│  · plant_id                   │                                    │
│  · department_id              │                                    │
│  · position                   │                                    │
│  · email (ya estaba en auth,  │                                    │
│    se sincroniza aquí)        │                                    │
└────────────────────────────────┴────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ROLES (2 tablas, sin cambios)                    │
├────────────────────────────────┬────────────────────────────────────┤
│  roles                        │  user_roles                        │
│  (catálogo de 9 roles)        │  (persona ↔ rol)                   │
└────────────────────────────────┴────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      ACCESOS (2 tablas)                             │
├────────────────────────────────┬────────────────────────────────────┤
│  user_plant_access             │  user_dock_access                  │
│  (plantas que ve)             │  (muelles que ve)                  │
└────────────────────────────────┴────────────────────────────────────┘
```

**Total: 6 tablas → la mitad que ahora.**

---

## Qué se ELIMINA

| Tabla | Razón |
|---|---|
| `employees` | Se fusiona con `profiles` (mismas columnas + org/plant/dept/position). Los datos de Paco Pico se migran a su perfil. |
| `permissions` | Redundante. El catálogo de permisos vive en `PERMISOS_POR_ROL` (app.py) y `permisos.js`. No necesitamos una tabla para 5 filas de catálogo. |
| `role_permissions` | Redundante. Los permisos de cada rol ya están en `PERMISOS_POR_ROL`. Si un día quieres que sea configurable por UI, se puede añadir; hoy añade complejidad sin valor. |
| `user_warehouse_access` | Derivable: almacén pertenece a planta. Si un usuario tiene acceso a la planta, tiene acceso a todos sus almacenes salvo restricción explícita (que no se usa). |
| `user_department_access` | Redundante: el departamento se asigna directamente en `profiles.department_id`. |
| `user_supplier_access` | Redundante con `supplier_users` (que además tiene el flag `is_admin`). |

---

## Migración de datos (antes de borrar nada)

### Paso 1: Ampliar `profiles`

```sql
alter table public.profiles
  add column if not exists email           text,
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists plant_id        uuid references public.plants(id),
  add column if not exists department_id   uuid references public.departments(id),
  add column if not exists position        text;

-- Sincronizar emails desde auth.users
update public.profiles p
set email = au.email
from auth.users au
where au.id = p.id and p.email is null;
```

### Paso 2: Migrar `employees` → `profiles`

Para cada empleado:
- Si YA existe un usuario con el mismo nombre → vincularlo (actualizar sus campos org/plant/dept/position).
- Si NO existe → se puede dejar la fila en employees temporalmente y luego el admin decide si crearle un usuario.

Estrategia conservadora: NO eliminar employees aún. Añadir `user_id` a employees (migración 026, ya creada) y que cada empleado se vincule manualmente a un perfil. Con el tiempo, cuando todos estén vinculados, se puede dropear employees.

Enfoque alternativo más agresivo: migrar los datos de employees a profiles y dropear employees. Es más limpio pero requiere crear usuarios de Auth para los empleados que no tengan.

### Paso 3: Eliminar tablas redundantes

```sql
drop table if exists public.permissions cascade;
drop table if exists public.role_permissions cascade;
drop table if exists public.user_warehouse_access cascade;
drop table if exists public.user_department_access cascade;
drop table if exists public.user_supplier_access cascade;
```

---

## Impacto en el código

### `app.py`

- Eliminar `permissions`, `role_permissions`, `user_warehouse_access`, `user_department_access`, `user_supplier_access` de `CRUD_TABLAS`.
- Eliminar `role_permissions` de `CRUD_CLAVES`.
- Eliminar `user_supplier_access` de las referencias (ya no se usa en `obtener_proveedor_usuario`).
- Actualizar `obtener_proveedor_usuario` para que use `supplier_users` en vez de `user_supplier_access`.

### `modulos.js`

- Eliminar las entradas: `permissions`, `role_permissions`, `user_warehouse_access`, `user_department_access`, `user_supplier_access`.
- Añadir a `profiles` los campos nuevos: `organization_id`, `plant_id`, `department_id`, `position`.

### `permisos.js`

- Eliminar las entradas del `MODULO_PERMISO` correspondientes.
- Ajustar si `employees` se fusiona con `profiles`.

### `configuracion.js`

- Eliminar de `SECCIONES` los módulos que desaparecen.
- Redistribuir los que quedan.

### `usuarios.js`

- Añadir al formulario los nuevos campos de `profiles`: organización, planta, departamento, puesto.

### Migraciones

- Crear `028_simplificar_usuarios.sql` con los ALTER + DROP.
- Actualizar políticas RLS para las tablas que cambian.

---

## Resultado final

| Antes | Después |
|---|---|
| 12 tablas para usuarios/permisos | 6 tablas |
| `employees` separado de `profiles` | Unificados en `profiles` |
| `permissions` + `role_permissions` | `PERMISOS_POR_ROL` en código |
| 5 tablas de accesos | 2 (`user_plant_access` + `user_dock_access`) |
| Menú de configuración con 29 módulos | ~22 módulos (más manejable) |

---

## Orden de ejecución recomendado

1. **Crear `profiles` con las columnas nuevas** (Paso 1) — no rompe nada, son columnas nuevas.
2. **Eliminar las tablas redundantes** (Paso 3) — hay que quitar referencias en el código primero.
3. **Actualizar el código** (app.py, modulos.js, permisos.js, configuracion.js, usuarios.js).
4. **Decidir qué hacer con `employees`**: mantenerlo hasta que todos los empleados tengan perfil, o migrar ya los datos.
5. **Probar** que todo sigue funcionando.
