create table public.user_roles (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    role_id uuid not null
        references public.roles(id)
        on delete cascade,


    created_at timestamptz
        default now(),


    unique(
        user_id,
        role_id
    )

);



create table public.user_plant_access (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    plant_id uuid not null
        references public.plants(id)
        on delete cascade,


    active boolean
        default true,


    created_at timestamptz
        default now(),


    unique(
        user_id,
        plant_id
    )

);



create table public.user_warehouse_access (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    warehouse_id uuid not null
        references public.warehouses(id)
        on delete cascade,


    active boolean
        default true,


    created_at timestamptz
        default now(),


    unique(
        user_id,
        warehouse_id
    )

);



create table public.user_dock_access (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    dock_id uuid not null
        references public.docks(id)
        on delete cascade,


    active boolean
        default true,


    created_at timestamptz
        default now(),


    unique(
        user_id,
        dock_id
    )

);