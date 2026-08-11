-- =====================================================
-- 021_seed_test_data.sql
-- Datos iniciales de prueba DockS Emesa
-- =====================================================


-- =====================================================
-- ORGANIZACION
-- =====================================================

insert into public.organizations
(
    name,
    code,
    active
)
values
(
    'Emesa',
    'EMESA',
    true
);


-- =====================================================
-- PLANTAS
-- =====================================================

insert into public.plants
(
    organization_id,
    name,
    code,
    country_code,
    city,
    timezone,
    active,
    minimum_external_notice_minutes,
    minimum_internal_notice_minutes
)
values

(
    (select id from public.organizations where code='EMESA'),
    'Épila',
    'EPI',
    'ES',
    'Épila',
    'Europe/Madrid',
    true,
    120,
    0
),

(
    (select id from public.organizations where code='EMESA'),
    'SCCZ Ostrava',
    'OST',
    'CZ',
    'Ostrava',
    'Europe/Prague',
    true,
    120,
    0
);



-- =====================================================
-- NAVES
-- =====================================================


-- Épila

insert into public.warehouses
(
    plant_id,
    name,
    code,
    active,
    sort_order
)
values

(
    (select id from public.plants where code='EPI'),
    'Nave 1',
    'EPI-N1',
    true,
    1
),

(
    (select id from public.plants where code='EPI'),
    'Nave 2',
    'EPI-N2',
    true,
    2
),


-- Ostrava

(
    (select id from public.plants where code='OST'),
    'Nave 1',
    'OST-N1',
    true,
    1
);



-- =====================================================
-- MUELLES
-- =====================================================


-- Épila Nave 1

insert into public.docks
(
    warehouse_id,
    name,
    code,
    capacity,
    default_slot_minutes,
    default_operation_minutes,
    active,
    sort_order
)
values

(
    (select id from public.warehouses where code='EPI-N1'),
    'Muelle 1',
    'EPI-01',
    1,
    30,
    60,
    true,
    1
),

(
    (select id from public.warehouses where code='EPI-N1'),
    'Muelle 2',
    'EPI-02',
    1,
    30,
    60,
    true,
    2
),

(
    (select id from public.warehouses where code='EPI-N1'),
    'Muelle 3',
    'EPI-03',
    1,
    30,
    90,
    true,
    3
),


-- Épila Nave 2

(
    (select id from public.warehouses where code='EPI-N2'),
    'Muelle 4',
    'EPI-04',
    1,
    30,
    60,
    true,
    4
),

(
    (select id from public.warehouses where code='EPI-N2'),
    'Muelle 5',
    'EPI-05',
    1,
    30,
    60,
    true,
    5
),


-- Ostrava

(
    (select id from public.warehouses where code='OST-N1'),
    'Muelle 1',
    'OST-01',
    1,
    30,
    60,
    true,
    1
),

(
    (select id from public.warehouses where code='OST-N1'),
    'Muelle 2',
    'OST-02',
    1,
    30,
    60,
    true,
    2
),

(
    (select id from public.warehouses where code='OST-N1'),
    'Muelle 3',
    'OST-03',
    1,
    30,
    90,
    true,
    3
);



-- =====================================================
-- PROVEEDORES
-- =====================================================


insert into public.suppliers
(
    organization_id,
    legal_name,
    commercial_name,
    supplier_code,
    country_code,
    active,
    requires_approval
)
values


(
    (select id from public.organizations where code='EMESA'),
    'Metalúrgica Aragón S.L.',
    'Metalúrgica Aragón',
    'SUP001',
    'ES',
    true,
    false
),


(
    (select id from public.organizations where code='EMESA'),
    'Transportes Europa CZ',
    'Transportes Europa',
    'SUP002',
    'CZ',
    true,
    true
),


(
    (select id from public.organizations where code='EMESA'),
    'Logística Ibérica S.L.',
    'Logística Ibérica',
    'SUP003',
    'ES',
    true,
    false
);



-- =====================================================
-- DEPARTAMENTOS
-- =====================================================


insert into public.departments
(
    organization_id,
    name,
    code,
    active
)

values

(
(select id from public.organizations where code='EMESA'),
'Producción',
'PROD',
true
),

(
(select id from public.organizations where code='EMESA'),
'Logística',
'LOG',
true
),

(
(select id from public.organizations where code='EMESA'),
'Compras',
'COM',
true
),

(
(select id from public.organizations where code='EMESA'),
'Expediciones',
'EXP',
true
),

(
(select id from public.organizations where code='EMESA'),
'Calidad',
'CAL',
true
);



-- =====================================================
-- CATEGORIAS DE PRODUCTO
-- =====================================================


insert into public.product_categories
(
organization_id,
name,
code,
active
)

values

(
(select id from public.organizations where code='EMESA'),
'Materia prima',
'MP',
true
),

(
(select id from public.organizations where code='EMESA'),
'Producto terminado',
'PT',
true
),

(
(select id from public.organizations where code='EMESA'),
'Embalajes',
'EMB',
true
),

(
(select id from public.organizations where code='EMESA'),
'Componentes',
'COMP',
true
),

(
(select id from public.organizations where code='EMESA'),
'Repuestos',
'REP',
true
);



-- =====================================================
-- HORARIOS DE MUELLES
-- Lunes-Viernes 07:00-15:00
-- =====================================================


insert into public.dock_schedule_rules
(
dock_id,
day_of_week,
start_time,
end_time,
slot_minutes,
active
)

select
id,
generate_series(1,5),
'07:00',
'15:00',
30,
true

from public.docks;