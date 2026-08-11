create table public.product_categories (

    id uuid primary key default gen_random_uuid(),


    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,


    name text not null,


    code text,


    description text,


    default_operation_type text
        check(
            default_operation_type in
            (
                'loading',
                'unloading'
            )
        ),


    default_duration_minutes integer
        default 60,


    active boolean
        default true,


    created_at timestamptz
        default now()

);



create table public.products (

    id uuid primary key default gen_random_uuid(),


    product_category_id uuid not null
        references public.product_categories(id)
        on delete cascade,


    name text not null,


    code text,


    description text,


    active boolean
        default true,


    created_at timestamptz
        default now()

);



create table public.supplier_product_categories (

    id uuid primary key default gen_random_uuid(),


    supplier_id uuid not null
        references public.suppliers(id)
        on delete cascade,


    product_category_id uuid not null
        references public.product_categories(id)
        on delete cascade,


    active boolean
        default true,


    created_at timestamptz
        default now(),


    unique(
        supplier_id,
        product_category_id
    )

);