create table public.plants (

    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,


    name text not null,

    code text not null unique,


    country_code text,

    city text,

    address text,


    timezone text not null,


    minimum_external_notice_minutes integer
        not null default 120,


    minimum_internal_notice_minutes integer
        not null default 0,


    active boolean
        not null default true,


    created_at timestamptz
        not null default now(),


    updated_at timestamptz
        not null default now()

);



insert into public.plants
(
    organization_id,
    name,
    code,
    country_code,
    city,
    timezone
)
select
    id,
    'Épila',
    'EPI',
    'ES',
    'Épila',
    'Europe/Madrid'
from public.organizations
where code='EME';


insert into public.plants
(
    organization_id,
    name,
    code,
    country_code,
    city,
    timezone
)
select
    id,
    'SCCZ Ostrava',
    'OST',
    'CZ',
    'Ostrava',
    'Europe/Prague'
from public.organizations
where code='EME';