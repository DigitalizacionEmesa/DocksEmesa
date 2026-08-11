create table public.bookings (

    id uuid primary key default gen_random_uuid(),


    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,


    plant_id uuid not null
        references public.plants(id)
        on delete restrict,


    warehouse_id uuid not null
        references public.warehouses(id)
        on delete restrict,


    dock_id uuid not null
        references public.docks(id)
        on delete restrict,



    supplier_id uuid
        references public.suppliers(id)
        on delete restrict,


    department_id uuid
        references public.departments(id)
        on delete restrict,



    product_category_id uuid
        references public.product_categories(id)
        on delete restrict,


    product_id uuid
        references public.products(id)
        on delete restrict,



    operation_type text not null
        check(
            operation_type in
            (
                'loading',
                'unloading'
            )
        ),



    origin text not null
        check(
            origin in
            (
                'external',
                'internal',
                'system'
            )
        ),



    starts_at timestamptz not null,


    ends_at timestamptz not null,



    status text not null
        default 'pending'
        check(
            status in
            (
                'pending',
                'confirmed',
                'rejected',
                'cancelled',
                'checked_in',
                'waiting',
                'at_dock',
                'in_progress',
                'completed',
                'no_show'
            )
        ),



    created_by uuid
        references public.profiles(id),


    requested_by uuid
        references public.profiles(id),


    approved_by uuid
        references public.profiles(id),



    -- Datos contacto

    contact_name text,

    contact_email text,

    contact_phone text,



    -- Transporte

    driver_name text,

    driver_phone text,

    vehicle_plate text,

    trailer_plate text,



    -- Información logística

    purchase_order text,

    delivery_note text,

    reference text,


    quantity numeric,


    unit text,



    external_notes text,


    internal_notes text,



    cancellation_reason text,


    cancelled_by uuid
        references public.profiles(id),


    cancelled_at timestamptz,



    created_at timestamptz
        default now(),


    updated_at timestamptz
        default now()

);



alter table public.bookings
add constraint bookings_no_dock_overlap
exclude using gist
(
    dock_id with =,
    tstzrange(
        starts_at,
        ends_at,
        '[)'
    ) with &&
)
where
(
    status in
    (
        'pending',
        'confirmed',
        'checked_in',
        'waiting',
        'at_dock',
        'in_progress'
    )
);



create index idx_bookings_plant
on public.bookings(plant_id);


create index idx_bookings_dock
on public.bookings(dock_id);


create index idx_bookings_supplier
on public.bookings(supplier_id);


create index idx_bookings_dates
on public.bookings(starts_at, ends_at);


create index idx_bookings_status
on public.bookings(status);