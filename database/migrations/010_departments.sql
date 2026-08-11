create table public.departments (

    id uuid primary key default gen_random_uuid(),


    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,


    name text not null,


    code text,


    active boolean
        default true,


    created_at timestamptz
        default now(),


    updated_at timestamptz
        default now()

);



create table public.user_department_access (

    id uuid primary key default gen_random_uuid(),


    user_id uuid not null
        references public.profiles(id)
        on delete cascade,


    department_id uuid not null
        references public.departments(id)
        on delete cascade,


    created_at timestamptz
        default now(),


    unique(
        user_id,
        department_id
    )

);