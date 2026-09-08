-- Solicitudes manuales para que el agente instalado en la red corporativa
-- ejecute una sincronización sin exponer el DataLake a la aplicación web.

begin;

create table if not exists public.solicitudes_sincronizacion_operarios (
    id uuid primary key default gen_random_uuid(),
    estado text not null default 'PENDIENTE',
    solicitado_por uuid references public.usuarios(id) on delete set null,
    solicitado_en timestamptz not null default now(),
    iniciado_en timestamptz,
    finalizado_en timestamptz,
    resultado jsonb,
    error text,
    constraint solicitudes_sincronizacion_operarios_estado_valido
        check (estado in ('PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'ERROR', 'CANCELADA'))
);

create index if not exists solicitudes_sincronizacion_operarios_pendientes_idx
    on public.solicitudes_sincronizacion_operarios (solicitado_en)
    where estado = 'PENDIENTE';

alter table public.solicitudes_sincronizacion_operarios enable row level security;
revoke all on table public.solicitudes_sincronizacion_operarios from anon, authenticated;
grant select, insert, update on table public.solicitudes_sincronizacion_operarios to service_role;

comment on table public.solicitudes_sincronizacion_operarios is
    'Cola de solicitudes manuales procesada por el agente instalado en la red corporativa.';

commit;
