create table public.roles (

    id uuid primary key default gen_random_uuid(),


    name text unique not null,


    description text,


    created_at timestamptz
        not null default now()

);



insert into public.roles
(
    name,
    description
)
values

(
    'super_admin',
    'Administrador global del sistema'
),

(
    'company_admin',
    'Administrador de empresa'
),

(
    'plant_admin',
    'Administrador de planta'
),

(
    'planner',
    'Planificador de muelles'
),

(
    'department_manager',
    'Responsable de departamento'
),

(
    'dock_operator',
    'Operador de muelle'
),

(
    'internal_viewer',
    'Usuario interno consulta'
),

(
    'supplier_admin',
    'Administrador proveedor'
),

(
    'supplier_user',
    'Usuario proveedor'
);