create table public.dock_blocks (

    id uuid primary key default gen_random_uuid(),


    dock_id uuid not null
        references public.docks(id)
        on delete cascade,


    starts_at timestamptz not null,


    ends_at timestamptz not null,


    reason text,


    block_type text
        check(
            block_type in
            (
                'maintenance',
                'failure',
                'cleaning',
                'inventory',
                'other'
            )
        ),


    created_by uuid
        references public.profiles(id),


    created_at timestamptz
        default now()

);