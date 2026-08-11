-- ==========================================================================
-- 025_crud_nuevas_tablas.sql
-- --------------------------------------------------------------------------
-- Políticas RLS para las tablas nuevas que se añadieron a la base de datos:
--   employees, permissions, role_permissions, user_supplier_access
--
-- Reglas (igual que 022):
--   - employees / permissions : lectura para autenticados, CRUD solo admin.
--   - role_permissions / user_supplier_access : lectura y CRUD solo admin
--     (tablas sensibles de permisos y accesos).
-- ==========================================================================

-- ==========================================================================
-- 1) employees y permissions: lectura para autenticados, CRUD solo admin
-- ==========================================================================
do $$
declare
    t text;
begin
    foreach t in array array['employees', 'permissions']
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
-- 2) role_permissions y user_supplier_access: solo administradores
-- ==========================================================================
do $$
declare
    t text;
begin
    foreach t in array array['role_permissions', 'user_supplier_access']
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
