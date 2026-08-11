create table public.dock_schedule_rules (

    id uuid primary key default gen_random_uuid(),


    dock_id uuid not null
        references public.docks(id)
        on delete cascade,


    day_of_week integer not null
        check(
            day_of_week between 0 and 6
        ),


    start_time time not null,


    end_time time not null,


    slot_minutes integer
        default 30,


    valid_from date,


    valid_until date,


    operation_type text
        check(
            operation_type in
            (
                'loading',
                'unloading'
            )
        ),


    active boolean
        default true,


    created_at timestamptz
        default now()

);



create table public.dock_schedule_exceptions (

    id uuid primary key default gen_random_uuid(),


    dock_id uuid not null
        references public.docks(id)
        on delete cascade,


    date date not null,


    start_time time,


    end_time time,


    exception_type text not null
        check(
            exception_type in
            (
                'closed',
                'open',
                'modified'
            )
        ),


    reason text,


    created_by uuid
        references public.profiles(id),


    created_at timestamptz
        default now()

);