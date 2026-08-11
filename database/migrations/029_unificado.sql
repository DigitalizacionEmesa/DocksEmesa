-- ==========================================================================
-- 029_unificado.sql — Esquema definitivo simplificado MESA DOCK
-- ==========================================================================
-- EJECUTAR EN EL SQL EDITOR DE SUPABASE.
-- ⚠️ Borra datos de las tablas de usuarios/permisos antiguas.
--    Los datos de negocio (orgs, plantas, muelles, bookings...) se conservan.
--
-- Qué hace:
--   1) Elimina TODAS las tablas de permisos/accesos de usuario.
--   2) Renombra profiles → usuarios (única tabla de usuarios).
--   3) Añade a usuarios las columnas: email, role_id, organization_id,
--      plant_id, department_id, position, supplier_id.
--   4) Recrea funciones (is_admin, get_user_supplier).
--   5) RLS básica para usuarios.
--   6) Seed de roles mínimos.
-- ==========================================================================

begin;

-- ==========================================================================
-- 1) Eliminar tablas de permisos y accesos (ya no se usan)
-- ==========================================================================
drop table if exists public.role_permissions      cascade;
drop table if exists public.permissions            cascade;
drop table if exists public.user_warehouse_access  cascade;
drop table if exists public.user_department_access cascade;
drop table if exists public.user_supplier_access   cascade;
drop table if exists public.user_plant_access      cascade;
drop table if exists public.user_dock_access       cascade;
drop table if exists public.supplier_users         cascade;
drop table if exists public.supplier_dock_permissions cascade;
drop table if exists public.supplier_product_categories cascade;
drop table if exists public.employees              cascade;
drop table if exists public.user_roles             cascade;

-- ==========================================================================
-- 2) Renombrar profiles → usuarios (conserva FKs de bookings/audit)
-- ==========================================================================
alter table if exists public.profiles rename to usuarios;

-- ==========================================================================
-- 3) Añadir columnas que unifican todo en usuarios
-- ==========================================================================
alter table public.usuarios
    add column if not exists email             text,
    add column if not exists role_id           uuid references public.roles(id) on delete set null,
    add column if not exists organization_id   uuid references public.organizations(id) on delete set null,
    add column if not exists plant_id          uuid references public.plants(id) on delete set null,
    add column if not exists department_id     uuid references public.departments(id) on delete set null,
    add column if not exists position          text,
    add column if not exists supplier_id       uuid references public.suppliers(id) on delete set null;

-- ==========================================================================
-- 4) Sincronizar emails desde auth.users
-- ==========================================================================
update public.usuarios u
set email = au.email
from auth.users au
where au.id = u.id
  and u.email is null;

-- ==========================================================================
-- 5) Recrear funciones auxiliares
-- ==========================================================================

-- is_admin: el usuario es admin si su rol es DEVELOPER, SYSTEM_ADMIN o PLANT_ADMIN
-- security definer: evita recursión RLS al consultar la propia tabla usuarios
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.usuarios u
        join public.roles r on r.id = u.role_id
        where u.id = auth.uid()
          and r.name in ('DEVELOPER', 'SYSTEM_ADMIN', 'PLANT_ADMIN')
    );
$$;

-- current_user_id
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select auth.uid();
$$;

-- get_user_supplier: devuelve el proveedor asociado al usuario autenticado
create or replace function public.get_user_supplier()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select supplier_id
    from public.usuarios
    where id = auth.uid()
    limit 1;
$$;

-- get_user_plant: devuelve la planta asociada al usuario
create or replace function public.get_user_plant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select plant_id
    from public.usuarios
    where id = auth.uid()
    limit 1;
$$;

-- ==========================================================================
-- 6) RLS: políticas básicas para usuarios
-- ==========================================================================
alter table public.usuarios enable row level security;

drop policy if exists "usuarios_select_admin" on public.usuarios;
create policy "usuarios_select_admin"
    on public.usuarios
    for select
    to authenticated
    using (public.is_admin());

drop policy if exists "usuarios_select_self" on public.usuarios;
create policy "usuarios_select_self"
    on public.usuarios
    for select
    to authenticated
    using (id = auth.uid());

drop policy if exists "usuarios_insert_admin" on public.usuarios;
create policy "usuarios_insert_admin"
    on public.usuarios
    for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "usuarios_update_admin" on public.usuarios;
create policy "usuarios_update_admin"
    on public.usuarios
    for update
    to authenticated
    using (public.is_admin());

drop policy if exists "usuarios_delete_admin" on public.usuarios;
create policy "usuarios_delete_admin"
    on public.usuarios
    for delete
    to authenticated
    using (public.is_admin());

-- ==========================================================================
-- 7) Asegurar que existen los roles mínimos
-- ==========================================================================
insert into public.roles (name, description)
select * from (values
    ('DEVELOPER',      'Acceso completo a todo el sistema'),
    ('SYSTEM_ADMIN',   'Administrador: organización, plantas, usuarios, proveedores'),
    ('PLANT_ADMIN',    'Administrador de una planta específica'),
    ('PLANT_OPERATOR', 'Operario: consultar y actualizar estados de reservas'),
    ('SUPPLIER_USER',  'Proveedor: crear y gestionar sus propias reservas')
) as t(name, description)
on conflict (name) do nothing;

-- ==========================================================================
-- 8) Asignar roles existentes: los usuarios que vienen de profiles
--    heredan el rol según su user_type (aproximación inicial)
-- ==========================================================================
-- Los que eran 'internal' → SYSTEM_ADMIN por defecto (luego ajustable)
update public.usuarios u
set role_id = r.id
from public.roles r
where r.name = 'SYSTEM_ADMIN'
  and u.role_id is null
  and u.user_type = 'internal';

-- Los que eran 'supplier' → SUPPLIER_USER
update public.usuarios u
set role_id = r.id
from public.roles r
where r.name = 'SUPPLIER_USER'
  and u.role_id is null
  and u.user_type = 'supplier';

commit;
