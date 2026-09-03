-- ===========================================================================
-- 033_identidad_operario.sql
-- Identidad corporativa de los usuarios internos.
--
-- Esta migración es aditiva: no modifica roles, plantas, proveedores ni
-- credenciales de Supabase Auth. La validación contra la BBDD corporativa se
-- incorporará en una siguiente fase, cuando se confirme su origen y contrato.
-- ===========================================================================

begin;

alter table if exists public.usuarios
    add column if not exists numero_operario text,
    add column if not exists origen_operario text,
    add column if not exists tipo_usuario_forzado text;

-- Un operario solo puede estar vinculado a un perfil de la aplicación.
-- Se permiten NULL para proveedores y usuarios sin vínculo corporativo.
create unique index if not exists usuarios_numero_operario_unico
    on public.usuarios (numero_operario)
    where numero_operario is not null;

-- Origen conocido del identificador corporativo. El NULL permite una
-- migración progresiva de datos existentes.
alter table if exists public.usuarios
    drop constraint if exists usuarios_origen_operario_valido;

alter table if exists public.usuarios
    add constraint usuarios_origen_operario_valido
    check (origen_operario is null or origen_operario in ('EMESA', 'MAPEX'));

-- La única excepción al comportamiento por defecto (operario = interno) se
-- registra de forma explícita, sin mezclarla con el rol de la aplicación.
alter table if exists public.usuarios
    drop constraint if exists usuarios_tipo_usuario_forzado_valido;

alter table if exists public.usuarios
    add constraint usuarios_tipo_usuario_forzado_valido
    check (tipo_usuario_forzado is null or tipo_usuario_forzado in ('INTERNO', 'EXTERNO'));

comment on column public.usuarios.numero_operario is
    'Identificador único del operario corporativo; por defecto implica usuario interno.';
comment on column public.usuarios.origen_operario is
    'Sistema de origen de la identidad corporativa: EMESA o MAPEX.';
comment on column public.usuarios.tipo_usuario_forzado is
    'Excepción explícita al tipo derivado de la identidad de operario.';

commit;
