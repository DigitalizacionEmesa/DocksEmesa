-- ===========================================================================
-- 036_operarios_sincronizacion_e_invitaciones.sql
-- Base aditiva para el nuevo modelo de acceso:
--   * datos de operarios sincronizados desde el origen corporativo;
--   * invitaciones controladas para usuarios con correo;
--   * historial de ejecuciones de sincronización.
--
-- Esta migración NO retira todavía operarios_login ni el login anterior.
-- ===========================================================================

begin;

alter table if exists public.usuarios
    add column if not exists email_tecnico text,
    add column if not exists requiere_cambio_password boolean not null default false,
    add column if not exists tipo_registro text;

create unique index if not exists usuarios_email_tecnico_unico
    on public.usuarios (lower(email_tecnico))
    where email_tecnico is not null;

alter table if exists public.usuarios
    drop constraint if exists usuarios_tipo_registro_valido;

alter table if exists public.usuarios
    add constraint usuarios_tipo_registro_valido
    check (tipo_registro is null or tipo_registro in ('INVITACION', 'OPERARIO'));

create table if not exists public.operarios_corporativos (
    id uuid primary key default gen_random_uuid(),
    numero_operario text not null,
    nombre text not null,
    correo text,
    activo boolean not null default true,
    origen text not null default 'EMESA',
    fecha_alta_origen timestamptz,
    fecha_ultima_sincronizacion timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (numero_operario)
);

create index if not exists operarios_corporativos_activo_idx
    on public.operarios_corporativos (activo);

create unique index if not exists operarios_corporativos_correo_unico
    on public.operarios_corporativos (lower(correo))
    where correo is not null;

create table if not exists public.invitaciones_registro (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    tipo_usuario text not null,
    proveedor_id uuid references public.proveedores(id) on delete set null,
    rol_id uuid references public.roles(id) on delete set null,
    estado text not null default 'PENDIENTE',
    creado_por uuid references public.usuarios(id) on delete set null,
    creado_at timestamptz not null default now(),
    caduca_at timestamptz not null default (now() + interval '7 days'),
    usado_at timestamptz,
    supabase_user_id uuid,
    constraint invitaciones_registro_tipo_usuario_valido
        check (tipo_usuario in ('INTERNO', 'EXTERNO')),
    constraint invitaciones_registro_estado_valido
        check (estado in ('PENDIENTE', 'ENVIADA', 'ACEPTADA', 'CADUCADA', 'CANCELADA'))
);

create unique index if not exists invitaciones_registro_pendiente_email_unico
    on public.invitaciones_registro (lower(email))
    where estado in ('PENDIENTE', 'ENVIADA');

create table if not exists public.sincronizaciones_operarios (
    id uuid primary key default gen_random_uuid(),
    inicio timestamptz not null default now(),
    fin timestamptz,
    estado text not null default 'EN_CURSO',
    registros_leidos integer not null default 0,
    registros_nuevos integer not null default 0,
    registros_actualizados integer not null default 0,
    registros_inactivados integer not null default 0,
    registros_sin_cambios integer not null default 0,
    errores integer not null default 0,
    detalle text,
    ejecutado_por uuid references public.usuarios(id) on delete set null,
    constraint sincronizaciones_operarios_estado_valido
        check (estado in ('EN_CURSO', 'COMPLETADA', 'ERROR'))
);

alter table public.operarios_corporativos enable row level security;
alter table public.invitaciones_registro enable row level security;
alter table public.sincronizaciones_operarios enable row level security;

-- Estas tablas son administrativas. La aplicación las consulta y modifica
-- exclusivamente mediante el backend con clave privada; no se exponen a
-- anon ni authenticated a través de la Data API.
revoke all on table public.operarios_corporativos from anon, authenticated;
revoke all on table public.invitaciones_registro from anon, authenticated;
revoke all on table public.sincronizaciones_operarios from anon, authenticated;
grant select, insert, update on table public.operarios_corporativos to service_role;
grant select, insert, update on table public.invitaciones_registro to service_role;
grant select, insert, update on table public.sincronizaciones_operarios to service_role;

comment on table public.operarios_corporativos is
    'Copia de identidad corporativa sincronizada desde SMSS/DataLake. No contiene credenciales.';
comment on column public.usuarios.email_tecnico is
    'Identidad interna de Supabase para operarios sin correo real; no se muestra al usuario.';
comment on column public.usuarios.requiere_cambio_password is
    'El administrador restableció una contraseña temporal y debe cambiarse tras el siguiente acceso.';

commit;
