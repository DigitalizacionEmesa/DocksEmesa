create table public.suppliers (

    id uuid primary key default gen_random_uuid(),


    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,


    legal_name text not null,

    commercial_name text,


    tax_id text,

    supplier_code text unique,


    email text,

    phone text,


    address text,

    country_code text,


    active boolean
        not null default true,


    requires_approval boolean
        not null default false,


    created_at timestamptz
        not null default now(),


    updated_at timestamptz
        not null default now()

);



create table public.supplier_users (

    id uuid primary key default gen_random_uuid(),


    supplier_id uuid not null
        references public.suppliers(id)
        on delete cascade,


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    is_admin boolean
        not null default false,


    active boolean
        not null default true,


    created_at timestamptz
        default now(),


    unique(
        supplier_id,
        user_id
    )

);



create table public.supplier_plant_permissions (

    id uuid primary key default gen_random_uuid(),


    supplier_id uuid not null
        references public.suppliers(id)
        on delete cascade,


    plant_id uuid not null
        references public.plants(id)
        on delete cascade,


    valid_from date,

    valid_until date,


    active boolean
        default true,


    created_at timestamptz
        default now(),


    unique(
        supplier_id,
        plant_id
    )

);