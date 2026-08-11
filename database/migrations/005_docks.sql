create table public.docks (

    id uuid primary key default gen_random_uuid(),


    warehouse_id uuid not null
        references public.warehouses(id)
        on delete cascade,


    name text not null,


    code text,


    description text,


    capacity integer
        not null default 1,


    default_slot_minutes integer
        not null default 30,


    default_operation_minutes integer
        not null default 60,


    access_instructions text,


    active boolean
        not null default true,


    sort_order integer
        not null default 0,


    created_at timestamptz
        not null default now(),


    updated_at timestamptz
        not null default now()

);