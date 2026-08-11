-- ==========================================================================
-- 022_crud_rls_policies.sql
-- --------------------------------------------------------------------------
-- Políticas RLS para los módulos de configuración (CRUD desde el menú).
-- Reglas:
--   - MAESTROS y OPERACIÓN: los autenticados pueden LEER (necesario para el
--     dashboard y los desplegables), pero solo los administradores
--     (public.is_admin()) pueden INSERT/UPDATE/DELETE.
--   - TABLAS SENSIBLES (accesos, auditoría, histórico): solo lectura y
--     gestión para administradores.
--
-- Requiere haber ejecutado antes 021_fix_rls_policies.sql (columna
-- user_type / is_admin() basada en roles).
-- ==========================================================================

-- ==========================================================================
-- 1) Maestros y operación: lectura para autenticados, CRUD solo admin
-- ==========================================================================
do $$
declare
    t text;
begin
    foreach t in array array[
        'organizations', 'plants', 'warehouses', 'docks',
        'suppliers', 'departments', 'product_categories', 'products',
        'roles',
        'dock_product_categories', 'dock_schedule_rules',
        'dock_schedule_exceptions', 'dock_blocks'
    ]
    loop
        execute format('alter table public.%I enable row level security', t);

        execute format('drop policy if exists "read %I" on public.%I', t, t);
        execute format('create policy "read %I" on public.%I for select to authenticated using (true)', t, t);

        execute format('drop policy if exists "admin insert %I" on public.%I', t, t);
        execute format('create policy "admin insert %I" on public.%I for insert to authenticated with check (public.is_admin())', t, t);

        execute format('drop policy if exists "admin update %I" on public.%I', t, t);
        execute format('create policy "admin update %I" on public.%I for update to authenticated using (public.is_admin())', t, t);

        execute format('drop policy if exists "admin delete %I" on public.%I', t, t);
        execute format('create policy "admin delete %I" on public.%I for delete to authenticated using (public.is_admin())', t, t);
    end loop;
end $$;

-- ==========================================================================
-- 2) Tablas sensibles (accesos y permisos): solo administradores
-- ==========================================================================
do $$
declare
    t text;
begin
    foreach t in array array[
        'user_plant_access', 'user_warehouse_access', 'user_dock_access',
        'user_department_access', 'supplier_users',
        'supplier_plant_permissions', 'supplier_dock_permissions',
        'supplier_product_categories'
    ]
    loop
        execute format('alter table public.%I enable row level security', t);

        execute format('drop policy if exists "admin read %I" on public.%I', t, t);
        execute format('create policy "admin read %I" on public.%I for select to authenticated using (public.is_admin())', t, t);

        execute format('drop policy if exists "admin insert %I" on public.%I', t, t);
        execute format('create policy "admin insert %I" on public.%I for insert to authenticated with check (public.is_admin())', t, t);

        execute format('drop policy if exists "admin update %I" on public.%I', t, t);
        execute format('create policy "admin update %I" on public.%I for update to authenticated using (public.is_admin())', t, t);

        execute format('drop policy if exists "admin delete %I" on public.%I', t, t);
        execute format('create policy "admin delete %I" on public.%I for delete to authenticated using (public.is_admin())', t, t);
    end loop;
end $$;

-- ==========================================================================
-- 3) Auditoría e histórico: solo lectura para administradores
-- ==========================================================================
do $$
declare
    t text;
begin
    foreach t in array array['audit_log', 'booking_status_history']
    loop
        execute format('alter table public.%I enable row level security', t);

        execute format('drop policy if exists "admin read %I" on public.%I', t, t);
        execute format('create policy "admin read %I" on public.%I for select to authenticated using (public.is_admin())', t, t);
    end loop;
end $$;

-- ==========================================================================
-- 4) Perfiles y roles: el administrador puede hacer CRUD completo
--    (complementa las políticas de la migración 021 para el propio usuario)
-- ==========================================================================
drop policy if exists "admin insert profiles" on public.profiles;
create policy "admin insert profiles"
    on public.profiles
    for insert
    to authenticated
    with check (
        public.is_admin()
    );

drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles"
    on public.profiles
    for update
    to authenticated
    using (
        public.is_admin()
    );

drop policy if exists "admin delete profiles" on public.profiles;
create policy "admin delete profiles"
    on public.profiles
    for delete
    to authenticated
    using (
        public.is_admin()
    );

drop policy if exists "admin update roles" on public.user_roles;
create policy "admin update roles"
    on public.user_roles
    for update
    to authenticated
    using (
        public.is_admin()
    );

drop policy if exists "admin delete roles" on public.user_roles;
create policy "admin delete roles"
    on public.user_roles
    for delete
    to authenticated
    using (
        public.is_admin()
    );
