-- ==========================================================================
-- 032_limpieza_datos.sql — LIMPIEZA Y REINICIO DE DATOS MESA DOCK (SCCZ)
-- ==========================================================================
-- EJECUTAR EN EL SQL EDITOR DE SUPABASE.
--
-- Qué hace:
--   1) BORRA todos los datos operativos actuales (reservas, disponibilidad,
--      muelles, naves, plantas, usuarios, proveedores, departamentos, ...)
--      respetando el orden de las claves foráneas.
--   2) Normaliza los roles a: admin / interno / proveedor.
--   3) Re-siembra datos coherentes con el funcional pedro_funcional.md:
--         Plantas -> Naves -> Muelles (3 niveles)
--         Disponibilidad por muelle (L-V)
--         Proveedores, departamentos
--         Perfiles de usuario vinculados a los auth.users existentes
--         Asignaciones usuario->plantas y proveedor->muelles
--   4) Bloque OPCIONAL de reservas y excepciones de ejemplo (próximos días).
--
-- IMPORTANTE:
--   - Los usuarios de auth (email/contraseña) NO se borran ni se crean aquí
--     (sus contraseñas son intocables). Solo se re-crean sus FILAS de perfil
--     en la tabla public.usuarios y sus asignaciones.
--   - Si quieres crear cuentas nuevas para proveedores, hazlo desde la app
--     (módulo Usuarios / invitación) como pide el funcional.
-- ==========================================================================

begin;

-- ==========================================================================
-- 1) LIMPIEZA DE DATOS (orden inverso a las dependencias FK)
-- ==========================================================================

delete from public.reservas;
delete from public.excepciones_muelles;
delete from public.disponibilidad_muelles;
delete from public.proveedor_muelles;
delete from public.usuario_plantas;
delete from public.muelles;
delete from public.naves;
delete from public.plantas;
delete from public.usuarios;
delete from public.proveedores;
delete from public.departamentos;

-- ==========================================================================
-- 2) ROLES: admin / interno / proveedor
--    ('externo' se renombra a 'proveedor' conservando el mismo id -> FK intacta)
-- ==========================================================================

update public.roles
set nombre = 'proveedor', descripcion = 'Usuario externo proveedor'
where nombre = 'externo'
  and not exists (select 1 from public.roles where nombre = 'proveedor');

insert into public.roles (nombre, descripcion)
values
    ('admin',     'Administrador del sistema'),
    ('interno',   'Usuario interno SCCZ'),
    ('proveedor', 'Usuario externo proveedor')
on conflict (nombre) do nothing;

-- ==========================================================================
-- 3) PLANTAS  (3 niveles: Planta > Nave > Muelle)
-- ==========================================================================

insert into public.plantas (nombre, activo)
values
    ('EMESA Épila',   true),
    ('SCCZ Ostrava',  true);

-- ==========================================================================
-- 4) NAVES
-- ==========================================================================

insert into public.naves (planta_id, nombre, activo)
select p.id, n.nombre, true
from public.plantas p
cross join (values
    ('Nave 1'),
    ('Nave 2')
) as n(nombre)
where p.nombre = 'EMESA Épila';

insert into public.naves (planta_id, nombre, activo)
select p.id, 'Nave 1', true
from public.plantas p
where p.nombre = 'SCCZ Ostrava';

-- ==========================================================================
-- 5) MUELLES (numerados por nave: Muelle 1, Muelle 2, ...)
--    Épila  Nave 1: Muelle 1-3 | Nave 2: Muelle 1-2
--    Ostrava Nave 1: Muelle 1-3
-- ==========================================================================

insert into public.muelles (nave_id, nombre, activo)
select n.id, 'Muelle ' || g.numero, true
from public.naves n
join public.plantas p on p.id = n.planta_id
cross join generate_series(1, 3) as g(numero)
where p.nombre = 'EMESA Épila' and n.nombre = 'Nave 1';

insert into public.muelles (nave_id, nombre, activo)
select n.id, 'Muelle ' || g.numero, true
from public.naves n
join public.plantas p on p.id = n.planta_id
cross join generate_series(1, 2) as g(numero)
where p.nombre = 'EMESA Épila' and n.nombre = 'Nave 2';

insert into public.muelles (nave_id, nombre, activo)
select n.id, 'Muelle ' || g.numero, true
from public.naves n
join public.plantas p on p.id = n.planta_id
cross join generate_series(1, 3) as g(numero)
where p.nombre = 'SCCZ Ostrava' and n.nombre = 'Nave 1';

-- ==========================================================================
-- 6) DISPONIBILIDAD POR MUELLE
--    Todos los muelles: Lunes-Viernes (dia_semana 0..4) de 07:00 a 15:00
-- ==========================================================================

insert into public.disponibilidad_muelles
    (muelle_id, dia_semana, hora_inicio, hora_fin, activo)
select m.id, g.dia, '07:00:00', '15:00:00', true
from public.muelles m
cross join generate_series(0, 4) as g(dia);

-- ==========================================================================
-- 7) PROVEEDORES
-- ==========================================================================

insert into public.proveedores (nombre, email_contacto, activo)
values
    ('UPS',                    'contacto@ups.com',             true),
    ('DHL Express',            'contacto@dhl.com',             true),
    ('Transportes Europa CZ',  'info@transporteuropa.cz',      true),
    ('Logística Ibérica',      'info@logisticaiberica.es',     true);

-- ==========================================================================
-- 8) DEPARTAMENTOS
-- ==========================================================================

insert into public.departamentos (nombre)
values
    ('Producción'),
    ('Logística'),
    ('Compras'),
    ('Expediciones'),
    ('Calidad'),
    ('Transporte');

-- ==========================================================================
-- 9) USUARIOS (perfiles vinculados a los auth.users existentes)
--    No se crean cuentas auth nuevas: se re-vincula cada auth.user existente.
-- ==========================================================================

-- 9.1 Admin: j.barutell@saveragroup.com
insert into public.usuarios
    (id, nombre, apellidos, rol_id, proveedor_id, departamento_id, activo)
select
    au.id,
    'José',
    'de Barutell',
    (select id from public.roles where nombre = 'admin'),
    null,
    (select id from public.departamentos where nombre = 'Logística'),
    true
from auth.users au
where au.email = 'j.barutell@saveragroup.com'
on conflict (id) do nothing;

-- 9.2 Interno: digitalizacion.emesa@saveragroup.com
insert into public.usuarios
    (id, nombre, apellidos, rol_id, proveedor_id, departamento_id, activo)
select
    au.id,
    'Digitalización',
    'SCCZ',
    (select id from public.roles where nombre = 'interno'),
    null,
    (select id from public.departamentos where nombre = 'Logística'),
    true
from auth.users au
where au.email = 'digitalizacion.emesa@saveragroup.com'
on conflict (id) do nothing;

-- 9.3 Proveedor UPS: testups@ups.com
insert into public.usuarios
    (id, nombre, apellidos, rol_id, proveedor_id, departamento_id, activo)
select
    au.id,
    'Transportista',
    'UPS',
    (select id from public.roles where nombre = 'proveedor'),
    (select id from public.proveedores where nombre = 'UPS'),
    null,
    true
from auth.users au
where au.email = 'testups@ups.com'
on conflict (id) do nothing;

-- ==========================================================================
-- 10) ASIGNACIONES USUARIO -> PLANTAS
--     (admin/interno -> todas; proveedor -> las plantas donde puede operar)
-- ==========================================================================

insert into public.usuario_plantas (usuario_id, planta_id)
select au.id, p.id
from auth.users au
cross join public.plantas p
where au.email in ('j.barutell@saveragroup.com', 'digitalizacion.emesa@saveragroup.com')
on conflict (usuario_id, planta_id) do nothing;

insert into public.usuario_plantas (usuario_id, planta_id)
select au.id, p.id
from auth.users au
cross join public.plantas p
where au.email = 'testups@ups.com'
  and p.nombre in ('EMESA Épila', 'SCCZ Ostrava')
on conflict (usuario_id, planta_id) do nothing;

-- ==========================================================================
-- 11) ASIGNACIONES PROVEEDOR -> MUELLES
--     Coherente con las plantas asignadas a los usuarios del proveedor.
--     (Los demás proveedores se asignan cuando tengan usuarios, desde la app.)
-- ==========================================================================

insert into public.proveedor_muelles (proveedor_id, muelle_id)
select pr.id, m.id
from public.proveedores pr
cross join (
    select m.id
    from public.muelles m
    join public.naves n on n.id = m.nave_id
    join public.plantas p on p.id = n.planta_id
    where p.nombre = 'SCCZ Ostrava'
      and n.nombre = 'Nave 1'
      and m.nombre in ('Muelle 1', 'Muelle 2')
) m
where pr.nombre = 'UPS'
on conflict (proveedor_id, muelle_id) do nothing;

insert into public.proveedor_muelles (proveedor_id, muelle_id)
select pr.id, m.id
from public.proveedores pr
cross join (
    select m.id
    from public.muelles m
    join public.naves n on n.id = m.nave_id
    join public.plantas p on p.id = n.planta_id
    where p.nombre = 'EMESA Épila'
      and n.nombre = 'Nave 1'
      and m.nombre = 'Muelle 1'
) m
where pr.nombre = 'UPS'
on conflict (proveedor_id, muelle_id) do nothing;

-- ==========================================================================
-- 12) [OPCIONAL] RESERVAS DE EJEMPLO (próximos días)
--     Comenta este bloque si quieres empezar con el calendario vacío.
--     Las fechas se calculan a partir de CURRENT_DATE para que siempre
--     estén en el futuro cercano.
-- ==========================================================================

-- Proveedor UPS -> Ostrava Nave 1 Muelle 1
insert into public.reservas
    (muelle_id, usuario_id, fecha, hora_inicio, hora_fin, tipo, estado, observaciones)
select m.id, au.id, current_date + 1, '08:00:00', '08:30:00', 'descarga', 'pendiente',
       'Entrega materia prima'
from public.muelles m
join public.naves n on n.id = m.nave_id
join public.plantas p on p.id = n.planta_id
cross join auth.users au
where p.nombre = 'SCCZ Ostrava' and n.nombre = 'Nave 1' and m.nombre = 'Muelle 1'
  and au.email = 'testups@ups.com';

insert into public.reservas
    (muelle_id, usuario_id, fecha, hora_inicio, hora_fin, tipo, estado, observaciones)
select m.id, au.id, current_date + 1, '10:00:00', '11:00:00', 'descarga', 'pendiente',
       'Camión completo'
from public.muelles m
join public.naves n on n.id = m.nave_id
join public.plantas p on p.id = n.planta_id
cross join auth.users au
where p.nombre = 'SCCZ Ostrava' and n.nombre = 'Nave 1' and m.nombre = 'Muelle 1'
  and au.email = 'testups@ups.com';

-- Admin -> Épila Nave 1 Muelle 1
insert into public.reservas
    (muelle_id, usuario_id, fecha, hora_inicio, hora_fin, tipo, estado, observaciones)
select m.id, au.id, current_date + 1, '08:30:00', '09:30:00', 'descarga', 'pendiente',
       'Planificada por Logística'
from public.muelles m
join public.naves n on n.id = m.nave_id
join public.plantas p on p.id = n.planta_id
cross join auth.users au
where p.nombre = 'EMESA Épila' and n.nombre = 'Nave 1' and m.nombre = 'Muelle 1'
  and au.email = 'j.barutell@saveragroup.com';

insert into public.reservas
    (muelle_id, usuario_id, fecha, hora_inicio, hora_fin, tipo, estado, observaciones)
select m.id, au.id, current_date + 2, '11:00:00', '12:00:00', 'carga', 'pendiente',
       'Expedición producto terminado'
from public.muelles m
join public.naves n on n.id = m.nave_id
join public.plantas p on p.id = n.planta_id
cross join auth.users au
where p.nombre = 'EMESA Épila' and n.nombre = 'Nave 2' and m.nombre = 'Muelle 1'
  and au.email = 'j.barutell@saveragroup.com';

-- ==========================================================================
-- 13) [OPCIONAL] EXCEPCIONES DE EJEMPLO (mantenimiento / cierre)
--     Comenta este bloque si no quieres excepciones de ejemplo.
-- ==========================================================================

-- Épila Nave 1 Muelle 2 cerrado la mañana de mañana
insert into public.excepciones_muelles
    (muelle_id, fecha, hora_inicio, hora_fin, motivo, activo)
select m.id, current_date + 1, '07:00:00', '10:00:00', 'mantenimiento', true
from public.muelles m
join public.naves n on n.id = m.nave_id
join public.plantas p on p.id = n.planta_id
where p.nombre = 'EMESA Épila' and n.nombre = 'Nave 1' and m.nombre = 'Muelle 2';

-- ==========================================================================
-- VERIFICACIÓN (recuento por tabla tras la limpieza)
-- ==========================================================================

select 'roles' as tabla, count(*) from public.roles
union all select 'plantas', count(*) from public.plantas
union all select 'naves', count(*) from public.naves
union all select 'muelles', count(*) from public.muelles
union all select 'disponibilidad_muelles', count(*) from public.disponibilidad_muelles
union all select 'proveedores', count(*) from public.proveedores
union all select 'departamentos', count(*) from public.departamentos
union all select 'usuarios', count(*) from public.usuarios
union all select 'usuario_plantas', count(*) from public.usuario_plantas
union all select 'proveedor_muelles', count(*) from public.proveedor_muelles
union all select 'reservas', count(*) from public.reservas
union all select 'excepciones_muelles', count(*) from public.excepciones_muelles
order by tabla;

commit;
