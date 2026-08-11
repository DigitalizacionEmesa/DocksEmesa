-- ==========================================================================
-- 026_employees_user_link.sql
-- --------------------------------------------------------------------------
-- Vincula un empleado con su usuario de login (perfil).
--
-- Contexto: los permisos se asignan a ROLES (role_permissions) y los roles
-- se asignan a USUARIOS (user_roles). Un "usuario" es un perfil vinculado
-- a una cuenta de Supabase Auth. Para poder asignar roles/permisos a un
-- empleado, el empleado debe enlazarse con su usuario de login.
--
-- Tras ejecutar esto:
--   1) En el módulo Empleados, asigna el campo "Usuario" (elige el perfil).
--   2) En "Roles de usuario" asigna roles a ese usuario.
--   3) Los permisos ya vienen definidos en "Permisos por rol".
-- ==========================================================================

alter table public.employees
    add column if not exists user_id uuid
        references public.profiles(id)
        on delete set null;

-- Un mismo usuario no puede estar enlazado a dos empleados
create unique index if not exists employees_user_id_key
    on public.employees (user_id)
    where user_id is not null;

-- Política RLS para permitir al admin editar el campo user_id (si no existe)
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'employees'
          and policyname = 'admin update employees'
    ) then
        create policy "admin update employees"
            on public.employees
            for update
            to authenticated
            using (public.is_admin());
    end if;
end $$;
