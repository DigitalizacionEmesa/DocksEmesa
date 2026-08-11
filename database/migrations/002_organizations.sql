create table public.organizations (

    id uuid primary key default gen_random_uuid(),

    name text not null,

    code text unique not null,

    active boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);


insert into public.organizations
(
    name,
    code
)
values
(
    'Emesa',
    'EME'
);