create table public.warehouses (

    id uuid primary key default gen_random_uuid(),


    plant_id uuid not null
        references public.plants(id)
        on delete cascade,


    name text not null,


    code text,


    description text,


    active boolean
        not null default true,


    sort_order integer
        not null default 0,


    created_at timestamptz
        not null default now(),


    updated_at timestamptz
        not null default now()

);