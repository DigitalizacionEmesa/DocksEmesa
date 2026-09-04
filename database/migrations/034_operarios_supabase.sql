-- Credenciales de operarios importadas desde el DataLake corporativo.
-- Solo el backend con la clave de servicio puede consultar esta tabla.

begin;

create table if not exists public.operarios_login (
    usuario_id uuid primary key references public.usuarios(id) on delete cascade,
    numero_operario text not null unique,
    nombre text,
    correo text,
    password_hash text not null,
    nivel_permisos text,
    roles_origen text,
    activo boolean not null default true,
    importado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

alter table public.operarios_login enable row level security;

revoke all on table public.operarios_login from anon, authenticated;

comment on table public.operarios_login is
    'Credenciales corporativas cifradas importadas. Acceso exclusivo del backend.';

commit;
