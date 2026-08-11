-- ==========================================================================
-- 024_roles_sistema.sql
-- --------------------------------------------------------------------------
-- Sistema de permisos por rol (Dock Management).
-- Añade los roles del nuevo modelo y los asigna a los usuarios según los
-- roles heredados del seed original (compatibilidad).
--
-- Roles nuevos:
--   DEVELOPER      - Acceso completo, todas las plantas, configuración, auditoría.
--   SYSTEM_ADMIN   - Organización, plantas, usuarios, proveedores, config general.
--   PLANT_ADMIN    - Reservas de su planta, muelles, horarios, proveedores asociados.
--   PLANT_OPERATOR - Consultar calendario/reservas, actualizar estados.
--   SUPPLIER_USER  - Crear/ver/cancelar sus propias reservas.
-- ==========================================================================

-- 1) Insertar los roles nuevos (si no existen)
insert into public.roles (name, description)
select * from (values
    ('DEVELOPER',      'Usuario técnico: acceso completo, todas las plantas y configuración'),
    ('SYSTEM_ADMIN',   'Administrador global: organización, plantas, usuarios, proveedores'),
    ('PLANT_ADMIN',    'Administrador de planta: reservas, muelles, horarios y proveedores de su planta'),
    ('PLANT_OPERATOR', 'Operario: consultar calendario y reservas, actualizar estados'),
    ('SUPPLIER_USER',  'Usuario proveedor: crear, ver y cancelar sus propias reservas')
) as t(name, description)
where not exists (select 1 from public.roles r where r.name = t.name);

-- 2) Asignar los roles nuevos a los usuarios según sus roles heredados
--    (la clave de permisos en app.py también reconoce los roles antiguos,
--    así que nada se rompe aunque no se ejecute esta migración).

-- super_admin -> DEVELOPER
insert into public.user_roles (user_id, role_id)
select distinct ur.user_id, r2.id
from public.user_roles ur
join public.roles r1 on r1.id = ur.role_id
join public.roles r2 on r2.name = 'DEVELOPER'
where r1.name = 'super_admin'
on conflict do nothing;

-- company_admin -> SYSTEM_ADMIN
insert into public.user_roles (user_id, role_id)
select distinct ur.user_id, r2.id
from public.user_roles ur
join public.roles r1 on r1.id = ur.role_id
join public.roles r2 on r2.name = 'SYSTEM_ADMIN'
where r1.name = 'company_admin'
on conflict do nothing;

-- plant_admin -> PLANT_ADMIN
insert into public.user_roles (user_id, role_id)
select distinct ur.user_id, r2.id
from public.user_roles ur
join public.roles r1 on r1.id = ur.role_id
join public.roles r2 on r2.name = 'PLANT_ADMIN'
where r1.name = 'plant_admin'
on conflict do nothing;

-- planner / department_manager / dock_operator / internal_viewer -> PLANT_OPERATOR
insert into public.user_roles (user_id, role_id)
select distinct ur.user_id, r2.id
from public.user_roles ur
join public.roles r1 on r1.id = ur.role_id
join public.roles r2 on r2.name = 'PLANT_OPERATOR'
where r1.name in ('planner', 'department_manager', 'dock_operator', 'internal_viewer')
on conflict do nothing;

-- supplier_admin / supplier_user -> SUPPLIER_USER
insert into public.user_roles (user_id, role_id)
select distinct ur.user_id, r2.id
from public.user_roles ur
join public.roles r1 on r1.id = ur.role_id
join public.roles r2 on r2.name = 'SUPPLIER_USER'
where r1.name in ('supplier_admin', 'supplier_user')
on conflict do nothing;
