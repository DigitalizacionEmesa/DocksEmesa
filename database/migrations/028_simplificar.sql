-- ==========================================================================
-- 028_simplificar.sql
-- --------------------------------------------------------------------------
-- Simplificación del modelo de usuarios y permisos.
-- De 12 tablas a 6 tablas.
--
-- Cambios:
--   1) profiles gana columnas de employees + email (unificación).
--   2) Se actualiza get_user_supplier() para usar supplier_users.
--   3) Se eliminan tablas redundantes:
--      - permissions + role_permissions (duplican PERMISOS_POR_ROL)
--      - user_warehouse_access (derivable de user_plant_access)
--      - user_department_access (el dept. va en profiles)
--      - user_supplier_access (redundante con supplier_users)
-- ==========================================================================

-- ==========================================================================
-- 1) Ampliar profiles con columnas de employees + email
-- ==========================================================================
alter table public.profiles
    add column if not exists email           text,
    add column if not exists organization_id uuid references public.organizations(id),
    add column if not exists plant_id        uuid references public.plants(id),
    add column if not exists department_id   uuid references public.departments(id),
    add column if not exists position        text;

-- Sincronizar emails desde auth.users (rellenar datos existentes)
update public.profiles p
set email = au.email
from auth.users au
where au.id = p.id
  and p.email is null;

-- ==========================================================================
-- 2) Actualizar get_user_supplier() para usar supplier_users
--    (antes usaba user_supplier_access, que se va a eliminar)
-- ==========================================================================
create or replace function public.get_user_supplier()
returns uuid
language sql
stable
as $$
    select supplier_id
    from public.supplier_users
    where user_id = auth.uid()
    limit 1;
$$;

-- ==========================================================================
-- 3) Eliminar tablas redundantes
--    Orden: primero las que tienen FK referenciadas por otras
-- ==========================================================================
drop table if exists public.role_permissions     cascade;
drop table if exists public.permissions          cascade;
drop table if exists public.user_warehouse_access cascade;
drop table if exists public.user_department_access cascade;
drop table if exists public.user_supplier_access  cascade;
