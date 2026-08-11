create table public.dock_product_categories (

    id uuid primary key default gen_random_uuid(),


    dock_id uuid not null
        references public.docks(id)
        on delete cascade,


    product_category_id uuid not null
        references public.product_categories(id)
        on delete cascade,


    operation_type text not null
        check(
            operation_type in
            (
                'loading',
                'unloading'
            )
        ),


    duration_minutes integer
        default 60,


    active boolean
        default true,


    created_at timestamptz
        default now(),


    unique(
        dock_id,
        product_category_id,
        operation_type
    )

);



create table public.supplier_dock_permissions (

    id uuid primary key default gen_random_uuid(),


    supplier_id uuid not null
        references public.suppliers(id)
        on delete cascade,


    dock_id uuid not null
        references public.docks(id)
        on delete cascade,


    product_category_id uuid
        references public.product_categories(id)
        on delete cascade,


    operation_type text
        check(
            operation_type in
            (
                'loading',
                'unloading'
            )
        ),


    valid_from date,

    valid_until date,


    active boolean
        default true,


    created_at timestamptz
        default now()

);