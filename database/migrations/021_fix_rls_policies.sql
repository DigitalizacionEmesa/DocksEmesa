-- ==========================================================================
-- 021_fix_rls_policies.sql
-- --------------------------------------------------------------------------
-- Corrección de políticas RLS para que los perfiles y roles se puedan crear.
-- Problema: las migraciones activan RLS pero no definen políticas de INSERT
-- para public.profiles ni public.user_roles, por lo que el alta de usuarios
-- (y de perfiles) queda bloqueada con error 42501.
--
-- También añade la columna user_type a profiles (estaba en la migración 006
-- pero no llegó a la base de datos real) y corrige la función is_admin()
-- para que use la tabla de roles en lugar de la columna inexistente.
-- ==========================================================================

-- 1) Añadir columna user_type a profiles (si falta)
alter table public.profiles
    add column if not exists user_type text
        not null default 'internal'
        check (
            user_type in (
                'internal',
                'supplier'
            )
        );

-- 2) Corregir is_admin() para que use la tabla roles + user_roles
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid()
        and r.name in (
            'super_admin',
            'company_admin'
        )
    );
$$;

-- 3) Políticas RLS para profiles
alter table public.profiles enable row level security;

drop policy if exists "users can view profiles" on public.profiles;
create policy "users can view profiles"
    on public.profiles
    for select
    to authenticated
    using (
        true
    );

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
    on public.profiles
    for insert
    to authenticated
    with check (
        auth.uid() = id
    );

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
    on public.profiles
    for update
    to authenticated
    using (
        auth.uid() = id
    );

-- 4) Políticas RLS para user_roles
alter table public.user_roles enable row level security;

drop policy if exists "users can view own roles" on public.user_roles;
create policy "users can view own roles"
    on public.user_roles
    for select
    to authenticated
    using (
        user_id = auth.uid()
        or public.is_admin()
    );

drop policy if exists "admins can insert roles" on public.user_roles;
create policy "admins can insert roles"
    on public.user_roles
    for insert
    to authenticated
    with check (
        public.is_admin()
    );

-- ==========================================================================
-- 5) Alta del usuario demo (ejecutar UNA sola vez).
--    Sustituye los UUID por los del usuario creado en Auth si es otro.
-- ==========================================================================

insert into public.profiles (
    id,
    first_name,
    last_name,
    user_type,
    active,
    preferred_language
)
values (
    '2900b370-fd70-40d7-9df7-75fdcc715749',  -- id del usuario en auth.users
    'Admin',
    'MESA',
    'internal',
    true,
    'es'
)
on conflict (id) do nothing;

insert into public.user_roles (
    user_id,
    role_id
)
values (
    '2900b370-fd70-40d7-9df7-75fdcc715749',
    'ef39283b-4fb9-4e70-a1d1-4e84593cf662'   -- rol super_admin
)
on conflict do nothing;
